import {
  getAuthConfigState,
  signInOrRegister,
  formatAuthError,
  normalizeAccountName
} from './auth-service.js';
import {
  ACCOUNT_MIN_LENGTH,
  ACCOUNT_MAX_LENGTH
} from '../lib/account.js';
import { isNativeApp } from '../lib/platform.js';

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 72;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char] ?? char));
}

const BRAND_MARK = `<span class="auth-logo-mark"><span>隙</span></span>`;

export class AuthUI {
  constructor() {
    this.root = null;
    this.configState = getAuthConfigState();
    this.busy = false;
    this.lastAccount = '';
    this.mode = 'loading';
    this.boundSubmit = this.handleSubmit.bind(this);
    this.boundInput = this.handleInput.bind(this);
  }

  init() {
    this.root = document.getElementById('auth-root');
    if (!this.root) return;
    this.root.addEventListener('submit', this.boundSubmit);
    this.root.addEventListener('input', this.boundInput);
    this.showLoading();
  }

  setRootVisible(visible) {
    if (!this.root) return;
    this.root.hidden = !visible;
    this.root.classList.toggle('is-hidden', !visible);
  }

  showLoading(message = '正在连接知隙…') {
    if (!this.root) return;
    this.mode = 'loading';
    this.setRootVisible(true);
    this.root.innerHTML = this.loadingMarkup(message);
  }

  showSyncing(message = '登录成功，正在同步你的云端错题…') {
    if (!this.root) return;
    this.mode = 'syncing';
    this.setRootVisible(true);
    this.root.innerHTML = this.syncingMarkup(message);
  }

  hide() {
    this.setRootVisible(false);
  }

  showConfigError() {
    if (!this.root) return;
    this.mode = 'config-error';
    this.setRootVisible(true);
    this.root.innerHTML = this.shell(`
      <div class="auth-card">
        <div class="auth-mobile-brand">${BRAND_MARK}<span>知隙</span></div>
        <p class="auth-kicker">SETUP REQUIRED</p>
        <h2 class="auth-heading">还差一步配置</h2>
        <p class="auth-subheading">${esc(this.configState.error || 'Supabase 环境变量尚未配置。')}</p>
        <div class="auth-codebox">
          <p>在项目根目录创建 <code>.env</code>（可复制 <code>.env.example</code>），填入：</p>
          <pre>VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY</pre>
          <p>Supabase 后台需要开启 <strong>Email Provider</strong>，并关闭 <strong>Confirm email</strong>。</p>
          <p>然后重启 <code>npm run dev</code>，或在 Cloudflare Pages 重新构建。</p>
        </div>
        <p class="auth-fineprint">详细步骤：<code>docs/ACCOUNT_LOGIN.md</code> 与 <code>docs/DEPLOYMENT.md</code></p>
      </div>
    `, { compact: true });
  }

  showLogin(options = {}) {
    if (!this.root) return;
    if (!this.configState.configured) {
      this.showConfigError();
      return;
    }

    this.mode = 'login';
    this.busy = false;
    this.setRootVisible(true);
    if (typeof options.account === 'string') this.lastAccount = options.account;
    const accountValue = this.lastAccount || '';
    const message = options.error || options.notice || '';

    this.root.innerHTML = this.shell(`
      <div class="auth-card">
        <div class="auth-mobile-brand">
          ${BRAND_MARK}
          <span>知隙 <small>ZHIXI</small></span>
        </div>
        <div class="auth-card-head">
          <p class="auth-kicker">PRIVATE CLOUD NOTEBOOK</p>
          <h2 class="auth-heading">账号登录</h2>
          <p class="auth-subheading">输入自定义账号和密码。账号不存在时会自动注册，不需要邮箱。</p>
        </div>

        <div id="auth-message" class="auth-message ${message ? 'is-error' : ''}" role="status" aria-live="polite">${esc(message)}</div>

        <form id="account-login-form" class="auth-form" novalidate>
          <label class="auth-label" for="auth-account">账号</label>
          <div class="auth-field">
            <input
              id="auth-account"
              name="account"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              placeholder="输入自定义账号"
              value="${esc(accountValue)}"
              maxlength="${ACCOUNT_MAX_LENGTH}"
            >
          </div>

          <label class="auth-label" for="auth-password">密码</label>
          <div class="auth-field">
            <input
              id="auth-password"
              name="password"
              type="password"
              autocomplete="current-password"
              autocapitalize="none"
              spellcheck="false"
              placeholder="输入密码（至少 6 位）"
              maxlength="${PASSWORD_MAX_LENGTH}"
            >
          </div>

          <button type="submit" class="auth-primary-button" data-auth-action="account-submit">
            <span>登录 / 自动注册</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <p class="auth-helper">账号不区分大小写，首尾空格忽略；密码至少 6 位。首次登录自动创建账号。</p>
        </form>

        <p class="auth-legal">账号只用于登录和数据隔离，不需要邮箱。密码由 Supabase Auth 加密存储；云端错题受行级安全策略（RLS）保护，每个账号只能访问自己的数据。</p>
      </div>
      <p class="auth-page-foot">${isNativeApp() ? 'App 版本 · 账号密码登录' : 'Web 版本 · 多设备自动同步'}</p>
    `, { compact: false });

    const accountInput = this.root.querySelector('#auth-account');
    const passwordInput = this.root.querySelector('#auth-password');
    if (accountValue) {
      passwordInput?.focus({ preventScroll: true });
    } else {
      accountInput?.focus({ preventScroll: true });
    }
    if (message) this.scrollMessageIntoView();
  }

  shell(content, options = {}) {
    return `
      <div class="auth-page">
        <div class="auth-page-lines" aria-hidden="true"></div>
        <div class="auth-shell ${options.compact ? 'is-compact' : ''}">
          <section class="auth-story">
            <div class="auth-brand">
              ${BRAND_MARK}
              <span>
                <strong>知隙</strong>
                <small>ZHIXI · 985 ECON</small>
              </span>
            </div>
            <div class="auth-story-copy">
              <p class="auth-story-kicker">A PRIVATE NOTEBOOK FOR THE LONG RUN</p>
              <h1>把错题留在云端，<br><em>把专注留给书桌。</em></h1>
              <p class="auth-story-lead">自定义账号 + 密码即可登录；首次输入自动注册，不需要邮箱。数据按账号隔离，多设备自动接续。</p>
              <ul class="auth-feature-list">
                <li><span>01</span><div><strong>本地 OCR</strong><small>原图不上传识别服务</small></div></li>
                <li><span>02</span><div><strong>账号隔离</strong><small>Supabase RLS 行级安全策略</small></div></li>
                <li><span>03</span><div><strong>多设备接续</strong><small>云端自动同步错题、复习与标签</small></div></li>
              </ul>
            </div>
            <div class="auth-quote">
              <p>博学之，审问之，慎思之，明辨之，笃行之。</p>
              <span>《礼记 · 中庸》</span>
            </div>
          </section>

          <section class="auth-panel">
            ${content}
          </section>
        </div>
      </div>
    `;
  }

  loadingMarkup(message) {
    return this.shell(`
      <div class="auth-card auth-card-centered">
        <div class="auth-spinner" aria-hidden="true"></div>
        <p class="auth-kicker">ZHIXI CLOUD</p>
        <h2 class="auth-heading">${esc(message)}</h2>
        <p class="auth-subheading">正在校验登录状态，请稍候。</p>
      </div>
    `, { compact: true });
  }

  syncingMarkup(message) {
    return this.shell(`
      <div class="auth-card auth-card-centered">
        <div class="auth-sync-mark" aria-hidden="true">
          <span></span>
          <svg viewBox="0 0 24 24" fill="none"><path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M19 12a7 7 0 0 0-12-5L4 10m1 2a7 7 0 0 0 12 5l3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="auth-kicker">SECURELY CONNECTING</p>
        <h2 class="auth-heading">${esc(message)}</h2>
        <p class="auth-subheading">正在拉取你的错题、复习记录与标签，请保持页面打开。</p>
        <div class="auth-progress"><span></span></div>
      </div>
    `, { compact: true });
  }

  setMessage(text, tone = 'info') {
    const el = this.root?.querySelector('#auth-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', tone === 'error');
    el.classList.toggle('is-success', tone === 'success');
    el.classList.toggle('is-empty', !text);
    if (text) this.scrollMessageIntoView();
  }

  scrollMessageIntoView() {
    const el = this.root?.querySelector('#auth-message');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  setBusy(busy, label = '') {
    this.busy = Boolean(busy);
    const button = this.root?.querySelector('[data-auth-action="account-submit"]');
    if (!button) return;
    button.disabled = Boolean(busy);
    button.classList.toggle('is-loading', Boolean(busy));
    const span = button.querySelector('span');
    if (span) span.textContent = busy ? (label || '请稍候…') : '登录 / 自动注册';
  }

  async handleSubmit(event) {
    if (event.target?.id !== 'account-login-form') return;
    event.preventDefault();
    if (this.busy) return;
    await this.handleAccountLogin();
  }

  handleInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (this.root.querySelector('#auth-message')?.textContent) {
      this.setMessage('');
    }
  }

  readCredentials() {
    const accountInput = this.root?.querySelector('#auth-account');
    const passwordInput = this.root?.querySelector('#auth-password');
    const account = normalizeAccountName(accountInput?.value || '');
    const password = passwordInput?.value || '';

    if (account.length < ACCOUNT_MIN_LENGTH) {
      this.setMessage(`账号至少需要 ${ACCOUNT_MIN_LENGTH} 个字符。`, 'error');
      accountInput?.focus();
      return null;
    }
    if (account.length > ACCOUNT_MAX_LENGTH) {
      this.setMessage(`账号最多 ${ACCOUNT_MAX_LENGTH} 个字符。`, 'error');
      accountInput?.focus();
      return null;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      this.setMessage(`密码至少需要 ${PASSWORD_MIN_LENGTH} 位。`, 'error');
      passwordInput?.focus();
      return null;
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      this.setMessage(`密码最多 ${PASSWORD_MAX_LENGTH} 位。`, 'error');
      passwordInput?.focus();
      return null;
    }

    this.lastAccount = account;
    return { account, password };
  }

  async handleAccountLogin() {
    const credentials = this.readCredentials();
    if (!credentials) return;
    this.setMessage('');
    this.setBusy(true, '正在登录…');

    try {
      const result = await signInOrRegister(credentials.account, credentials.password);
      this.showSyncing(
        result.mode === 'register'
          ? '账号已创建，正在准备你的错题本…'
          : '登录成功，正在加载你的错题本…'
      );
    } catch (error) {
      this.setBusy(false);
      this.setMessage(formatAuthError(error, '登录没有完成，请稍后重试。'), 'error');
      this.root?.querySelector('#auth-password')?.focus({ preventScroll: true });
    }
  }
}
