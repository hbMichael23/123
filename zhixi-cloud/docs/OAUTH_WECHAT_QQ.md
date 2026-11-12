# 微信 / QQ 授权登录（历史归档，当前未使用）

> **当前登录页只提供账号 + 密码，已经移除微信/QQ 按钮，也不会加载本页所述的 OAuth 流程。**
>
> 本文和 `supabase/functions/oauth-bridge` 仅作为历史实现保留；Cloudflare Pages 部署不需要它们。账号密码登录配置见 [ACCOUNT_LOGIN.md](ACCOUNT_LOGIN.md)。

微信和 QQ 都不是 Supabase Auth 内置的 OIDC Provider，因此本项目使用一个 Supabase Edge Function 做桥接：

```text
浏览器 / App
  │ 1. 打开 Edge Function /start?provider=wechat|qq&redirect_to=...
  ▼
Edge Function
  │ 2. 生成一次性 state，写 oauth_states，设置 HttpOnly state cookie
  │ 3. 302 到微信 / QQ 授权页
  ▼
微信 / QQ
  │ 4. 用户授权，回跳 Edge Function /callback?code=...&state=...
  ▼
Edge Function
  │ 5. 校验 state + cookie
  │ 6. code → access_token → openid / userinfo
  │ 7. Admin generateLink() 生成一次性 magiclink token_hash
  │ 8. 302 回 Web / custom scheme，携带 token_hash
  ▼
前端
  │ 9. supabase.auth.verifyOtp({ token_hash, type: 'email' })
  ▼
Supabase Session → App 启动
```

这样做的优点：

- 不把 AppSecret 放到前端；
- 不依赖微信/QQ 提供 OIDC discovery；
- Supabase 最终签发的是标准 Supabase session，RLS、Storage、Realtime 全部照常工作；
- Web、Tauri、Android 共用同一套后端流程。

---

## 1. 前置条件

1. **一个可控的 HTTPS 自定义域名**，例如 `api.your-domain.com`。
   - 必须能反向代理或绑定到 Supabase Edge Function。
   - 在中国大陆上线通常需要 ICP 备案。
   - 不要使用 `https://xxxx.supabase.co` 作为微信/QQ 的回调域名：开放平台通常不接受，且你无法证明域名归属。
2. 微信开放平台网站应用（或已获授权的移动应用）。
3. QQ 互联网站应用。
4. Supabase 项目已按 [SUPABASE_SETUP.md](SUPABASE_SETUP.md) 初始化。
5. 正式站域名，例如 `https://your-domain.com`。
6. 原生 App 的 custom scheme 已确定为 `zhixi://auth/callback`。

### 为什么必须同 host

`/start` 会写入 `zhixi_oauth_state` cookie，`/callback` 必须收到同一个 host 的 cookie。否则会提示：

> 登录状态与当前浏览器不匹配

所以：

- `VITE_OAUTH_BRIDGE_BASE_URL` → `https://api.your-domain.com/functions/v1/oauth-bridge`
- `OAUTH_CALLBACK_BASE_URL` → `https://api.your-domain.com/functions/v1/oauth-bridge/callback`

两者 host 必须一致。路径可以不同，反向代理需要保留 cookie 头。

---

## 2. 自定义域名接入 Edge Function

有三种常见方式，任选一种：

### A. Supabase Custom Domain

如果项目计划支持 Custom Domain：

1. Supabase Dashboard → Project Settings → Custom Domains。
2. 绑定 `api.your-domain.com`，按提示添加 CNAME / TXT。
3. 等证书签发完成。
4. Function URL 变为：

```text
https://api.your-domain.com/functions/v1/oauth-bridge
```

### B. Cloudflare Worker 反向代理

```js
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(
      incoming.pathname + incoming.search,
      'https://YOUR_PROJECT_REF.supabase.co'
    );
    const headers = new Headers(request.headers);
    headers.set('host', 'YOUR_PROJECT_REF.supabase.co');
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual'
    });
    // 保留 Set-Cookie、Location 等响应头
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
};
```

把 Worker 路由绑定到 `api.your-domain.com/functions/v1/oauth-bridge/*`。

> 注意：`Set-Cookie` 的 Domain 属性不要被代理改写到不同 host。  
> 如果使用 Nginx，配置 `proxy_pass` 且不要过滤 `Set-Cookie`、`Cookie`。

### C. 自建 Nginx

```nginx
location /functions/v1/oauth-bridge/ {
    proxy_pass https://YOUR_PROJECT_REF.supabase.co/functions/v1/oauth-bridge/;
    proxy_set_header Host YOUR_PROJECT_REF.supabase.co;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_pass_request_headers on;
    proxy_cookie_domain YOUR_PROJECT_REF.supabase.co api.your-domain.com;
    proxy_redirect off;
}
```

生产环境请让 TLS 终止在 Nginx，并把 `api.your-domain.com` 的证书配好。

---

## 3. 微信开放平台

### 3.1 创建网站应用

1. 登录 [微信开放平台](https://open.weixin.qq.com/)。
2. 完成开发者资质认证。
3. 创建「网站应用」，填写网站名称、网站地址、应用简介等。
4. 等待审核通过。
5. 在应用详情中获取：
   - `AppID`
   - `AppSecret`

### 3.2 配置授权回调域

在网站应用详情 → 开发信息 → **授权回调域**：

```text
api.your-domain.com
```

只填域名，不带 `https://`，不带路径。  
授权实际回跳地址为：

```text
https://api.your-domain.com/functions/v1/oauth-bridge/callback
```

这个路径必须在授权回调域之下，因此 `/functions/v1/oauth-bridge/callback` 会被接受。

### 3.3 确认使用的 scope

本项目使用：

```text
snsapi_login
```

这是微信「网站应用扫码登录」的 scope。用户扫码后，Edge Function 通过：

- `https://api.weixin.qq.com/sns/oauth2/access_token`
- `https://api.weixin.qq.com/sns/userinfo`

获取 `openid`、`unionid`、昵称、头像。

### 3.4 常见审核问题

- 网站必须能正常访问，且内容与申请名称一致。
- 授权回调域必须与备案主体 / 网站主体一致（以微信当前规则为准）。
- 审核期间不要把测试域名和正式域名混用。
- AppSecret 只出现一次，立即保存到 Supabase secrets，不要提交到 git。

---

## 4. QQ 互联

### 4.1 创建应用

1. 登录 [QQ 互联](https://q.qq.com/)。
2. 创建「网站应用」。
3. 填写网站信息，提交审核。
4. 获取：
   - `APP ID`
   - `APP Key`

### 4.2 配置回调地址

在应用的开发配置中填写完整回调 URL：

```text
https://api.your-domain.com/functions/v1/oauth-bridge/callback
```

QQ 的回调地址要求通常比微信更严格：协议、域名、路径、末尾斜杠都必须完全一致。

本项目的 Edge Function 在 QQ token 交换时使用同一个 callback URL，因此不要在平台上额外添加 `?provider=qq` 之类的 query。

### 4.3 scope

本项目使用：

```text
get_user_info
```

获取 openid、昵称、头像。QQ 不返回微信那种 unionid；本项目只用 `openid` 作为 `oauth_identities.provider_uid`。

---

## 5. Supabase secrets

复制模板：

```bash
cp supabase/.env.functions.example supabase/.env.functions
```

填写：

```dotenv
WECHAT_APP_ID=wx...
WECHAT_APP_SECRET=...
QQ_APP_ID=...
QQ_APP_SECRET=...

OAUTH_CALLBACK_BASE_URL=https://api.your-domain.com/functions/v1/oauth-bridge/callback
OAUTH_ALLOWED_REDIRECTS=https://your-domain.com,zhixi://auth/callback
OAUTH_EMAIL_DOMAIN=oauth.your-domain.com
```

说明：

- `OAUTH_ALLOWED_REDIRECTS` 是**最终回跳地址** allowlist，不是 provider 回调地址。Web 用正式站 URL，原生 App 用 `zhixi://auth/callback`。多个用英文逗号分隔，不能有空格以外的通配符。
- `OAUTH_EMAIL_DOMAIN` 不需要能收信，但必须是合法域名格式。建议使用你控制的子域名。
- 微信/QQ 的账号会映射成 `zhixi-wechat-<hash>@oauth.your-domain.com` 形式的 Supabase 用户。
- 不要把 `OAUTH_CALLBACK_BASE_URL` 填成 `/start`，必须是 `/callback`。

设置 secrets：

```bash
supabase secrets set --env-file supabase/.env.functions
```

或逐个：

```bash
supabase secrets set WECHAT_APP_ID=... WECHAT_APP_SECRET=...
supabase secrets set QQ_APP_ID=... QQ_APP_SECRET=...
supabase secrets set OAUTH_CALLBACK_BASE_URL=...
supabase secrets set OAUTH_ALLOWED_REDIRECTS=...
supabase secrets set OAUTH_EMAIL_DOMAIN=...
```

部署：

```bash
supabase functions deploy oauth-bridge --no-verify-jwt
```

`verify_jwt = false` 已写在 `supabase/config.toml`。如果手动部署时忘记 `--no-verify-jwt`，浏览器 GET 会收到 401。

---

## 6. Supabase Auth URL

在 Supabase Dashboard → Authentication → URL Configuration：

**Site URL**

```text
https://your-domain.com
```

**Redirect URLs**

```text
https://your-domain.com
https://your-domain.com/**
http://localhost:5173
http://localhost:5173/**
zhixi://auth/callback
```

`generateLink({ options: { redirectTo } })` 的 redirectTo 必须命中 allowlist。  
如果登录完成后返回 `Invalid redirect URL`，先检查这里。

---

## 7. 前端环境变量

> 以下变量属于历史 OAuth 方案；当前前端账号密码登录不会读取它们。

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=...

# 历史 OAuth 方案使用
VITE_OAUTH_BRIDGE_BASE_URL=https://api.your-domain.com/functions/v1/oauth-bridge
VITE_APP_URL=https://your-domain.com
VITE_NATIVE_DEEP_LINK=zhixi://auth/callback
```

修改后重启 Vite 或重新构建。

---

## 8. 原生 App 回跳

### Tauri

- `src-tauri/tauri.conf.json` 已配置 `plugins.deep-link.desktop.schemes = ["zhixi"]`。
- `src-tauri/src/main.rs` 已注册 `tauri-plugin-deep-link` 与 `single-instance`。
- Windows 安装包会写入注册表，macOS 会写入 bundle 的 URL types。
- 开发模式可以运行 `pnpm tauri:dev` 后手动触发回调调试。

### Capacitor Android

首次生成 Android 工程后运行：

```bash
pnpm android:patch
```

它会向 `AndroidManifest.xml` 的 `MainActivity` 添加：

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="zhixi" android:host="auth" android:pathPrefix="/callback" />
</intent-filter>
```

并设置 `android:launchMode="singleTask"`。

### 回跳地址 allowlist

以下两处都要有 `zhixi://auth/callback`：

1. Supabase Auth → Redirect URLs；
2. Edge Function `OAUTH_ALLOWED_REDIRECTS`。

---

## 9. 完整测试步骤

### 9.1 测试 start 路由

在浏览器打开（把域名换掉）：

```text
https://api.your-domain.com/functions/v1/oauth-bridge/start?provider=wechat&redirect_to=https%3A%2F%2Fyour-domain.com
```

预期：

- 302 到 `open.weixin.qq.com`；
- 响应头有 `Set-Cookie: zhixi_oauth_state=...; HttpOnly; Secure; SameSite=Lax`；
- `oauth_states` 表出现一行，`expires_at` 约 10 分钟后。

如果返回：

- `回跳地址不在允许列表中` → `OAUTH_ALLOWED_REDIRECTS` 配置错误；
- `微信登录尚未配置` → secrets 没生效，重新部署；
- 401 → 部署时没有关闭 JWT 校验。

### 9.2 完成授权

用微信扫码或 QQ 登录。callback 成功时：

- Edge Function 返回 302；
- Location 是 `https://your-domain.com/?token_hash=...&type=email&provider=wechat`，或原生 `zhixi://auth/callback?...`；
- `oauth_identities` 出现 provider + provider_uid 的映射；
- Supabase Auth → Users 出现一个合成邮箱用户；
- 前端 `verifyOtp` 成功后进入错题本。

### 9.3 检查登录 CSRF 防护

复制 callback URL 到另一个浏览器（或用无痕窗口）打开：

- 应提示“登录状态与当前浏览器不匹配”；
- 不应登录成功。

### 9.4 检查 RLS

登录后，用另一个账号验证无法读取该账号数据，见 [SUPABASE_SETUP.md](SUPABASE_SETUP.md) 的两账号验证。

---

## 10. 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `redirect_uri` 参数错误（微信） | 回调域名未在开放平台配置，或路径不在授权域下 | 检查授权回调域与 `OAUTH_CALLBACK_BASE_URL` |
| `10003` / `redirect uri is illegal`（QQ） | 回调 URL 与平台登记不完全一致 | 逐字符比对协议、域名、路径、末尾斜杠 |
| `登录状态与当前浏览器不匹配` | `/start` 与 `/callback` host 不同；cookie 被代理丢弃；浏览器禁用 cookie | 统一自定义域名，检查代理 Set-Cookie |
| `登录状态已失效` | state 过期（10 分钟）或被使用过 | 返回 App 重新发起 |
| 401 Unauthorized | Edge Function 仍要求 JWT | 重新部署 `--no-verify-jwt` |
| `Supabase 未返回 magiclink token` | Email provider 未启用 / redirectTo 不合法 | 检查 Auth Email provider 与 Redirect URLs |
| 授权后回到登录页无提示 | callback 报错或 `auth_error` 未展示 | 查看 Edge Function logs 与浏览器地址栏 |
| 原生 App 不回到应用 | custom scheme 未注册 / 热更新后没重新打包 | 检查 Tauri 配置或 AndroidManifest，重装 APK |
| 微信扫码页显示“该链接无法访问” | 自定义域名证书 / 代理失败 | 用 curl 检查 start 路由和 TLS |
| 桌面成功、手机微信里失败 | 微信内置浏览器对网站扫码登录有限制 | 在系统浏览器打开，或用手机号登录 |

Edge Function 日志：

```bash
supabase functions logs oauth-bridge
```

---

## 11. 账号模型与限制

- 每个微信 openid / QQ openid 对应一个 Supabase Auth 用户，使用合成邮箱。
- 手机号账号与微信/QQ 账号目前**不会自动合并**。同一自然人有手机号和微信登录，会得到两个独立账号和两份数据。
- 这是有意的安全取舍：自动合并需要额外的“绑定手机号 / 验证码确认”流程，否则可能把别人的数据合并进来。
- 如果后续要做账号绑定，建议新增一张 `user_identity_links` 表，并强制用户先登录一个主账号，再在设置页完成验证码确认。

### 移动端微信扫码体验

本流程使用微信开放平台的「网站应用扫码登录」。在手机上从外部浏览器点「微信登录」会打开微信扫码页；如果用户只有一台手机，需要：

- 使用另一台设备扫码；或
- 改用手机号验证码登录；或
- 后续接入微信内 H5 / 公众号 OAuth（需要公众号主体与另一套授权流程，本项目未包含）。

这不是 bug，而是微信网站扫码登录的产品限制。

---

## 12. 安全检查

- [ ] AppSecret 只存在 Supabase secrets，不出现在 git / 前端 / 日志。
- [ ] `OAUTH_ALLOWED_REDIRECTS` 精确匹配正式域名和 `zhixi://auth/callback`。
- [ ] `OAUTH_CALLBACK_BASE_URL` 使用 HTTPS 自定义域名，不是 supabase.co。
- [ ] `/start` 与 `/callback` 同 host，代理保留 cookie。
- [ ] Supabase Auth Redirect URLs 不包含宽泛的 `*`。
- [ ] `oauth_states` 表只允许 service_role 访问；不要给 anon 授权。
- [ ] 测试过把 callback 链接复制到另一个浏览器会被拒绝。
- [ ] 定期清理 `oauth_states`（函数在每次 start 时清理过期行）。
- [ ] 对 `/start` 做速率限制（可在 Cloudflare / Nginx / Supabase 网关层配置）。
