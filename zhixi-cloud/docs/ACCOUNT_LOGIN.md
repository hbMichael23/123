# 账号密码登录说明

当前登录页只有两个输入框：

- **账号**
- **密码**

页面不显示邮箱、手机号、验证码、微信或 QQ。

---

## 1. 用户看到的行为

| 操作 | 结果 |
| --- | --- |
| 输入一个不存在的账号 + 密码，点「登录 / 自动注册」 | Supabase 创建新用户并直接登录 |
| 输入已存在账号 + 正确密码 | 直接登录 |
| 输入已存在账号 + 错误密码 | 提示「该账号已存在，密码不正确」 |
| 账号少于 2 位 | 前端提示 |
| 密码少于 6 位 | 前端提示 |
| Supabase 仍开启邮箱确认 | 提示去后台关闭 Confirm email |

账号不区分大小写，首尾空格会被忽略；两个账号输入在规范化后相同，会被视为同一个账号。

密码不会被 trim，前后空格也是密码的一部分。

---

## 2. 底层账号 → 虚拟邮箱映射

Supabase Auth 的 Email/Password 接口需要邮箱。前端在浏览器内把账号转换成虚拟邮箱，再调用：

```js
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signUp({ email, password, options: { data: { username, display_name } } })
```

用户全程看不到邮箱。

### 2.1 简单账号（保持可读）

符合以下条件：

- 长度 2–40；
- 只含 `a-z`、`0-9`、`.`、`_`、`-`；
- 首尾是字母或数字；
- 没有连续 `..`。

映射：

```text
user_input_name  →  user_input_name@local.test
Alice            →  alice@local.test
```

### 2.2 任意字符串账号（哈希映射）

中文、空格、符号、emoji、超长账号等，做 NFKC 规范化 + 小写 + SHA-256：

```text
张三  →  z-<sha256-base64url>@encoded.local.test
a+b   →  z-<sha256-base64url>@encoded.local.test
```

- 哈希使用浏览器 Web Crypto；
- 需要 HTTPS 或 localhost；
- 两个域名 `local.test` / `encoded.local.test` 用来隔离简单账号和哈希账号的命名空间，避免碰撞；
- 不可逆，但用户不需要看到邮箱。

实现文件：[src/lib/account.js](../src/lib/account.js)。

### 2.3 登录 / 自动注册流程

```text
用户提交账号 + 密码
        │
        ▼
规范化账号 → 虚拟邮箱
        │
        ▼
signInWithPassword
        │
   ┌────┴─────────────┐
   │ 成功              │ 失败（invalid_credentials）
   ▼                  ▼
进入 App          signUp
                       │
             ┌─────────┴──────────┐
             │ 成功（有 session）  │ 已存在
             ▼                    ▼
        进入 App           账号已存在，密码错误
```

如果 Confirm email 仍开启，`signUp` 不会返回 session，前端会给出明确配置错误。

实现文件：[src/auth/auth-service.js](../src/auth/auth-service.js)。

---

## 3. Supabase 后台配置

### 3.1 开启 Email 登录

Supabase Dashboard：

1. **Authentication → Providers**
2. 找到 **Email**
3. 开启 **Enable Email provider**
4. **Confirm email** 关闭（非常重要）
5. 如果需要允许新账号自动注册：**Allow new users to sign up** 开启

> Confirm email 关闭后，`signUp` 会直接返回 session，才能实现“输入账号密码点一次就登录/注册”。

### 3.2 密码策略

**Authentication → Providers → Email → Password requirements**：

- 最小长度建议 6（前端也是 6）；
- 如果后台要求更强密码，前端会让 Supabase 返回对应错误，用户可看到提示；
- 前端密码上限 72 位。

### 3.3 Site URL

**Authentication → URL Configuration**：

```text
Site URL: https://your-project.pages.dev
Redirect URLs:
https://your-project.pages.dev
https://your-project.pages.dev/**
```

密码登录不依赖邮件跳转，但建议配置正确；如果以后加密码重置邮件，需要真实邮箱（本方案虚拟地址无法收信）。

### 3.4 邮件发送

本方案不会发送确认邮件，也不依赖 SMTP。  
`local.test` / `encoded.local.test` 是保留测试域名，不是真实邮箱，不要用来收信。

---

## 4. 环境变量

本地 `.env`：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Cloudflare Pages：

- Settings → Environment variables（Production 和 Preview 都配置）；
- 变量名同上；
- 只使用 anon public key；
- 禁止 `service_role` / `sb_secret_`；构建脚本和前端都会拦截常见误配。

---

## 5. 多端同步与隔离

登录后：

- `main-cloud.js` 校验 session，没有 session 不 boot 应用；
- 每个用户按 `auth.uid()` 使用独立的 Supabase 数据；
- RLS 保证只能访问自己的 questions / user_settings / storage objects；
- 本地缓存 key 为 `zhixi_wrongbook_v1:<user_id>`；
- 同一账号在多个浏览器/设备登录会同步；
- 不同账号互不可见。

同步实现：[src/cloud/cloud-sync.js](../src/cloud/cloud-sync.js)。

---

## 6. 已知限制

- 没有密码找回：虚拟邮箱不能收信，不能走 Supabase 重置密码邮件；如需要，可在后续做一个“账号恢复码”或换绑真实邮箱的流程。
- 账号映射规则一旦上线不要修改，否则已有账号会映射到新的邮箱，表现为“账号不存在/数据为空”。
- 简单账号与哈希账号使用不同域名，不要修改域名常量。
- 账号大小写不敏感；如果产品需要大小写敏感账号，需要重新设计映射。
- 账号规范化会做 NFKC 和连续空白折叠；全角字符会归一化为半角。
- Supabase 的速率限制仍然生效；频繁注册/登录会触发 `rate limit`。
- 旧的手机号/微信/QQ 账号与新的账号密码体系不是同一批账号，无法用新登录页直接访问。

---

## 7. 相关文件

- [src/lib/account.js](../src/lib/account.js)
- [src/auth/auth-service.js](../src/auth/auth-service.js)
- [src/auth/auth-ui.js](../src/auth/auth-ui.js)
- [src/main-cloud.js](../src/main-cloud.js)
- [cloud.css](../src/styles/cloud.css)
- [Supabase 初始化](SUPABASE_SETUP.md)
- [Cloudflare Pages 部署](DEPLOYMENT.md)
