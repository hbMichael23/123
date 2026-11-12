// platform.js 不依赖 Supabase；原生相关配置直接从 Vite 环境读取。
// 账号密码登录本身不需要 deep link，相关能力保留给历史/未来扩展。
const NATIVE_DEEP_LINK = String(
  import.meta.env.VITE_NATIVE_DEEP_LINK || 'zhixi://auth/callback'
).trim();

export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function isCapacitorNative() {
  return Boolean(
    typeof window !== 'undefined'
    && window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
  );
}

export function isNativeApp() {
  return isTauri() || isCapacitorNative();
}

export function getOAuthRedirectTarget() {
  return isNativeApp()
    ? NATIVE_DEEP_LINK
    : (import.meta.env.VITE_APP_URL || window.location.origin + '/');
}

async function closeCapacitorBrowser() {
  if (!isCapacitorNative()) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    // Browser 可能已经被系统关闭，忽略即可。
  }
}

export async function openExternalUrl(url) {
  if (isCapacitorNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
    return;
  }
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.location.assign(url);
}

export async function getInitialDeepLink() {
  try {
    if (isCapacitorNative()) {
      const { App } = await import('@capacitor/app');
      const launch = await App.getLaunchUrl();
      return launch?.url || '';
    }
    if (isTauri()) {
      const deepLink = await import('@tauri-apps/plugin-deep-link');
      if (typeof deepLink.getCurrent === 'function') {
        const current = await deepLink.getCurrent();
        if (Array.isArray(current)) return current[0] || '';
        return current || '';
      }
    }
  } catch (error) {
    console.warn('读取启动 deep link 失败', error);
  }
  return '';
}

/**
 * 原生壳中的 JSON 导出。
 * - Capacitor：写入 App Cache 后调起系统分享/保存面板。
 * - Tauri：调起保存对话框，并通过 Rust command 写入用户选择路径。
 * - Web：返回 null，由原浏览器 Blob 下载逻辑处理。
 */
export async function saveTextFile({ filename, text }) {
  if (isCapacitorNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const written = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true
      });
      await Share.share({
        title: '知隙错题备份',
        text: 'JSON 备份文件',
        url: written.uri,
        dialogTitle: '保存 JSON 备份'
      });
      return { saved: true };
    } catch (error) {
      if (/cancel/i.test(String(error?.message || error))) return { cancelled: true };
      throw error;
    }
  }

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await save({
      title: '保存知隙错题备份',
      defaultPath: filename,
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    });
    if (!path) return { cancelled: true };
    await invoke('save_backup_file', { path, contents: text });
    return { saved: true };
  }

  return null;
}

export async function listenForAuthDeepLinks(handler) {
  try {
    if (isCapacitorNative()) {
      const { App } = await import('@capacitor/app');
      await App.addListener('appUrlOpen', async (event) => {
        if (!event?.url) return;
        await closeCapacitorBrowser();
        handler(event.url);
      });
      return true;
    }
    if (isTauri()) {
      const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
      await onOpenUrl((urls) => {
        const list = Array.isArray(urls) ? urls : [urls];
        list.filter(Boolean).forEach((url) => handler(url));
      });
      return true;
    }
  } catch (error) {
    console.warn('注册 deep link 监听失败', error);
  }
  return false;
}
