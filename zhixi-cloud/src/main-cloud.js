// 登录入口：账号 + 密码 → Supabase Email/Password。
// 默认 main.js 会加载本模块；路由守卫在这里：没有 session 不 boot 应用。
import { isSupabaseConfigured, configError } from './lib/supabase.js';
import { getSession, onAuthStateChange, signOut } from './auth/auth-service.js';
import { CloudSync } from './cloud/cloud-sync.js';
import { CloudUI } from './cloud/cloud-ui.js';
import { AuthUI } from './auth/auth-ui.js';

const App = window.ZhixiApp;
if (!App) {
  throw new Error('知隙应用初始化失败：找不到 window.ZhixiApp');
}

window.ZhixiCloudMode = true;

const authUI = new AuthUI();
const cloudUI = new CloudUI();
window.ZhixiCloudUI = cloudUI;
window.ZhixiCloud = CloudSync;

let appStarted = false;
let bootPromise = null;
let authSubscription = null;

authUI.init();
cloudUI.init({
  app: App,
  onSignOut: async () => {
    try {
      CloudSync.detach();
      await signOut();
    } finally {
      window.location.reload();
    }
  }
});

function showApp() {
  document.body.classList.add('app-ready');
  authUI.hide();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

async function bootSignedInUser(session) {
  if (!session?.user) return;
  if (appStarted) return;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const user = session.user;
    authUI.showSyncing('正在加载你的错题本…');
    cloudUI.setUser(user);

    // 每个云端账号使用独立本地缓存；退出后不会串到其他账号。
    const localState = App.readStateFromStorage(App.getScopedStorageKey(user.id));
    const prepared = await CloudSync.bootstrap({
      user,
      app: App,
      localState
    });

    const booted = App.boot({
      initialState: prepared.state,
      storageKey: App.getScopedStorageKey(user.id),
      notices: prepared.notices,
      onCommit: (previousState, nextState) => {
        CloudSync.handleLocalCommit(previousState, nextState);
      }
    });

    if (!booted && !App.isBooted()) {
      throw new Error('错题本初始化失败，请刷新页面重试。');
    }

    appStarted = true;
    showApp();
    cloudUI.setUser(user);
    CloudSync.attach();
    cloudUI.refreshCard();
  })().catch((error) => {
    console.error('登录后初始化失败', error);
    appStarted = false;
    bootPromise = null;
    document.body.classList.remove('app-ready');
    authUI.showLogin({
      error: error?.message || '登录成功，但错题本加载失败，请刷新页面重试。'
    });
  });

  return bootPromise;
}

async function initializeAuth() {
  if (!isSupabaseConfigured) {
    authUI.showConfigError();
    return;
  }

  authSubscription = onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (session?.user) void bootSignedInUser(session);
    } else if (event === 'SIGNED_OUT') {
      if (appStarted) {
        CloudSync.detach();
        window.location.reload();
      }
    }
  });

  let session = null;
  try {
    session = await getSession();
  } catch (error) {
    console.warn('读取登录会话失败', error);
    authUI.showLogin({
      error: configError || '登录状态校验失败，请检查网络后重试。'
    });
    return;
  }

  if (session?.user) {
    await bootSignedInUser(session);
    return;
  }

  authUI.showLogin();
}

void initializeAuth().catch((error) => {
  console.error('初始化登录失败', error);
  // 只有在 Supabase 配置完整时才显示登录表单；否则显示配置错误。
  if (isSupabaseConfigured) {
    authUI.showLogin({ error: configError || '登录服务初始化失败，请刷新页面重试。' });
  } else {
    authUI.showConfigError();
  }
});

// 供调试和本地原生壳集成时检查（不暴露敏感配置）。
window.ZhixiCloudApp = {
  get started() { return appStarted; },
  authUI,
  cloudUI,
  cloudSync: CloudSync
};

window.addEventListener('beforeunload', () => {
  authSubscription?.();
});
