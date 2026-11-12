// ============================================================
// 账号 → 虚拟邮箱映射
//
// 页面只让用户看到「账号 + 密码」，不暴露邮箱。
// 为了兼容任意字符串账号，映射规则分两类：
//   1. 简单账号（2-40 位，仅 a-z0-9._-，首尾为字母数字，无连续点）
//      直接得到 `账号小写@local.test`，例如 user_input_name@local.test；
//   2. 其他任意字符串（中文、空格、符号、超长等）
//      对账号做 SHA-256，映射到
//      `z-<hash-base64url>@encoded.local.test`。
//
// 两个域名分开，避免简单账号和哈希账号命名空间冲突。
// 账号会先做 NFKC、去首尾空白、合并连续空白、转小写；
// 因此 Alice 与 alice 视为同一个账号，首尾空格忽略。
// ============================================================

export const ACCOUNT_DOMAIN = 'local.test';
export const ENCODED_ACCOUNT_DOMAIN = 'encoded.local.test';
export const ACCOUNT_MIN_LENGTH = 2;
export const ACCOUNT_MAX_LENGTH = 64;

function accountError(message, code = 'account_validation') {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function normalizeAccountName(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSimpleAccountName(value) {
  const lower = String(value || '').toLowerCase();
  return lower.length >= ACCOUNT_MIN_LENGTH
    && lower.length <= 40
    && /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(lower)
    && !lower.includes('..');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * 返回 Supabase Auth 使用的虚拟邮箱。用户界面永远不展示这个值。
 */
export async function accountToVirtualEmail(accountInput) {
  const account = normalizeAccountName(accountInput);
  if (account.length < ACCOUNT_MIN_LENGTH) {
    throw accountError(`账号至少需要 ${ACCOUNT_MIN_LENGTH} 个字符。`);
  }
  if (account.length > ACCOUNT_MAX_LENGTH) {
    throw accountError(`账号最多 ${ACCOUNT_MAX_LENGTH} 个字符。`);
  }

  const lower = account.toLowerCase();
  if (isSimpleAccountName(lower)) {
    return `${lower}@${ACCOUNT_DOMAIN}`;
  }

  if (!globalThis.crypto?.subtle) {
    throw accountError(
      '当前访问环境不支持安全账号映射。请使用 HTTPS 访问，或改用字母、数字、下划线组成的账号。',
      'account_crypto_unavailable'
    );
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(lower)
  );
  const hash = bytesToBase64Url(new Uint8Array(digest));
  return `z-${hash}@${ENCODED_ACCOUNT_DOMAIN}`;
}
