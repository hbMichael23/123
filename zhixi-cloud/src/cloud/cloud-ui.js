import { CloudSync } from './cloud-sync.js';
import { getCurrentUserLabel } from '../auth/auth-service.js';

const LEGACY_KEY = 'zhixi_wrongbook_v1';
const LEGACY_MARKER = 'zhixi_legacy_migrated_v1';

let legacyCache;
let legacyCacheLoaded = false;

function invalidateLegacyCache() {
  legacyCache = undefined;
  legacyCacheLoaded = false;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char] ?? char));
}

function safeAvatar(url) {
  if (!url) return '';
  let normalized = String(url).trim();
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  if (normalized.startsWith('http://')) normalized = `https://${normalized.slice(7)}`;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function formatSyncTime(value) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未同步';
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60 * 1000) return '刚刚同步';
  if (elapsed < 60 * 60 * 1000) return `${Math.max(1, Math.round(elapsed / 60000))} 分钟前同步`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 同步`;
}

function statusMeta(phase) {
  const map = {
    synced: { label: '云端已同步', color: '#2B624F', bg: '#EDF4EF', border: '#D7E6DC', dot: '#3F7562' },
    syncing: { label: '正在同步…', color: '#86612A', bg: '#FAF3E3', border: '#EEDFBF', dot: '#C29A54' },
    pending: { label: '有改动待同步', color: '#86612A', bg: '#FAF3E3', border: '#EEDFBF', dot: '#C29A54' },
    idle: { label: '已连接云端', color: '#315B48', bg: '#EDF3EF', border: '#D7E5DB', dot: '#4B8068' },
    offline: { label: '当前离线', color: '#6B6256', bg: '#F4F1EA', border: '#E6DFD3', dot: '#9A8D7A' },
    error: { label: '同步失败', color: '#98503C', bg: '#F8ECE7', border: '#ECD8CF', dot: '#B46650' }
  };
  return map[phase] || map.idle;
}

function providerLabel(user) {
  const metadata = user?.user_metadata || {};
  if (metadata.account_type === 'username_password') return '账号登录';
  if (typeof user?.email === 'string' && /@(?:encoded\.)?local\.test$/i.test(user.email)) return '账号登录';
  if (metadata.oauth_provider === 'wechat') return '微信登录（旧）';
  if (metadata.oauth_provider === 'qq') return 'QQ 登录（旧）';
  if (user?.phone) return '手机号登录（旧）';
  return '云端账号';
}

function readLegacyState() {
  if (legacyCacheLoaded) return legacyCache;
  legacyCacheLoaded = true;
  legacyCache = null;
  try {
    if (localStorage.getItem(LEGACY_MARKER)) return null;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) return null;
    legacyCache = parsed;
    return parsed;
  } catch {
    legacyCache = null;
    return null;
  }
}

export class CloudUI {
  constructor() {
    this.app = null;
    this.user = null;
    this.onSignOut = null;
    this.status = CloudSync.getStatus();
    this.unsubscribeStatus = null;
    this.boundClick = this.handleClick.bind(this);
    this.initialized = false;
  }

  init({ app, onSignOut }) {
    this.app = app;
    this.onSignOut = onSignOut;
    if (this.initialized) return;
    this.initialized = true;
    document.addEventListener('click', this.boundClick);
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = CloudSync.onStatus((status) => {
      this.status = status;
      this.refreshCard();
    });
  }

  setUser(user) {
    this.user = user || null;
    this.status = CloudSync.getStatus();
    this.refreshCard();
  }

  getUser() {
    return this.user;
  }

  accountCardHTML() {
    if (!this.user) return '';
    const user = this.user;
    const displayName = getCurrentUserLabel(user);
    const avatar = safeAvatar(user.user_metadata?.avatar_url);
    const status = statusMeta(this.status?.phase);
    const lastSync = formatSyncTime(this.status?.lastSyncAt);
    const initial = user.phone && !user.user_metadata?.display_name ? '隙' : (displayName || '隙').slice(0, 1);
    const legacy = readLegacyState();
    const syncDisabled = this.status?.phase === 'syncing';
    const errorDetail = this.status?.phase === 'error'
      ? [this.status?.message, this.status?.error].filter(Boolean).join(' · ')
      : '';
    const errorText = errorDetail
      ? `<p class="mt-2 rounded-lg bg-clay-50/70 px-2.5 py-2 text-[9px] leading-4 text-clay-600/65">${esc(errorDetail)}</p>`
      : '';

    return `
      <div id="cloud-account-card" class="rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
        <div class="flex items-start gap-4">
          <div class="relative flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-2xl bg-pine-900 text-gold-200 shadow-[0_10px_24px_-16px_rgba(18,50,41,.9)]">
            ${avatar ? `<img src="${esc(avatar)}" alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer">` : `<span class="font-display text-xl">${esc(initial)}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-pine-700/45">Cloud account</p>
              <span class="rounded-full border px-2 py-0.5 text-[8px] font-semibold" style="color:${status.color};background:${status.bg};border-color:${status.border}">
                <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full align-[1px]" style="background:${status.dot}"></span>${status.label}
              </span>
            </div>
            <h2 class="mt-1.5 truncate font-display text-xl font-semibold text-ink/85">${esc(displayName)}</h2>
            <p class="mt-1 text-[10px] leading-5 text-ink/38">
              ${esc(providerLabel(user))} · 数据按账号隔离
            </p>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <div class="rounded-xl border border-line-soft bg-paper2/55 px-3 py-2.5">
            <p class="text-[9px] text-ink/30">同步状态</p>
            <p class="mt-1 truncate text-[10.5px] font-semibold text-ink/62">${status.label}</p>
          </div>
          <div class="rounded-xl border border-line-soft bg-paper2/55 px-3 py-2.5">
            <p class="text-[9px] text-ink/30">最近同步</p>
            <p class="mt-1 truncate text-[10.5px] font-semibold text-ink/62">${esc(lastSync)}</p>
          </div>
        </div>
        ${errorText}

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" data-cloud-action="sync" ${syncDisabled ? 'disabled' : ''} class="btn btn-secondary min-h-[38px] flex-1 px-3 text-[10.5px]">
            ${syncDisabled ? '<span class="spinner"></span>' : '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M19 12a7 7 0 0 0-12-5L4 10m1 2a7 7 0 0 0 12 5l3-3" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
            ${syncDisabled ? '同步中…' : '立即同步'}
          </button>
          <button type="button" data-cloud-action="signout" class="btn btn-ghost min-h-[38px] px-3 text-[10.5px] text-ink/40 hover:text-clay-600">退出登录</button>
        </div>

        ${legacy ? `
          <div class="mt-4 rounded-xl border border-gold-200/70 bg-gold-50/50 px-3.5 py-3">
            <div class="flex items-start gap-2.5">
              <span class="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white/70 text-gold-700">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-[10px] font-semibold text-gold-700/85">检测到旧版本机错题</p>
                <p class="mt-0.5 text-[9px] leading-4 text-gold-700/50">可将浏览器中旧版知隙的数据合并到当前账号，之后自动上传云端。</p>
                <button type="button" data-cloud-action="migrate-legacy" class="mt-2 text-[9.5px] font-semibold text-gold-700 underline decoration-gold-300 underline-offset-4 hover:text-gold-600">导入本机旧数据</button>
              </div>
            </div>
          </div>
        ` : ''}

        <p class="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[8.5px] leading-4 text-ink/28">
          <svg class="mt-0.5 h-3 w-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
          Supabase RLS 行级安全策略保证每个账号只能访问自己的错题与图片。
        </p>
      </div>
    `;
  }

  refreshCard() {
    if (!this.user) return;
    const existing = document.getElementById('cloud-account-card');
    if (!existing) return;
    existing.outerHTML = this.accountCardHTML();
  }

  async handleClick(event) {
    const target = event.target.closest('[data-cloud-action]');
    if (!target || !this.user) return;
    const action = target.getAttribute('data-cloud-action');
    if (action === 'sync') {
      target.disabled = true;
      await CloudSync.syncNow({ manual: true });
      this.refreshCard();
      return;
    }
    if (action === 'signout') {
      const status = CloudSync.getStatus();
      const dirty = status.phase === 'pending' || status.phase === 'error' || status.phase === 'offline';
      const confirmed = await this.app.confirm({
        title: '退出当前账号？',
        message: dirty
          ? '当前还有改动没有确认同步。退出后本机仍会保留缓存，下次登录同一账号会继续同步；也可以先点「立即同步」。'
          : '退出后需要重新登录才能访问云端错题。本机缓存会按账号保留。',
        confirmText: dirty ? '仍然退出' : '退出登录',
        cancelText: '取消',
        tone: dirty ? 'danger' : 'default'
      });
      if (!confirmed) return;
      await this.onSignOut?.();
      return;
    }
    if (action === 'migrate-legacy') {
      const legacy = readLegacyState();
      const rawLegacy = (() => {
        try { return localStorage.getItem(LEGACY_KEY); } catch { return null; }
      })();
      if (!legacy || !rawLegacy) {
        this.app.showToast('没有检测到可导入的旧版本机数据。', 'info');
        this.refreshCard();
        return;
      }
      const confirmed = await this.app.confirm({
        title: '导入本机旧版数据？',
        message: `检测到 ${legacy.questions.length} 道旧版本机错题。将迁移到当前登录账号并尝试同步云端。为了释放浏览器配额，导入成功后旧版本地键会被移除；建议先在旧版导出 JSON 备份。`,
        confirmText: '迁移并同步',
        cancelText: '取消',
        tone: 'default'
      });
      if (!confirmed) return;

      // 旧 key 与新 key 同时占用 localStorage 时，带图片的旧数据很可能超配额。
      // 先把旧 key 从存储中移除（内容已读入内存），导入成功后不再恢复；
      // 导入失败则把原始字符串写回，保证旧数据不丢。
      let removed = false;
      try {
        localStorage.removeItem(LEGACY_KEY);
        removed = true;
        const result = this.app.mergeLegacyState(legacy);
        if (!result?.ok) throw new Error('本地缓存写入失败（可能空间不足）');
        try {
          localStorage.setItem(LEGACY_MARKER, this.user.id);
        } catch {
          // marker 写不进去不影响已经迁移的数据。
        }
        invalidateLegacyCache();
        this.app.showToast(
          result.imported > 0
            ? `已迁移 ${result.imported} 道旧版错题，正在同步云端。`
            : '旧数据已合并到当前账号，标签已完成合并。',
          'success',
          4200
        );
        this.refreshCard();
      } catch (error) {
        console.error('旧数据导入失败', error);
        if (removed) {
          try { localStorage.setItem(LEGACY_KEY, rawLegacy); } catch { /* 空间不足时尽力而为 */ }
        }
        invalidateLegacyCache();
        this.app.showToast('旧数据导入失败，原始旧数据已尽量保留。请先导出备份后再试。', 'error', 6200);
      }
    }
  }

  destroy() {
    document.removeEventListener('click', this.boundClick);
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
    this.initialized = false;
  }
}
