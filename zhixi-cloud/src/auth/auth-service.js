import {
  supabase,
  requireSupabase,
  isSupabaseConfigured,
  configError
} from '../lib/supabase.js';
import {
  normalizeAccountName,
  accountToVirtualEmail,
  ACCOUNT_MIN_LENGTH,
  ACCOUNT_MAX_LENGTH
} from '../lib/account.js';

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 72;

function accountError(message, code = 'account_error') {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function getAuthConfigState() {
  return { configured: isSupabaseConfigured, error: configError };
}

export { normalizeAccountName };

function isInvalidCredentials(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'invalid_credentials' || message.includes('invalid login credentials');
}

function isExistingAccountError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'user_already_exists'
    || code === 'email_exists'
    || message.includes('already registered')
    || message.includes('already been registered')
    || message.includes('already exists');
}

function isEmailNotConfirmed(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'email_not_confirmed' || message.includes('email not confirmed');
}

/**
 * 账号密码登录；账号不存在时自动注册。
 * 返回 { session, mode: 'login' | 'register', email }。
 * email 只用于内部提示/调试，不进入登录 UI。
 */
export async function signInOrRegister(accountInput, passwordInput) {
  const client = requireSupabase();
  const account = normalizeAccountName(accountInput);
  const password = String(passwordInput ?? '');

  if (account.length < ACCOUNT_MIN_LENGTH) {
    throw accountError(`账号至少需要 ${ACCOUNT_MIN_LENGTH} 个字符。`);
  }
  if (account.length > ACCOUNT_MAX_LENGTH) {
    throw accountError(`账号最多 ${ACCOUNT_MAX_LENGTH} 个字符。`);
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw accountError(`密码至少需要 ${PASSWORD_MIN_LENGTH} 位。`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw accountError(`密码最多 ${PASSWORD_MAX_LENGTH} 位。`);
  }

  const email = await accountToVirtualEmail(account);

  // 先尝试登录已存在账号。
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data?.session) {
    return { session: signIn.data.session, mode: 'login', email };
  }

  if (signIn.error && !isInvalidCredentials(signIn.error)) {
    if (isEmailNotConfirmed(signIn.error)) {
      throw accountError(
        'Supabase 仍开启了 Confirm email（邮箱确认），账号无法直接登录。请在 Supabase 后台关闭 Confirm email 后重试。',
        'email_confirmation_required'
      );
    }
    throw signIn.error;
  }

  // 登录失败（账号不存在或密码错误）时尝试注册。
  // 已存在账号会由 Supabase 返回 user_already_exists，随后提示密码错误。
  const profileMetadata = {
    username: account,
    display_name: account,
    account_type: 'username_password'
  };
  const signUp = await client.auth.signUp({
    email,
    password,
    options: { data: profileMetadata }
  });

  if (signUp.error) {
    if (isExistingAccountError(signUp.error)) {
      throw accountError('该账号已存在，密码不正确。', 'account_exists');
    }
    throw signUp.error;
  }

  if (signUp.data?.session) {
    return { session: signUp.data.session, mode: 'register', email };
  }

  if (signUp.data?.user) {
    // Confirm email 开启时 signUp 不会直接给 session；已有账号也可能返回
    // identities: [] 的占位 user。
    if (Array.isArray(signUp.data.user.identities) && signUp.data.user.identities.length === 0) {
      throw accountError('该账号已存在，密码不正确。', 'account_exists');
    }
    throw accountError(
      '注册成功但没有拿到登录会话。请在 Supabase 后台关闭 Confirm email（邮箱确认）后重新登录。',
      'email_confirmation_required'
    );
  }

  throw accountError('账号注册失败，请稍后重试。');
}

export function formatAuthError(error, fallback = '登录没有完成，请稍后重试。') {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '');
  const lower = message.toLowerCase();
  if (!message) return fallback;

  if (['account_exists', 'email_confirmation_required', 'account_crypto_unavailable'].includes(code)) {
    return message;
  }
  if (isExistingAccountError(error)) {
    return '该账号已存在，密码不正确。';
  }
  if (isEmailNotConfirmed(error)) {
    return 'Supabase 仍开启了邮箱确认。请在 Supabase 后台关闭 Confirm email 后重试。';
  }
  if (isInvalidCredentials(error)) {
    return '账号或密码不正确。';
  }
  if (code === 'weak_password' || (lower.includes('password') && (lower.includes('least') || lower.includes('length') || lower.includes('weak')))) {
    return '密码不符合 Supabase 的密码策略，请至少使用 6 位密码。';
  }
  if (code === 'signup_disabled' || (lower.includes('signup') && lower.includes('not allowed'))) {
    return 'Supabase 后台禁止了新用户注册，请在 Authentication → Providers 中允许注册。';
  }
  if (
    code.includes('email_provider_disabled')
    || code.includes('email_logins_disabled')
    || (lower.includes('email') && lower.includes('disabled'))
  ) {
    return 'Supabase 后台未开启 Email 登录，请先启用 Email Provider。';
  }
  if (lower.includes('rate limit') || lower.includes('security purposes') || code.includes('rate_limit')) {
    return '操作太频繁，请稍等一会儿再试。';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return '网络连接失败，请检查网络后重试。';
  }
  if (lower.includes('invalid email') || lower.includes('email address')) {
    return '账号映射后的虚拟邮箱未被 Supabase 接受，请换一个更简单的账号重试。';
  }
  if (/[\u4e00-\u9fff]/.test(message)) return message;
  return fallback;
}

export async function getSession() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!supabase) return;
  // 只退出当前设备，不影响同一账号的其他设备。
  await supabase.auth.signOut({ scope: 'local' });
}

export function onAuthStateChange(callback) {
  const client = requireSupabase();
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    // Supabase 文档建议：onAuthStateChange 内不要直接 await 其他 auth 方法。
    window.setTimeout(() => callback(event, session), 0);
  });
  return () => subscription?.unsubscribe();
}

export function getCurrentUserLabel(user) {
  if (!user) return '知隙用户';
  const metadata = user.user_metadata || {};
  if (metadata.username) return String(metadata.username);
  if (metadata.display_name) return String(metadata.display_name);
  return '知隙账号';
}
