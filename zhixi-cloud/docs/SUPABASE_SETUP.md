# Supabase 初始化（账号密码登录）

本文配置知隙所需的 Supabase 后端：Email/Password 登录、RLS、私有 Storage、Realtime。

登录页只有账号和密码；前端会把账号映射为虚拟邮箱（[映射说明](ACCOUNT_LOGIN.md)），用户不需要邮箱。

---

## 1. 创建项目

1. 打开 [supabase.com](https://supabase.com/dashboard)，新建项目。
2. 区域选离用户较近的位置（国内用户通常选 Singapore）。
3. 在 **Project Settings → API** 记录：
   - Project URL：`https://xxxx.supabase.co`
   - `anon` public key
4. **Project Settings → API → Exposed schemas** 确认包含 `public`。
5. 确认 Realtime 已启用（新项目默认启用）。

> 不要把 `service_role` key 放进前端或 Cloudflare Pages 环境变量。

---

## 2. 执行数据库迁移

迁移文件：

```text
supabase/migrations/20261112000000_init.sql
```

### 方式 A：Supabase CLI

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 方式 B：Dashboard SQL Editor

打开 **SQL Editor → New query**，粘贴迁移文件并执行。

迁移会创建：

| 对象 | 作用 |
| --- | --- |
| `profiles` | 用户资料 |
| `user_settings` | 标签、提醒设置 |
| `questions` | 错题、复习历史、软删除 |
| `oauth_identities` / `oauth_states` | 历史 OAuth 表，当前账号密码登录不使用 |
| `question-images` bucket | 私有图片桶，5 MB，jpeg/png/webp |
| RLS policies | 按 `auth.uid()` 隔离 |
| Realtime publication | `questions`、`user_settings` |

### 验证

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'user_settings', 'questions');

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'question-images';
```

预期：`rowsecurity = true`；bucket `public = false`。

---

## 3. 配置 Email/Password 登录

进入 **Authentication → Providers → Email**。

必须按下面设置：

| 设置 | 值 | 原因 |
| --- | --- | --- |
| Enable Email provider | **开启** | 前端调用 Email/Password API |
| Confirm email | **关闭** | 开启后 `signUp` 不返回 session，无法一键登录 |
| Allow new users to sign up | **开启** | 账号不存在时自动注册 |
| Secure email change | 可关 | 本方案不换邮箱 |
| Minimum password length | 6（或更高） | 前端默认 6 |
| Email OTP / Magic Link | 不需要 | 登录页不用 |

> 关闭 Confirm email 是硬性要求。  
> 如果忘记关闭，前端会提示：`注册成功但没有拿到登录会话。请在 Supabase 后台关闭 Confirm email...`

### SMTP

本方案不需要发送确认邮件，也不提供密码找回邮件。

- 不配置自定义 SMTP 也可以；
- 虚拟邮箱 `@local.test` / `@encoded.local.test` 不是真实邮箱，不能接收密码重置邮件；
- 后续如果需要找回密码，需要另做恢复码或换绑真实邮箱流程。

### 密码策略

Supabase 后台如果设置了更复杂的密码策略，前端仍会把 Supabase 的错误显示给用户。  
前端限制：6–72 位。

### 限流

**Authentication → Rate Limits** 建议保留默认限制。登录/注册过于频繁会触发 `rate limit`，前端会提示稍后再试。

---

## 4. URL Configuration

**Authentication → URL Configuration**：

```text
Site URL:
https://your-project.pages.dev

Redirect URLs:
https://your-project.pages.dev
https://your-project.pages.dev/**
```

本地开发可以再加：

```text
http://localhost:5173
http://localhost:5173/**
```

账号密码登录不依赖邮件跳转，但 Site URL 建议与 Cloudflare Pages 正式域名一致。

---

## 5. 前端环境变量

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Cloudflare Pages 在 **Settings → Environment variables** 配置同名变量（Production + Preview）。

> 只使用 anon public key。`vite.config.js` 会在构建时拒绝 service_role JWT / `sb_secret_`；`src/lib/supabase.js` 在运行时也会拒绝。

---

## 6. 验证登录 / 自动注册

1. `pnpm dev`。
2. 输入一个全新账号，例如 `kaoyan_2027`，密码至少 6 位。
3. 点「登录 / 自动注册」。
4. 应直接进入错题本，无需邮箱确认。
5. 刷新页面，session 保持。
6. Supabase Dashboard → Authentication → Users 会出现：
   - 简单账号：`kaoyan_2027@local.test`
   - 中文/符号账号：`z-...@encoded.local.test`
   - `user_metadata.username` 保存用户输入的原账号，账号卡显示该账号。
7. 退出登录，用同一账号密码再登录，数据仍在。
8. 换一个浏览器登录同一账号，能拉到同一份云端数据。

### 账号不存在 vs 密码错误

- 不存在：`signIn` 失败 → `signUp` 成功 → session；
- 存在且密码正确：`signIn` 成功；
- 存在但密码错误：`signIn` 失败 → `signUp` 返回已存在 → 前端提示密码错误。

---

## 7. RLS 与 Storage

迁移 SQL 已启用：

- `questions`、`user_settings`、`profiles` RLS；
- 所有 policy 按 `auth.uid()`；
- Storage bucket `question-images` 私有；
- Storage policy 要求路径第一段 = `auth.uid()`；
- 图片通过 24 小时签名 URL 读取。

上线前用两个账号验证隔离：

1. 账号 A 登录，录入一道带图错题；
2. 账号 B 登录，看不到 A 的题目；
3. B 直接访问 A 的图片路径应被拒绝；
4. 如果互相可见，立即停用并检查是否错误使用 service_role 或关闭了 RLS。

---

## 8. Realtime

迁移 SQL 会把 `questions`、`user_settings` 加入 `supabase_realtime` publication。

在 **Database → Replication** 确认这两张表在 publication 中。  
Realtime 不工作时，前端仍有前台定时兜底和手动「立即同步」。

---

## 9. 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 登录页显示「还差一步配置」 | 环境变量缺失 | 填 URL / anon key，重启或重新构建 |
| `Email logins are disabled` | Email Provider 未开启 | Authentication → Providers → Email 开启 |
| 注册成功但没有 session | Confirm email 仍开启 | 关闭 Confirm email |
| `Signups not allowed` | 禁止新用户注册 | 开启 Allow new users to sign up |
| 账号已存在，密码不正确 | 账号存在但密码错误 | 输入正确密码，或换账号 |
| 密码错误但提示注册失败 | 弱密码策略 | 使用至少 6 位、符合后台策略的密码 |
| 想用中文/符号账号 | 已支持哈希映射 | 确认 HTTPS；Web Crypto 在安全上下文可用 |
| `rate limit` | 请求过于频繁 | 等待后重试 |
| 刷新后回登录页 | session 未持久化/环境变量错 | 检查 Supabase URL/key，清站点数据后重试 |
| 两个账号看到同一数据 | RLS 被绕过 | 检查 service_role、policy、bucket |

更多见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

---

## 10. 安全清单

- [ ] 前端只包含 anon key。
- [ ] Cloudflare Pages 环境变量没有 service_role。
- [ ] `vite build` 无 service_role 拦截报错。
- [ ] Email Provider 开启，Confirm email 关闭。
- [ ] 允许新用户注册（如果业务需要自动注册）。
- [ ] 业务表 RLS 全部开启。
- [ ] Storage bucket 私有。
- [ ] 两个测试账号互相不可见。
- [ ] Site URL 是 Cloudflare Pages 正式域名。
- [ ] 定期备份数据库 / 导出 JSON。
