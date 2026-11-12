# 知隙 · 经济学考研错题本

> 面向顶尖 985 经济学考研的云端错题本。Vite + Supabase，部署在 Cloudflare Pages。
>
> **登录方式：自定义账号 + 密码。登录页只有两个输入框，不需要邮箱、手机号、验证码、微信或 QQ。**

- **前端**：Vite + Tailwind CSS（编译版）+ 原生 JavaScript
- **登录**：账号密码 → 前端映射虚拟邮箱 → Supabase Email/Password
- **后端**：Supabase Auth / Postgres / RLS / Storage / Realtime
- **部署**：Cloudflare Pages（纯静态 `dist/`）
- **公式**：MathJax 3（CDN 动态加载，多 CDN 回退）
- **OCR**：Tesseract.js（浏览器本地识别，图片不发送给 OCR 服务）
- **打包**：Tauri 2 / Capacitor 7 可选

---

## 1. 功能

1. 自定义账号 + 密码登录；账号不存在时点一次「登录 / 自动注册」直接创建。
2. 账号可为任意字符串（中文、空格、符号等），不需要邮箱格式。
3. 错题编辑：题干、答案、错因、图片、标签、掌握程度。
4. 本地 OCR、MathJax 公式、艾宾浩斯复习、到期提醒。
5. 随机刷题、标签筛选、正确率统计。
6. JSON 导入导出（合并 / 覆盖），Tauri/Android 原生保存面板。
7. Supabase 云端同步：错题、复习历史、标签、提醒设置、图片。
8. 账号间 RLS 隔离；同一账号多设备自动同步。
9. 移动端优先响应式布局。

登录页已移除：手机号、短信验证码、微信、QQ、邮箱输入框。

---

## 2. 账号密码如何工作

用户只看到：

```text
账号：[ user_input_name ]
密码：[ ******** ]
[ 登录 / 自动注册 ]
```

前端在浏览器内把账号转换成虚拟邮箱，再调用 Supabase：

```js
supabase.auth.signInWithPassword({ email, password })
// 账号不存在时：
supabase.auth.signUp({ email, password, options: { data: { username } } })
```

### 2.1 简单账号

`2-40` 位、只含字母/数字/`._-`、首尾字母数字、无连续点：

```text
user_input_name → user_input_name@local.test
Alice           → alice@local.test
```

### 2.2 任意字符串账号

中文、空格、符号、emoji、超长账号：

```text
张三 → z-<sha256-base64url>@encoded.local.test
```

- 账号会做 NFKC、去首尾空白、合并连续空白、转小写；
- 哈希在浏览器 Web Crypto 中计算；
- `local.test` / `encoded.local.test` 是保留测试域名，不是真实邮箱；
- 用户全程看不到虚拟邮箱；
- 两个域名分离，避免简单账号与哈希账号碰撞。

实现见 [src/lib/account.js](src/lib/account.js) 和 [src/auth/auth-service.js](src/auth/auth-service.js)。

### 2.3 自动注册

```text
先 signInWithPassword
  ├─ 成功 → 进入 App
  └─ invalid_credentials → signUp
        ├─ 成功且有 session → 进入 App
        └─ 已存在 → 「该账号已存在，密码不正确」
```

> Supabase 必须关闭 **Confirm email**，否则 `signUp` 只返回用户、不返回 session，无法一键登录。

---

## 3. 目录结构

```text
zhixi-cloud/
├── index.html
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── capacitor.config.ts
├── .env.example
├── .gitignore
├── public/_redirects
├── resources/
├── scripts/patch-android-manifest.mjs
├── src/
│   ├── main.js                    # 样式 / App 加载，动态加载登录入口
│   ├── main-cloud.js              # session 守卫、登录后 boot、云同步编排
│   ├── auth/
│   │   ├── auth-service.js        # 账号 → 虚拟邮箱、登录/自动注册
│   │   └── auth-ui.js             # 只有账号 + 密码的登录页
│   ├── lib/
│   │   ├── account.js             # 账号规范化与虚拟邮箱映射
│   │   ├── supabase.js            # URL / anon key，禁止 service_role
│   │   └── platform.js            # Web / Tauri / Capacitor
│   ├── cloud/
│   │   ├── cloud-sync.js
│   │   └── cloud-ui.js
│   ├── app/app.js                 # 原错题本完整业务/UI
│   └── styles/
│       ├── legacy.css
│       ├── tailwind.css
│       └── cloud.css
├── supabase/
│   ├── config.toml
│   ├── migrations/20261112000000_init.sql
│   └── functions/oauth-bridge/    # 历史 OAuth 代码，当前登录 UI 不加载
├── src-tauri/
├── docs/
│   ├── ACCOUNT_LOGIN.md
│   ├── SUPABASE_SETUP.md
│   ├── DEPLOYMENT.md
│   ├── TAURI.md
│   ├── CAPACITOR.md
│   ├── TROUBLESHOOTING.md
│   └── OAUTH_WECHAT_QQ.md         # 历史文档，当前版本未使用
└── README.md
```

---

## 4. 本地运行

```bash
cd zhixi-cloud
pnpm install
cp .env.example .env
# 填 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
pnpm dev
```

没有 Supabase 配置时，登录页会显示「还差一步配置」，不会进入应用。

构建：

```bash
pnpm build
pnpm preview
```

产物在 `dist/`。

---

## 5. Supabase 配置

完整步骤：[SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)。

最少需要：

1. 创建 Supabase 项目。
2. 执行 [初始化 SQL](supabase/migrations/20261112000000_init.sql)。
3. **Authentication → Providers → Email**：开启。
4. **Confirm email**：关闭。
5. **Allow new users to sign up**：开启。
6. **Authentication → URL Configuration**：Site URL 填 Cloudflare Pages 域名。
7. 项目根目录 `.env` 填：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

> 只使用 anon public key。前端和 `vite.config.js` 都会检测 service_role / `sb_secret_`，误配会拒绝构建或拒绝启动。

账号映射、错误处理与后台设置详见 [ACCOUNT_LOGIN.md](docs/ACCOUNT_LOGIN.md)。

---

## 6. Cloudflare Pages 部署

### 6.1 Git 连接

1. 把仓库推到 GitHub / GitLab（`main` 分支）。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。
3. 选择仓库，生产分支选 `main`。

### 6.2 构建配置

| 项 | 值 |
| --- | --- |
| Framework preset | Vite |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | 仓库根（`zhixi-cloud` 如果仓库根是它） |
| Node version | 20 或以上 |

### 6.3 环境变量

Cloudflare Pages → Settings → Environment variables（Production 和 Preview 都加）：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

不要加 `service_role`。

### 6.4 SPA fallback

项目已包含 [public/_redirects](public/_redirects)：

```text
/* /index.html 200
```

Vite `base: './'` 使静态资源可以在 Pages 根路径正常加载。

### 6.5 部署后验证

- 打开 Pages 域名，看到账号密码登录页；
- 输入任意新账号 + 密码，自动注册并进入应用；
- 刷新页面，session 保留；
- 用同一账号在另一个浏览器登录，能看到同一份云端错题；
- 用另一个账号登录，看不到前一个账号的数据；
- 构建日志无 service_role 泄漏；
- Supabase Users 中出现虚拟邮箱用户（这是正常的，前端不显示）。

更完整的排查见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)。

---

## 7. 路由守卫与同步

- `main-cloud.js` 先读 Supabase session；没有 session 只显示登录页，不 boot 应用。
- 登录成功后 `App.boot` 使用 `zhixi_wrongbook_v1:<user_id>` 本地缓存；
- `CloudSync.bootstrap` 拉取云端数据并按 `updated_at` 合并；
- 本地提交触发增量同步；
- Realtime + 前台兜底 + 网络恢复补同步；
- RLS 使用 `auth.uid()` 限制 questions / user_settings / storage.objects；
- 图片上传私有 Storage，24 小时签名 URL。

---

## 8. 安全

- 只使用 anon key，service_role 只在服务端（当前登录流程不需要 Edge Function）。
- `vite.config.js` 构建期检测 service_role / `sb_secret_`；
- `src/lib/supabase.js` 客户端再次检测；
- Supabase Email Provider 开启，Confirm email 关闭；
- 账号虚拟邮箱不展示；
- 密码至少 6 位，最多 72 位，由 Supabase Auth 哈希存储；
- RLS 保证账号隔离；
- Storage bucket 私有；
- 前端不做“账号是否存在”的管理员查询，只依赖 signIn / signUp 返回。

---

## 9. 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 本地开发 |
| `pnpm build` | 构建 Cloudflare Pages 产物 |
| `pnpm preview` | 预览构建 |
| `pnpm tauri:dev` | Tauri 开发 |
| `pnpm tauri:build` | Tauri 安装包 |
| `pnpm cap:add:android` | 生成 Android 工程 |
| `pnpm android:patch` | 补 deep link / singleTask（仅历史 OAuth 需要） |
| `pnpm cap:sync` | 同步 Web 资源到 Android |

---

## 10. 文档

- [账号密码登录与虚拟邮箱映射](docs/ACCOUNT_LOGIN.md)
- [Supabase 初始化 / Email 登录](docs/SUPABASE_SETUP.md)
- [Cloudflare Pages 部署](docs/DEPLOYMENT.md)
- [Tauri](docs/TAURI.md)
- [Capacitor Android](docs/CAPACITOR.md)
- [常见问题](docs/TROUBLESHOOTING.md)
- [微信/QQ OAuth 历史文档](docs/OAUTH_WECHAT_QQ.md)（当前登录 UI 不使用）
