// 知隙入口：先加载样式与原错题本，再进入账号密码登录/云端 session 守卫。
// 登录实现见 main-cloud.js：没有 session 不会 boot 应用。
//
// 保持 Tailwind utilities 在 legacy.css 之后输出，与原始 CDN 渲染的层叠顺序一致。
// 例如 .field 的 width 需要让位于 select.w-auto 等工具类。
import './styles/legacy.css';
import './styles/tailwind.css';
import './styles/cloud.css';
import './app/app.js';

import { saveTextFile } from './lib/platform.js';

// MathJax 的配置必须在动态 <script> 加载前存在。
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true
  },
  svg: { fontCache: 'global' },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    enableMenu: false
  }
};

// App.js 的导出函数会优先使用它；Web 端返回 null，自动回退到原 Blob 下载。
// 不在模块加载时判断 isNativeApp：原生壳初始化脚本的注入时机可能更晚。
window.ZhixiSaveBackup = saveTextFile;

function showBootError(error) {
  console.error('知隙启动失败', error);
  document.body.classList.remove('app-ready');

  let root = document.getElementById('auth-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'auth-root';
    document.body.prepend(root);
  }
  root.hidden = false;
  root.style.display = 'block';
  root.innerHTML = '';

  const page = document.createElement('div');
  page.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#F6F3EC;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#1B2922;';

  const card = document.createElement('div');
  card.style.cssText = 'width:min(460px,100%);background:#fff;border:1px solid #E4DED1;border-radius:24px;padding:28px;box-shadow:0 24px 70px -48px rgba(18,50,41,.55);';

  const mark = document.createElement('div');
  mark.textContent = '隙';
  mark.style.cssText = 'display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:14px;background:#123229;color:#DCB978;font-family:"Songti SC","SimSun",serif;font-size:23px;font-weight:600;';

  const title = document.createElement('h1');
  title.textContent = '知隙没有打开';
  title.style.cssText = 'margin:20px 0 0;font-family:"Songti SC","SimSun",serif;font-size:26px;font-weight:600;';

  const message = document.createElement('p');
  message.textContent = error?.message || '登录模块加载失败，请刷新页面重试。';
  message.style.cssText = 'margin:12px 0 0;color:#6B6256;font-size:13px;line-height:1.9;word-break:break-word;';

  const hint = document.createElement('p');
  hint.textContent = '请检查 Supabase 环境变量与网络，然后刷新页面。';
  hint.style.cssText = 'margin:12px 0 0;color:#9A8D7A;font-size:11px;line-height:1.8;';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '刷新页面';
  button.style.cssText = 'margin-top:20px;min-height:44px;width:100%;border:0;border-radius:12px;background:#123229;color:#FCF9F1;font-size:12px;font-weight:600;cursor:pointer;';
  button.addEventListener('click', () => window.location.reload());

  card.append(mark, title, message, hint, button);
  page.append(card);
  root.append(page);
}

if (!window.ZhixiApp) {
  showBootError(new Error('应用脚本未加载，找不到 window.ZhixiApp。'));
} else {
  import('./main-cloud.js').catch((error) => {
    showBootError(error);
  });
}
