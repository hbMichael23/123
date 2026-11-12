# 常见问题与排查

登录方式：账号 + 密码，自动注册。登录层 → Supabase → 同步 → 图片 → OCR → 部署/打包。

---

## 1. 登录页显示「还差一步配置」

**原因**

- 没有 `.env`，或 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 为空；
- Cloudflare Pages 没有配置环境变量；
- 修改 env 后没有重启 `pnpm dev` / 重新构建部署；
- anon key 被写成 service_role（前端会主动拒绝）。

**处理**

```bash
cp .env.example .env
# 填 URL / anon key
pnpm dev
```

Cloudflare Pages：Settings → Environment variables，Production 和 Preview 都加，然后重新部署。

---

## 2. 账号、密码、自动注册

### 2.1 新账号点登录没有进入

- Supabase **Confirm email** 是否仍开启？必须关闭；
- **Allow new users to sign up** 是否关闭？
- Email Provider 是否开启？
- 密码是否至少 6 位、符合后台策略？
- 看 Console / Network 的 `/auth/v1/signup` 响应。

### 2.2 提示「该账号已存在，密码不正确」

说明该账号之前已经注册过，本次密码与注册时不一致。

- 输入正确密码；或
- 换一个新账号。

自动注册不会重置已有账号密码。

### 2.3 任意字符串账号

- 简单账号：直接映射 `账号@local.test`；
- 中文、空格、符号、emoji：SHA-256 映射到 `z-...@encoded.local.test`；
- 映射需要 HTTPS / localhost 的 Web Crypto；
- 账号不区分大小写，首尾空格忽略；
- 账号 2–64 位；
- 不要修改映射规则，否则老账号会“消失”。

详见 [ACCOUNT_LOGIN.md](ACCOUNT_LOGIN.md)。

### 2.4 想查看账号对应邮箱

前端不展示邮箱。Supabase Dashboard → Authentication → Users 可以看到虚拟邮箱；`user_metadata.username` 是原账号。

### 2.5 忘记密码

当前没有密码找回。虚拟邮箱不能收信，无法走 Supabase 重置密码链接。  
需要后续做恢复码或换绑真实邮箱。

---

## 3. 登录成功后空白 / 刷新回登录页

1. Console 是否有 JS 异常。
2. Network 里 `/rest/v1/questions` 是否 403。
3. Supabase session 是否持久化。
4. URL / anon key 是否来自同一个 Supabase 项目。
5. 是否清过站点数据 / 使用了隐私模式。
6. Cloudflare Pages 是否用了旧构建。

如果 403：检查 RLS policy 与 `user_id`，不是简单的前端问题。

---

## 4. RLS / 账号隔离

| 现象 | 处理 |
| --- | --- |
| 插入报 `new row violates row-level security policy` | 客户端 `user_id` 必须等于当前 `auth.uid()`；检查 insert policy |
| 两个账号看到同一数据 | 检查是否启用 RLS、是否用 service_role、policy 是否 `using (true)` |
| 读不到自己的数据 | 检查 JWT/session、policy、`user_id` |
| Storage 403 | bucket 必须私有；路径第一段必须是 user_id；policy 必须存在 |

不要为了“方便”关 RLS 或把 bucket 改成 public。

---

## 5. 同步

### 5.1 状态一直「有改动待同步」

- 网络不可用；
- 图片上传失败；
- Supabase 429 / 5xx；
- Storage 删除旧对象失败。

本地缓存不会丢，联网/重试后继续。设置页点「立即同步」看 toast 与 Network。

### 5.2 另一台设备不自动刷新

- `questions` / `user_settings` 是否在 Realtime publication；
- 企业网络是否拦截 WSS；
- 切回前台、恢复网络、手动同步都会兜底。

### 5.3 同一账号多端覆盖

- 每题 `updated_at` Last-Write-Wins；
- 复习历史取并集；
- 设备时间严重不准会导致合并异常，请自动对时。

### 5.4 本地缓存

key：

```text
zhixi_wrongbook_v1:<user_id>
```

退出账号后缓存保留；本地缓存不加密，共用设备请清除站点数据。

---

## 6. 图片

- 私有 Storage，签名 URL 24 小时；
- 离线超过有效期后文本可读，图片需联网刷新；
- 上传 5 MB 限制，前端会压缩到 JPEG；
- 导出云端图片需要联网下载；
- 图片裂图：重新登录 / 立即同步刷新签名 URL，检查 bucket policy。

---

## 7. OCR / MathJax

### 7.1 OCR 一直加载

Tesseract 通过 CDN 加载 worker / core / chi_sim 模型：

- cdnjs / unpkg / jsdelivr 是否可访问；
- 首次约 6 MB；
- 公司网络可能拦截；需要改成本地静态资源。

### 7.2 OCR 乱码

- 图片模糊 / 倾斜；
- 公式和手写体不适合 OCR；
- 识别后手动修正 LaTeX，并用 `$...$` / `$$...$$`。

### 7.3 MathJax 不渲染

- CDN 不通；
- 公式符号不配对；
- Tauri 下检查 CSP；
- 不要删除 legacy.css 中 `mjx-container > svg` 的 inline-block 修复。

---

## 8. 构建 / Cloudflare Pages

### 8.1 pnpm 安装报 esbuild 被忽略

项目包含 `pnpm-workspace.yaml`：

```yaml
onlyBuiltDependencies:
  - esbuild
```

如仍报错：

```bash
pnpm approve-builds --all
pnpm rebuild esbuild
```

确保 `node` 在 PATH 中。

### 8.2 构建报 service_role

说明 `VITE_SUPABASE_ANON_KEY` 配错：

1. 去 Supabase 轮换泄漏的 service_role / secret key；
2. 换成 anon public key；
3. 重新构建。

### 8.3 修改 env 不生效

Vite 是构建时注入。Cloudflare Pages 必须重新部署，不能只改运行时变量。

### 8.4 页面 404 / 白屏

- Build output 是否为 `dist`；
- `public/_redirects` 是否复制；
- `base: './'`；
- 看构建日志与浏览器 Network。

---

## 9. Tauri / Capacitor

- 账号密码登录在 WebView 内完成，不需要微信/QQ deep link；
- Tauri `pnpm tauri:build` 需要 Rust >= 1.90、C++ Build Tools、WebView2；
- Android 需要 JDK 21、Android Studio 2024.2.1+、SDK 35；
- `pnpm build` 后再 `pnpm cap:sync`；
- Android 原生导出使用 Filesystem + Share；
- 系统通知仍是浏览器 Notification API，不保证原生后台提醒。

### 9.1 App 白屏

- 先构建 Web；
- 检查 Supabase env 是否在构建时注入；
- `adb logcat` / Tauri devtools 看 console；
- Capacitor 不要直接改 `assets/public`，下次 sync 会覆盖。

---

## 10. 数据恢复

- 设置 → 导出 JSON 定期备份；
- 清站点数据会删除本地缓存，云端数据仍可重新拉取；
- 图片对象与数据库分开放，备份数据库不包含图片二进制；
- 误删题目目前无回收站，管理员可在 SQL 中按 `deleted_at` 恢复（先备份）。

---

## 11. 不要做的事

- 不要把 service_role 放进 `.env`、Cloudflare 环境变量或前端；
- 不要关闭 RLS 解决同步问题；
- 不要把 Storage bucket 改成 public；
- 不要修改账号映射规则后继续使用旧账号；
- 不要开启 Confirm email 却期待一键自动登录；
- 不要在未备份时清空 localStorage。
