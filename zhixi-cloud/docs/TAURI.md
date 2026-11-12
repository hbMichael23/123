# Tauri 2 打包（Windows / macOS）

> 当前登录方式是 **账号 + 密码**，在 Tauri WebView 内直接调用 Supabase Email/Password。  
> 打包前只需配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`；不需要微信/QQ OAuth 或 deep link。文中的 deep link 内容为历史配置，可不使用。

Tauri 把同一份 `dist/` 放进系统 WebView：

- Windows：WebView2（Edge Chromium）
- macOS：WKWebView

它**不是**把 Chromium 打进安装包，因此安装包较小，但系统 WebView 的差异需要测试。

---

## 1. 前置环境

### 通用

- Node.js >= 20
- pnpm
- Rust **>= 1.90**（`tauri-plugin-deep-link` / `opener` 当前要求）
- 能访问 crates.io（首次构建会下载大量 Rust crates，可能较慢）

安装 Rust：

```bash
# Windows / macOS 通用
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Windows PowerShell：

```powershell
winget install Rustlang.Rustup
```

确认：

```bash
rustc --version
cargo --version
```

### Windows

1. 安装 **Microsoft C++ Build Tools**（Desktop development with C++）。
2. 安装 **WebView2 Runtime**（Win10/11 通常已自带；老系统需单独安装）。
3. 安装 Node 20。
4. Tauri CLI 已在 devDependencies 中，无需全局安装。

### macOS

1. 安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

2. 构建 macOS 包必须在 macOS 上进行（不能从 Windows 交叉编译）。
3. Apple Silicon / Intel 分别构建对应架构，或使用 universal target。

---

## 2. 配置

### 2.1 环境变量

在项目根目录 `.env` 填好与 Web 相同的值：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Tauri 打包时 `beforeBuildCommand` 会执行 `pnpm build`，所以 `.env` 必须在构建时存在。

### 2.2 `src-tauri/tauri.conf.json`

关键配置：

- `build.beforeDevCommand`：`pnpm dev`
- `build.devUrl`：`http://localhost:5173`
- `build.frontendDist`：`../dist`
- `app.windows[0].label`：`main`
- `bundle.icon`：已生成的 ico / icns / png
- `plugins.deep-link.desktop.schemes`：历史配置，账号密码登录不使用

### 2.3 图标

已附带：

```text
src-tauri/icons/
src-tauri/app-icon.png
```

重新生成：

```bash
pnpm tauri icon src-tauri/app-icon.png -o src-tauri/icons
```

### 2.4 CSP

`app.security.csp` 已允许：

- `https://*.supabase.co`、`wss://*.supabase.co`（REST / Auth / Realtime）
- `cdnjs.cloudflare.com`、`unpkg.com`、`cdn.jsdelivr.net`、`cdn.bootcdn.net`（MathJax / Tesseract）
- `data:`、`blob:` 图片与 worker
- 微信 / QQ 头像域名（`*.qlogo.cn`、`*.qpic.cn` 等）
- `'wasm-unsafe-eval'`（Tesseract WebAssembly）；同时放行 `'unsafe-eval'` 以兼容 MathJax / 动态模块加载

如果你使用**自定义 Supabase 域名**，必须同步修改 CSP：

```json
"connect-src": "... https://api.your-domain.com wss://api.your-domain.com",
"img-src": "... https://api.your-domain.com",
"form-action": "... https://api.your-domain.com"
```

否则会出现：

- 数据能登录但读不到：`connect-src` 被拦；
- 图片 403 但浏览器能打开：`img-src` 被拦；
- 登录请求被 block：`form-action` 被拦。

Tauri 的 CSP 不会自动跟随 `.env`，必须手动同步。

---

## 3. 开发

```bash
pnpm install
pnpm tauri:dev
```

它会：

1. 启动 Vite（端口 5173）；
2. 启动 Tauri WebView；
3. 加载 `http://localhost:5173`。

首次运行会编译 Rust，耗时较长。

### Deep Link 开发调试（历史，可选）

> 账号密码登录不需要 deep link；以下内容仅用于旧 OAuth 方案或未来扩展。

- Windows：`src-tauri/src/main.rs` 中 `register_all()` 会尝试注册 `zhixi` scheme。
- macOS：scheme 由 bundle 的 URL Types 注册，开发模式可能需要先打包一次。
- 可在浏览器 / 终端手动触发：

```bash
# Windows
start "" "zhixi://auth/callback?token_hash=test&type=email"

# macOS
open "zhixi://auth/callback?token_hash=test&type=email"
```

如果 Windows 没有把 URL 转给已运行实例，检查：

- `tauri-plugin-single-instance` 是否**第一个**注册；
- Cargo.toml 是否有 `features = ["deep-link"]`；
- 是否只启动了一个应用实例。

---

## 4. 构建

### Windows

```bash
pnpm tauri:build
```

输出：

```text
src-tauri/target/release/zhixi.exe
src-tauri/target/release/bundle/msi/*.msi
src-tauri/target/release/bundle/nsis/*-setup.exe
```

推荐分发 NSIS 安装包。MSI 依赖 WiX。

### macOS

在 Mac 上：

```bash
pnpm tauri:build
```

输出：

```text
src-tauri/target/release/bundle/macos/知隙.app
src-tauri/target/release/bundle/dmg/知隙_1.0.0_*.dmg
```

如需同时支持 Intel + Apple Silicon：

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
pnpm tauri build --target universal-apple-darwin
```

### 只构建可执行文件（调试）

```bash
pnpm tauri build --no-bundle
```

---

## 5. 签名与分发

### Windows

未签名 `.exe` 会被 SmartScreen 拦截。正式发布建议购买代码签名证书：

- 在 `tauri.conf.json` 的 `bundle.windows` 配置 `certificateThumbprint` 与 `timestampUrl`；
- 或使用 `signtool` 在构建后签名。

同时准备：

- 应用名称、图标、版本号；
- 安装目录权限；
- 卸载程序（NSIS 自动生成）。

### macOS

- 需要 Apple Developer Program。
- 配置 Developer ID Application 证书；
- 对 `.app` 进行 codesign；
- 提交 Apple notarization；
- 未签名 / 未公证的 App 在 Gatekeeper 下会被阻止。

Tauri 官方签名文档：  
<https://v2.tauri.app/distribute/sign/macos/>

---

## 6. 原生能力

| 能力 | 实现 |
| --- | --- |
| 账号密码登录 | WebView 内调用 Supabase Email/Password |
| 打开微信/QQ 授权页 | 历史 OAuth 配置，当前登录页不使用 |
| 接收 `zhixi://` 回跳 | 历史 OAuth 配置，当前登录页不使用 |
| 导出 JSON 备份 | `@tauri-apps/plugin-dialog` 保存对话框 + Rust `save_backup_file` |
| 图片选择 / 拍照 | WebView 的 `<input type="file">` |
| 本地存储 | WebView localStorage，按用户区分 key |
| 系统通知 | **未接入原生通知插件**，使用页面内提醒；WebView Notification 支持因平台而异 |

> 如果你需要“App 关闭时也弹系统通知”，必须另外接入 `tauri-plugin-notification` 并设计后台调度。当前项目不伪造这个能力。

---

## 7. 常见问题

### 白屏 / 页面加载失败

- 确认 `pnpm build` 成功且 `dist/index.html` 存在；
- 检查 CSP 是否拦截了 `assets/*.js`；
- 开发者工具：Windows 上按 `F12` 或右键 Inspect，macOS 需在 WebView 设置中启用开发者工具；
- 用 `pnpm tauri:dev` 先排除前端问题。

### MathJax 不渲染 / OCR 不工作

- Tauri 的 CSP 默认禁止外部脚本；
- 确认 `script-src` 包含 cdnjs / unpkg / jsdelivr；
- 确认 `connect-src` 包含 OCR 模型域名；
- 第一次 OCR 需要联网下载约 6 MB 模型。

### 云模式：登录后卡在“正在加载”

- 检查 `connect-src` 是否包含 Supabase URL；
- 检查系统时间是否正确（JWT 校验依赖时间）；
- 打开开发者工具看 `/auth/v1/...` 与 `/rest/v1/...` 请求；
- 若使用自定义 Supabase 域名，CSP 必须更新。

### Deep Link 不回调

- Windows 安装版是否写入注册表；
- macOS 是否用 `.app` 运行（而不是裸二进制）；
- `single-instance` 是否启用 `deep-link` feature；
- Supabase Auth Redirect URLs 与 `OAUTH_ALLOWED_REDIRECTS` 是否包含 `zhixi://auth/callback`；
- 微信/QQ 的最终回跳是 custom scheme，但 **Edge Function 的 callback 仍然是 HTTPS 自定义域名**，不要混淆。
- custom scheme 由操作系统按关联注册，不能像 HTTPS 域名那样证明 App 身份；如需更高安全等级，可评估改用平台支持的 HTTPS 深链 / Universal Links，并同步修改 Supabase Redirect URLs 与 `OAUTH_ALLOWED_REDIRECTS`。

### 安装包文件名乱码 / 构建失败

- `productName` 使用中文时，Windows 安装器对路径/编码敏感；
- 若遇到 NSIS / WiX 报错，可临时把 `productName` 改为 `Zhixi`，窗口标题保持中文；
- 或把项目放在纯英文路径下构建。

### 文件导出失败

- Tauri 导出走 `save_backup_file` command；
- 确认 `src-tauri/src/main.rs` 的 `invoke_handler` 已注册；
- 用户取消保存对话框会返回 `{ cancelled: true }`，不会报错；
- macOS 沙箱 / 权限不足时，换到 `~/Downloads` 再试。

### 更新与版本号

Tauri 的自动更新未包含在本项目。发布新版本时：

1. 修改 `package.json` 与 `tauri.conf.json` 的 `version`；
2. 重新构建；
3. 手动分发安装包，或后续接入 `tauri-plugin-updater` 并配置签名密钥。

---

## 8. 发布前检查

- [ ] `pnpm build` 成功。
- [ ] `pnpm tauri:build` 成功。
- [ ] Windows 安装包在干净机器上可启动（WebView2 已安装）。
- [ ] macOS `.app` 已签名 / 公证。
- [ ] 登录、刷新、退出、deep link 全部验证。
- [ ] 录入图片、OCR、复习、刷题、导入导出全部验证。
- [ ] CSP 无报错。
- [ ] 版本号已更新。
- [ ] 隐私说明与用户协议已准备。
