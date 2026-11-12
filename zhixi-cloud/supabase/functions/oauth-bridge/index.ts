// ============================================================
// 知隙 · 微信 / QQ OAuth 桥接函数
//
// 路由：
//   GET /functions/v1/oauth-bridge/start?provider=wechat&redirect_to=https://...
//   GET /functions/v1/oauth-bridge/callback?code=...&state=...
//   /start 与 /callback 应位于同一个自定义 host，以校验 state cookie。
//
// 微信与 QQ 共用同一个回调 URL（provider 由服务端 oauth_states 记录决定），
// 便于在开放平台只登记一个 callback 地址。
//
// 设计：
//   微信/QQ 都不是标准 OIDC，Supabase Auth 内置 Provider 不直接支持。
//   本函数在服务端完成 code → access_token → openid/userinfo，
//   再通过 Supabase Admin API 生成一次性 magiclink token_hash，
//   最终把 token_hash 回跳到 Web / Tauri / Capacitor 前端。
//   前端调用 supabase.auth.verifyOtp({ token_hash, type: 'email' }) 换取会话。
//
// 安全：
//   - state 一次性、10 分钟过期；
//   - 同时写入 HttpOnly + SameSite=Lax 的浏览器 cookie，callback 必须匹配，
//     防止攻击者把自己的微信/QQ 授权回跳链接发给受害者（login CSRF）；
//   - 因此 /start 与 /callback 应使用同一个自定义域名。
//
// 必需 secrets：
//   WECHAT_APP_ID / WECHAT_APP_SECRET
//   QQ_APP_ID / QQ_APP_SECRET
//   OAUTH_ALLOWED_REDIRECTS  （逗号分隔的允许回跳地址）
// 可选 secrets：
//   OAUTH_CALLBACK_BASE_URL  （微信/QQ 后台登记的 HTTPS 回调基址，
//                              必须是你能控制并已备案的域名，不能填 supabase.co）
//   OAUTH_EMAIL_DOMAIN       （第三方账号的合成邮箱域名，默认 oauth.example.com）
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WECHAT_APP_ID = Deno.env.get('WECHAT_APP_ID') ?? '';
const WECHAT_APP_SECRET = Deno.env.get('WECHAT_APP_SECRET') ?? '';
const QQ_APP_ID = Deno.env.get('QQ_APP_ID') ?? '';
const QQ_APP_SECRET = Deno.env.get('QQ_APP_SECRET') ?? '';
const OAUTH_CALLBACK_BASE_URL = Deno.env.get('OAUTH_CALLBACK_BASE_URL') ?? '';
const OAUTH_EMAIL_DOMAIN = Deno.env.get('OAUTH_EMAIL_DOMAIN') ?? 'oauth.example.com';
const ALLOWED_REDIRECTS = (Deno.env.get('OAUTH_ALLOWED_REDIRECTS') ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const PROVIDER_LABEL: Record<string, string> = {
  wechat: '微信',
  qq: 'QQ'
};

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_COOKIE = 'zhixi_oauth_state';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char] ?? char));
}

function errorPage(message: string, status = 400): Response {
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>登录失败 · 知隙</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#F6F3EC;color:#1B2922;
    display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{max-width:420px;background:#fff;border:1px solid #E4DED1;border-radius:24px;padding:28px;box-shadow:0 20px 60px -40px #123229}
    h1{font-size:20px;margin:0 0 12px}p{font-size:13px;line-height:1.9;color:#4C5B53;margin:0}
    .mark{display:inline-flex;width:40px;height:40px;align-items:center;justify-content:center;border-radius:12px;background:#123229;color:#DCB978;font-weight:700;margin-bottom:18px}</style>
    </head><body><div class="card"><div class="mark">隙</div><h1>登录没有完成</h1><p>${escapeHtml(message)}</p></div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

function redirectResponse(location: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'cache-control': 'no-store', ...extraHeaders }
  });
}

function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(req: Request, name: string): string {
  const header = req.headers.get('cookie') || '';
  const entry = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return '';
  const raw = entry.slice(name.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeAllowedTarget(target: string): string | null {
  if (!OAUTH_ALLOWED_REDIRECTS.length) return null;
  try {
    const parsed = new URL(target);
    const isCustomScheme = parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
    if (!isCustomScheme && parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return null;
    }
    const allowed = OAUTH_ALLOWED_REDIRECTS.some((raw) => {
      try {
        const candidate = new URL(raw);
        if (candidate.protocol !== parsed.protocol || candidate.host !== parsed.host) return false;
        const basePath = candidate.pathname.replace(/\/+$/, '') || '/';
        const targetPath = parsed.pathname.replace(/\/+$/, '') || '/';
        return targetPath === basePath || targetPath.startsWith(`${basePath}/`);
      } catch {
        return false;
      }
    });
    return allowed ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function withQuery(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
}

function redirectWithError(redirectTo: string, message: string): Response {
  try {
    return redirectResponse(withQuery(redirectTo, {
      auth_error: message.slice(0, 240),
      provider_error: '1'
    }));
  } catch {
    return errorPage(message);
  }
}

function callbackUrlFor(reqUrl: URL): string {
  if (OAUTH_CALLBACK_BASE_URL) return new URL(OAUTH_CALLBACK_BASE_URL).toString();
  const url = new URL(reqUrl.toString());
  url.pathname = url.pathname.replace(/\/start\/?$/, '/callback');
  url.search = '';
  return url.toString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function startOAuth(req: Request, reqUrl: URL): Promise<Response> {
  const provider = reqUrl.searchParams.get('provider') ?? '';
  const requestedRedirect = reqUrl.searchParams.get('redirect_to') ?? '';
  if (!PROVIDER_LABEL[provider]) return errorPage('不支持的登录方式。');
  const redirectTo = normalizeAllowedTarget(requestedRedirect);
  if (!redirectTo) {
    return errorPage('回跳地址不在允许列表中。请检查 OAUTH_ALLOWED_REDIRECTS。');
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return redirectWithError(redirectTo, '服务端缺少 Supabase 配置。');
  }
  if (provider === 'wechat' && (!WECHAT_APP_ID || !WECHAT_APP_SECRET)) {
    return redirectWithError(redirectTo, '微信登录尚未配置，请联系站点管理员。');
  }
  if (provider === 'qq' && (!QQ_APP_ID || !QQ_APP_SECRET)) {
    return redirectWithError(redirectTo, 'QQ 登录尚未配置，请联系站点管理员。');
  }

  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();

  // 顺手清理过期 state，防止表增长。
  await admin.from('oauth_states').delete().lt('expires_at', new Date().toISOString());

  const { error: stateError } = await admin.from('oauth_states').insert({
    state,
    provider,
    redirect_to: redirectTo,
    expires_at: expiresAt
  });
  if (stateError) {
    console.error('oauth_states insert failed', stateError.message);
    return redirectWithError(redirectTo, '登录服务暂时不可用，请稍后重试。');
  }

  const callbackUrl = callbackUrlFor(reqUrl);
  // start 与 callback 必须是同一个 host，浏览器才会带上下面的 state cookie。
  // 部署时请让 VITE_OAUTH_BRIDGE_BASE_URL 与 OAUTH_CALLBACK_BASE_URL 使用同一个
  // 自定义域名（路径可以分别是 /start 与 /callback）。
  const cookie = stateCookie(state);

  if (provider === 'wechat') {
    const authorize = new URL('https://open.weixin.qq.com/connect/qrconnect');
    authorize.searchParams.set('appid', WECHAT_APP_ID);
    authorize.searchParams.set('redirect_uri', callbackUrl);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'snsapi_login');
    authorize.searchParams.set('state', state);
    return redirectResponse(`${authorize.toString()}#wechat_redirect`, { 'set-cookie': cookie });
  }

  const authorize = new URL('https://graph.qq.com/oauth2.0/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', QQ_APP_ID);
  authorize.searchParams.set('redirect_uri', callbackUrl);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'get_user_info');
  return redirectResponse(authorize.toString(), { 'set-cookie': cookie });
}

interface ProviderProfile {
  providerUid: string;
  unionId: string | null;
  displayName: string;
  avatarUrl: string;
}

function normalizeAvatarUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('http://')) return `https://${value.slice(7)}`;
  return value;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  const normalized = text.trim().startsWith('callback(')
    ? text.trim().replace(/^callback\(\s*/, '').replace(/\s*\);\s*$/, '')
    : text;
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error(`OAuth provider returned non-JSON (${response.status})`);
  }
}

async function fetchWechatProfile(code: string): Promise<ProviderProfile> {
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.searchParams.set('appid', WECHAT_APP_ID);
  tokenUrl.searchParams.set('secret', WECHAT_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  const token = await fetchJson(tokenUrl.toString());
  if (!token.access_token || !token.openid) {
    throw new Error(token.errmsg || '微信 access_token 获取失败');
  }
  const userUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  userUrl.searchParams.set('access_token', token.access_token);
  userUrl.searchParams.set('openid', token.openid);
  userUrl.searchParams.set('lang', 'zh_CN');
  const user = await fetchJson(userUrl.toString());
  if (user.errcode) throw new Error(user.errmsg || '微信用户信息获取失败');
  return {
    providerUid: String(token.openid || user.openid),
    unionId: user.unionid ? String(user.unionid) : (token.unionid ? String(token.unionid) : null),
    displayName: String(user.nickname || '微信用户'),
    avatarUrl: normalizeAvatarUrl(String(user.headimgurl || ''))
  };
}

async function fetchQQProfile(code: string, callbackUrl: string): Promise<ProviderProfile> {

  const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('client_id', QQ_APP_ID);
  tokenUrl.searchParams.set('client_secret', QQ_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('redirect_uri', callbackUrl);
  tokenUrl.searchParams.set('fmt', 'json');
  const token = await fetchJson(tokenUrl.toString());
  if (!token.access_token) {
    throw new Error(token.error_description || token.error || 'QQ access_token 获取失败');
  }
  const meUrl = new URL('https://graph.qq.com/oauth2.0/me');
  meUrl.searchParams.set('access_token', token.access_token);
  meUrl.searchParams.set('fmt', 'json');
  const me = await fetchJson(meUrl.toString());
  if (!me.openid) throw new Error('QQ openid 获取失败');

  const userUrl = new URL('https://graph.qq.com/user/get_user_info');
  userUrl.searchParams.set('access_token', token.access_token);
  userUrl.searchParams.set('oauth_consumer_key', QQ_APP_ID);
  userUrl.searchParams.set('openid', me.openid);
  const user = await fetchJson(userUrl.toString());
  if (user.ret !== 0 && user.ret !== '0') {
    throw new Error(user.msg || 'QQ 用户信息获取失败');
  }
  return {
    providerUid: String(me.openid),
    unionId: null,
    displayName: String(user.nickname || 'QQ 用户'),
    avatarUrl: normalizeAvatarUrl(String(user.figureurl_qq_2 || user.figureurl_qq_1 || user.figureurl || ''))
  };
}

async function getMagicLinkToken(provider: string, profile: ProviderProfile, redirectTo: string): Promise<string> {
  const email = `zhixi-${provider}-${(await sha256Hex(profile.providerUid)).slice(0, 28)}@${OAUTH_EMAIL_DOMAIN}`;
  const metadata = {
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    oauth_provider: provider,
    oauth_provider_label: PROVIDER_LABEL[provider]
  };

  // 先看 identity 映射。
  const { data: identity } = await admin
    .from('oauth_identities')
    .select('user_id')
    .eq('provider', provider)
    .eq('provider_uid', profile.providerUid)
    .maybeSingle();

  let userId = identity?.user_id as string | undefined;

  // 第一次登录：先建用户，确保微信/QQ 昵称和头像进入 user_metadata，
  // 这样数据库 trigger 生成的 profiles 不是一串合成邮箱。
  // 如果已经存在（并发或历史数据），继续通过 generateLink 拿到 user id。
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { oauth_provider: provider },
      user_metadata: metadata
    });
    if (!created.error) {
      userId = created.data.user.id;
    }
  }

  const linkResult = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo }
  });
  if (linkResult.error) throw new Error(linkResult.error.message);

  const generated = linkResult.data;
  if (!generated || !generated.properties?.hashed_token) {
    throw new Error('Supabase 未返回 magiclink token');
  }
  userId = userId || generated.user?.id;

  // 如果用户是历史遗留 / 未带 metadata 的账号，补齐头像昵称。
  if (userId) {
    try {
      const current = await admin.auth.admin.getUserById(userId);
      if (!current.error && !current.data.user.user_metadata?.display_name) {
        await admin.auth.admin.updateUserById(userId, { user_metadata: metadata });
      }
    } catch (error) {
      console.warn('oauth user metadata update warning', error);
    }
  }

  if (userId && !identity) {
    const { error: mappingError } = await admin.from('oauth_identities').insert({
      user_id: userId,
      provider,
      provider_uid: profile.providerUid,
      union_id: profile.unionId
    });
    if (mappingError) {
      // 唯一键冲突通常是并发首次登录，重新读取即可。
      console.warn('oauth identity insert warning', mappingError.message);
    }
  } else if (identity) {
    await admin.from('oauth_identities')
      .update({ last_login_at: new Date().toISOString(), union_id: profile.unionId })
      .eq('provider', provider)
      .eq('provider_uid', profile.providerUid);
  }

  return generated.properties.hashed_token;
}

async function handleCallback(req: Request, reqUrl: URL): Promise<Response> {
  const code = reqUrl.searchParams.get('code') ?? '';
  const state = reqUrl.searchParams.get('state') ?? '';
  const providerError = reqUrl.searchParams.get('error_description')
    || reqUrl.searchParams.get('error')
    || '';

  if (!code || !state) {
    // 用户在微信/QQ 页面拒绝授权时，也尽量回到发起登录的 App，而不是停在裸错误页。
    if (state && providerError) {
      const cookieState = readCookie(req, STATE_COOKIE);
      if (cookieState && cookieState === state) {
        const { data: stateRow } = await admin
          .from('oauth_states')
          .select('redirect_to, expires_at')
          .eq('state', state)
          .maybeSingle();
        if (stateRow && new Date(stateRow.expires_at).getTime() >= Date.now()) {
          const redirectTo = stateRow.redirect_to as string;
          await admin.from('oauth_states').delete().eq('state', state);
          return redirectWithError(redirectTo, providerError.slice(0, 200));
        }
      }
    }
    return errorPage('授权参数不完整，请返回知隙重新登录。');
  }

  // 浏览器 cookie 必须与 URL state 一致。若不一致，说明这不是同一个浏览器发起的登录，
  // 直接拒绝，防止 login CSRF。
  const cookieState = readCookie(req, STATE_COOKIE);
  if (!cookieState || cookieState !== state) {
    return errorPage('登录状态与当前浏览器不匹配，请在发起登录的浏览器中完成授权。');
  }

  const { data: stateRow, error: stateError } = await admin
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .maybeSingle();

  if (stateError) {
    console.error('oauth state read failed', stateError.message);
    return errorPage('登录状态校验失败，请重试。');
  }
  if (!stateRow) return errorPage('登录状态已失效，请返回知隙重新登录。');
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await admin.from('oauth_states').delete().eq('state', state);
    return errorPage('登录状态已过期，请返回知隙重新登录。');
  }

  const provider = String(stateRow.provider || '');
  if (!PROVIDER_LABEL[provider]) return errorPage('不支持的登录方式。');
  const redirectTo = stateRow.redirect_to as string;
  await admin.from('oauth_states').delete().eq('state', state);

  try {
    const profile = provider === 'wechat'
      ? await fetchWechatProfile(code)
      : await fetchQQProfile(code, callbackUrlFor(reqUrl));
    const tokenHash = await getMagicLinkToken(provider, profile, redirectTo);
    return redirectResponse(withQuery(redirectTo, {
      token_hash: tokenHash,
      // Supabase JS 文档中，token_hash 的 email magiclink 校验类型为 email。
      type: 'email',
      provider
    }));
  } catch (error) {
    console.error('oauth callback failed', provider, error);
    return redirectWithError(redirectTo, '授权信息获取失败，请稍后重试。');
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/start')) return await startOAuth(req, url);
  if (path.endsWith('/callback')) return await handleCallback(req, url);
  return jsonResponse({
    ok: true,
    service: 'zhixi-oauth-bridge',
    routes: ['/start?provider=wechat|qq&redirect_to=...', '/callback?code=...&state=...']
  });
});
