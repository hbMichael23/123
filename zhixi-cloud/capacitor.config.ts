import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.zhixi.kaoyan',
  appName: '知隙',
  webDir: 'dist',
  // Android 使用 https://localhost，避免 WebView 的混合内容与 Cookie 问题。
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    // 第三方登录使用系统浏览器完成，不在 WebView 内嵌授权页。
    // 回跳 custom scheme 需要按 docs/CAPACITOR.md 在 AndroidManifest.xml 注册。
  }
};

export default config;
