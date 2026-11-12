# Cloudflare Pages 部署

知隙是纯静态 Vite SPA。构建后把 `dist/` 交给 Cloudflare Pages 即可；登录、数据库、图片都在 Supabase。

默认登录方式：**账号 + 密码**，账号不存在自动注册。前端使用 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，不包含 service_role。

---

## 1. 构建前检查

- [ ] `supabase/migrations/20261112000000_init.sql` 已执行。
- [ ] Supabase **Email Provider** 已开启。
- [ ] **Confirm email** 已关闭。
- [ ] **Allow new users to sign up** 已开启（自动注册需要）。
- [ ] 本地 `.env` 有 URL / anon key。
- [ ] 没有 service_role / `sb_secret_`。
- [ ] `pnpm build` 成功。

---

## 2. 本地构建

```bash
pnpm install
pnpm build
pnpm preview
```

产物：

```text
dist/
  index.html
  _redirects
  assets/...
```

`vite.config.js` 设置了：

```js
base: './'
```

因此 Cloudflare Pages 根路径和子路径都能加载静态资源。

---

## 3. 环境变量

本地 `.env`：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Cloudflare Pages → **Settings → Environment variables**：

- Production：上面两个变量
- Preview：同一组变量（或单独的 Supabase 测试项目）

> Vite 变量在构建时写入 JS。修改后必须在 Cloudflare 重新部署；只改运行时面板不生效。
>
> 只使用 anon public key。`vite.config.js` 和前端都会拒绝常见 service_role / `sb_secret_` 误配。

---

## 4. 连接 Git 并创建 Pages

1. 把项目提交到 GitHub / GitLab 的 `main` 分支。
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择仓库。
4. 构建配置：

| 配置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | Vite |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | 仓库根；如果仓库根是 `zhixi-cloud/`，填该目录 |
| Node version | 20 或以上（环境变量 `NODE_VERSION=20` 可选） |

5. 添加环境变量。
6. Save and Deploy。

首次构建会安装依赖并执行 `vite build`。

---

## 5. SPA fallback

项目包含：

[public/_redirects](../public/_redirects)

```text
/* /index.html 200
```

Vite 会把 `public/_redirects` 复制到 `dist/`，Cloudflare Pages 会应用。  
即使使用 hash 路由，这个 fallback 也能保证直接访问路径不会 404。

---

## 6. 自定义域名与 Supabase

绑定 Cloudflare Pages 自定义域名后：

1. 在 Supabase **Authentication → URL Configuration**：
   - Site URL：`https://your-domain.com`
   - Redirect URLs：`https://your-domain.com`、`https://your-domain.com/**`
2. 不需要为账号密码登录配置微信/QQ 回调。
3. 密码登录没有邮件跳转；Confirm email 关闭即可。
4. 如果以后增加密码重置或换邮箱，需要真实邮箱与 SMTP（当前虚拟邮箱不能收信）。

---

## 7. 部署后验收

- [ ] 打开 Pages 域名，看到「账号登录」，只有账号、密码两个输入框。
- [ ] 输入新账号 + 密码，自动注册并进入。
- [ ] 刷新页面后 session 保持。
- [ ] 退出后用同一账号密码可登录。
- [ ] 同一账号在另一个浏览器登录，看到同一份错题。
- [ ] 另一个账号看不到前一个账号的数据。
- [ ] 上传图片后，另一台设备能看到。
- [ ] Console 没有 Supabase 401/403。
- [ ] 构建日志没有 service_role。
- [ ] Supabase Users 中出现 `xxx@local.test` 或 `z-...@encoded.local.test` 虚拟用户（正常，前端不显示邮箱）。

---

## 8. 缓存与安全头（可选）

Cloudflare Pages 默认会缓存带 hash 的静态资源。可以添加 `public/_headers`：

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
```

项目当前未强制添加，避免影响调试。

---

## 9. 命令行部署（可选）

如果不使用 Git 集成，可以用 Wrangler：

```bash
pnpm build
npx wrangler pages deploy dist --project-name zhixi-cloud
```

需要先登录 Cloudflare。该方式仍需在 Pages 项目里配置环境变量，或构建时通过 shell 注入：

```bash
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... pnpm build
```

不要将密钥写入仓库或命令历史中；建议使用 Cloudflare 环境变量 + Git 构建。

---

## 10. 常见部署问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 页面 404 | 没有 `_redirects` / 输出目录不是 dist | 确认 `public/_redirects` 被复制 |
| 白屏 | `base` 或资源路径错误 | 保持 `base: './'` |
| 登录页显示配置错误 | Pages 环境变量未加 | Settings → Environment variables，重新部署 |
| 登录后刷新回登录页 | URL/key 错误、session 被清 | 检查环境变量；清站点数据重试 |
| 注册成功但不进应用 | Confirm email 没关 | Supabase 关闭 Confirm email |
| `Email logins are disabled` | Email Provider 没开 | 开启 Email Provider |
| 账号存在但登录失败 | 密码错误 | 输入正确密码；自动注册不会覆盖已有账号密码 |
| 两个账号数据串了 | RLS 被绕过 | 检查 service_role 与 policy |
| 修改 env 不生效 | Vite 构建时注入 | Cloudflare 重新构建部署 |
| 中文账号登录失败 | Web Crypto 不可用（非 HTTPS） | 使用 Pages HTTPS 域名 |
| 构建报 service_role | 误配 anon key | 换 anon public key，轮换泄漏密钥 |

更多见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 和 [ACCOUNT_LOGIN.md](ACCOUNT_LOGIN.md)。
