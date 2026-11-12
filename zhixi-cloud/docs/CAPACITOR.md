# Capacitor 7 打包 Android

> 当前登录方式是 **账号 + 密码**，在 Android WebView 内直接调用 Supabase Email/Password。  
> 打包前只需配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`；不需要微信/QQ OAuth 或 deep link。文中的 deep link 内容为历史配置，可不使用。

Capacitor 把 `dist/` 放进 Android WebView。项目只提供 Web 工程与 Capacitor 配置，**不提交自动生成的 `android/` 目录**，避免 Gradle 文件与 SDK 版本把仓库撑得不可维护。第一次构建时生成即可。

---

## 1. 前置环境

- Node.js >= 20
- pnpm
- **JDK 21**（Capacitor 7 的 Gradle 8.11 / AGP 8.7 构建链推荐；不要使用 JDK 8）
- **Android Studio 2024.2.1 或更高**
- Android SDK Platform 35、Build Tools、Platform Tools（adb）
- 一台 Android 真机或模拟器
- 已配置好 Supabase Email 登录（见 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)）

确认：

```bash
java -version
adb version
```

`JAVA_HOME` 指向 JDK 21。  
如果系统装的是 Java 8/11，最稳妥的是在 Android Studio → Settings → Build, Execution, Deployment → Build Tools → Gradle 中指定 Android Studio 自带的 JBR（JDK 21），并在终端把 `JAVA_HOME` 指向它。`ANDROID_HOME` 指向 Android SDK。

---

## 2. 首次生成 Android 工程

先构建 Web：

```bash
pnpm install
pnpm build
```

再生成 Android：

```bash
pnpm cap:add:android
```

它会创建：

```text
android/
  app/src/main/AndroidManifest.xml
  app/src/main/java/.../MainActivity.java
  variables.gradle          # minSdk 23 / compileSdk 35 / targetSdk 35
  ...
```

首次构建 Gradle 会下载 Gradle 8.11、AGP 8.7 与 Android 依赖，耗时较长。

### 补充 deep link（历史，可选）

> 账号密码登录不需要 deep link。以下内容只用于旧 OAuth 方案或未来扩展；不执行也不影响账号登录。

运行：

```bash
pnpm android:patch
```

脚本会：

1. 确保 `INTERNET` 权限存在；
2. 给 `MainActivity` 加 `android:launchMode="singleTask"`；
3. 插入 `zhixi://auth/callback` 的 intent-filter。

可重复执行，不会重复插入。

如果没有脚本，手动在 `android/app/src/main/AndroidManifest.xml` 的 `<activity android:name=".MainActivity">` 内加：

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="zhixi" android:host="auth" android:pathPrefix="/callback" />
</intent-filter>
```

并给 activity 加：

```xml
android:launchMode="singleTask"
```

### 图标与启动图

项目提供：

```text
resources/icon.png
resources/splash.png
```

使用 Capacitor Assets 生成 Android 各密度资源：

```bash
pnpm add -D @capacitor/assets
pnpm exec capacitor-assets generate --android
```

（命令会写入 `android/app/src/main/res/`。）

---

## 3. 日常构建流程

每次改了前端代码：

```bash
pnpm build
pnpm cap:sync
```

`cap:sync` 会：

- 把 `dist/` 复制到 Android 工程；
- 同步插件（Filesystem、Share、App、Browser）；
- 更新原生依赖。

然后用 Android Studio 打开：

```bash
pnpm cap:open:android
```

或命令行构建。

---

## 4. 构建 APK / AAB

### Debug APK

Windows：

```powershell
cd android
.\gradlew.bat assembleDebug
```

macOS / Linux：

```bash
cd android
./gradlew assembleDebug
```

输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

安装到真机：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK

```bash
cd android
./gradlew assembleRelease
```

输出：

```text
android/app/build/outputs/apk/release/app-release.apk
```

### Google Play AAB

```bash
cd android
./gradlew bundleRelease
```

输出：

```text
android/app/build/outputs/bundle/release/app-release.aab
```

国内应用商店通常要求 APK + 软著 / ICP / 隐私政策，具体要求以商店为准。

---

## 5. 签名

### 5.1 生成 keystore

```bash
keytool -genkey -v \
  -keystore zhixi-release.jks \
  -alias zhixi \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

把 `zhixi-release.jks` 放到 `android/` 下（不要提交到 git）。

创建 `android/key.properties`：

```properties
storePassword=你的storePassword
keyPassword=你的keyPassword
keyAlias=zhixi
storeFile=../zhixi-release.jks
```

### 5.2 配置 `android/app/build.gradle`

在 `android { ... }` 之前：

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

在 `android { ... }` 内加入：

```gradle
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

> Capacitor 生成的是 Groovy `build.gradle`。如果你的工程改成了 Kotlin DSL (`build.gradle.kts`)，按等价语法改写。

构建：

```bash
cd android
./gradlew assembleRelease
```

验证签名：

```bash
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

### 5.3 版本号

在 `android/app/build.gradle`：

```gradle
defaultConfig {
    versionCode 1
    versionName "1.0.0"
}
```

每次发布 `versionCode` 必须递增，`versionName` 面向用户。

---

## 6. 账号登录

账号密码登录完全在 WebView 内完成：

1. `pnpm build` 前在 `.env` 配好：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

2. Supabase 后台开启 Email Provider，关闭 Confirm email；
3. App 打开后显示账号/密码登录页；
4. 首次输入自动注册并直接拿到 session；
5. session 保存在 WebView localStorage，后续打开自动进入；
6. 换设备用同一账号重新登录即可同步云端数据。

不需要微信/QQ、Custom Tabs、`zhixi://auth/callback` 或 Redirect URL 配置。  
`pnpm android:patch` 仅保留给历史 OAuth 方案，可不执行。

> Edge Function 的 provider 回调仍是 `https://api.your-domain.com/.../callback`，不是 `zhixi://`。custom scheme 只用于最后回 App。

### 安全边界

Android custom scheme 是全局注册的，理论上其他应用也可以声明 `zhixi://` 并截获回跳。当前 token 是一次性、短时效的，且 Edge 有 state/cookie 校验，但这不等同于 Android App Links 的域名归属校验。  
如果产品安全等级要求更高，应改为 **HTTPS App Links**：在 `your-domain.com/.well-known/assetlinks.json` 声明包名与签名指纹，使用 `https://your-domain.com/auth/callback` 作为 redirect，并在 Capacitor 中配置 App Links。本项目为降低部署门槛使用 custom scheme。

---

## 7. 原生能力对照

| 能力 | 实现 |
| --- | --- |
| 账号密码登录 | WebView 内调用 Supabase Email/Password |
| 微信/QQ 授权 | 历史 OAuth 配置，当前登录页不使用 |
| 接收回跳 | 历史 OAuth 配置，当前登录页不使用 |
| 导出 JSON | `@capacitor/filesystem` + `@capacitor/share` |
| 导入 JSON | WebView `<input type="file">` |
| 拍照 / 相册 | WebView `<input type="file" accept="image/*">` |
| 本地缓存 | WebView localStorage |
| 系统通知 | **未接入 LocalNotifications**，使用页面内提醒 |

### 导出备份

前端会调用 `Filesystem.writeFile` 写入 App Cache，再调起系统分享 / 保存面板。  
如果用户取消分享，文件可能仍留在 Cache，不影响数据。

### 系统通知

浏览器 `Notification` API 在 Android WebView 中通常不可用或行为不一致。页面内的「今日到期」提醒始终可用。  
如需锁屏级提醒，需要接入 `@capacitor/local-notifications`，并处理 Android 13 的 `POST_NOTIFICATIONS` 运行时权限；本项目未包含。

---

## 8. 常见问题

### 白屏 / 云模式下只显示登录页但无法操作

1. 确认 `pnpm build` 在 `cap:sync` 之前执行；
2. `adb logcat` 看 WebView 的 console error；
3. 检查 `.env` 的 Supabase URL / key 是否正确打包；
4. Android WebView 版本是否过旧（建议系统 WebView 100+）。

### 登录后无法访问 Supabase

- 确认使用 HTTPS（`androidScheme: 'https'`）；
- 不要设置 `allowMixedContent: true`；
- 检查手机网络是否能访问 `*.supabase.co`；
- 如使用自定义 Supabase 域名，确认证书正确；
- 在 Chrome 远程调试（`chrome://inspect`）看 network。

### Deep link 不唤起 App（历史 OAuth）

> 账号密码登录不使用 deep link，可跳过本节。

- `pnpm android:patch` 是否执行；
- `AndroidManifest.xml` 是否真的有 `android:scheme="zhixi"`；
- 修改 manifest 后是否重新安装 APK（只 sync 不够）；
- 测试命令：

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "zhixi://auth/callback?token_hash=test&type=email"
```

- 如果系统弹「用其他应用打开」，说明 scheme 已注册但可能没有默认处理；OAuth 回跳通常仍会唤起选择器。

### 微信授权页打不开（历史 OAuth）

> 账号密码登录不使用微信/QQ，可跳过本节。

- 微信/QQ 的 OAuth 页面必须能通过手机网络访问；
- 如果使用了自定义域名，确认 TLS 证书链完整（Android 对中间证书比桌面严格）；
- 不要用自签名证书。

### 拍照无反应

- WebView 的 file chooser 由 Capacitor 处理；
- 确认系统相机权限、存储权限；
- 某些国产 ROM 需要手动授予「相机 / 文件」权限；
- 可先用 `<input type="file">` 选择相册排除相机问题。

### 输入法 / 中文乱码

- 确保 `index.html` 与所有 JS 都是 UTF-8；
- Android Studio 文件编码设为 UTF-8。

### `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

- 设备上已安装不同签名的同包名 App；
- 先卸载旧版，再用同一 keystore 构建。

### 应用被 WebView 缓存旧版本

- `cap:sync` 后重新构建 APK；
- 卸载重装可排除；
- 不要在 WebView 中依赖 Service Worker 缓存（本项目未使用）。

### Gradle 下载慢

- 在 `android/gradle.properties` 配置代理；
- 或使用国内镜像（注意镜像完整性）；
- 首次构建需要下载 Gradle、Android 依赖，属正常。

### 键盘遮挡输入框

Capacitor 默认 `adjustResize`，一般没问题；若自定义了 `windowSoftInputMode`，改回 `adjustResize`。

### 返回键直接退出

当前 SPA 使用 hash 路由，未接入原生返回键拦截。用户可用页面内返回按钮；如需系统返回键回退，可加：

```js
import { App as CapApp } from '@capacitor/app';
CapApp.addListener('backButton', ({ canGoBack }) => {
  if (canGoBack) window.history.back();
  else CapApp.exitApp();
});
```

---

## 9. 发布前检查

- [ ] `.env` 使用的是生产 Supabase。
- [ ] `pnpm build && pnpm cap:sync`。
- [ ] `pnpm android:patch` 仅在需要历史 OAuth 时执行；账号密码登录不需要。
- [ ] 图标与启动图已生成。
- [ ] `versionCode` 已递增。
- [ ] 使用 release keystore 签名。
- [ ] 真机测试：新账号自动注册、已有账号登录、session 持久化、拍照、OCR、MathJax、复习、刷题、导入、导出。
- [ ] 断网 / 弱网测试。
- [ ] Android 13+ 通知权限（如果后续接入本地通知）。
- [ ] 隐私政策、权限说明、软著 / ICP（按发行渠道要求）。
- [ ] 不要在 App 中展示 Supabase service_role。
