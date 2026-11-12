(() => {
'use strict';

/* ============================================================
   知隙 · 经济学考研错题本
   Vite + Supabase / localStorage 缓存 / 移动优先
   ============================================================ */

const APP_ID = 'zhixi-kaoyan-wrongbook';
const SCHEMA_VERSION = 1;
const BASE_STORAGE_KEY = 'zhixi_wrongbook_v1';
let STORAGE_KEY = `${BASE_STORAGE_KEY}:local`;

// main-cloud.js 会在账号登录模式启动前设为 true；默认 false 仅用于防御未初始化场景。
function isCloudMode() {
  return typeof window !== 'undefined' && window.ZhixiCloudMode === true;
}
const DEFAULT_TAGS = ['微观经济学', '宏观经济学', '计量经济学', '政治经济学', '数三', '英语'];
const EBBINGHAUS_DAYS = [1, 2, 4, 7, 15, 30, 60, 90];
const NAV_ITEMS = [
  { route: 'home', label: '概览', en: 'Overview', icon: 'home' },
  { route: 'library', label: '错题本', en: 'Archive', icon: 'book' },
  { route: 'review', label: '复习', en: 'Review', icon: 'review' },
  { route: 'quiz', label: '刷题', en: 'Practice', icon: 'quiz' },
  { route: 'settings', label: '设置', en: 'Settings', icon: 'settings' }
];
const VALID_ROUTES = new Set(NAV_ITEMS.map((item) => item.route));
const MASTERY_ORDER = ['unmastered', 'normal', 'mastered'];
const MASTERY = {
  unmastered: {
    label: '未掌握',
    short: '未掌握',
    hint: '需要重新理解',
    initialDays: 1,
    color: '#B46650'
  },
  normal: {
    label: '一般',
    short: '一般',
    hint: '似懂非懂，需要巩固',
    initialDays: 2,
    color: '#C29A54'
  },
  mastered: {
    label: '已掌握',
    short: '已掌握',
    hint: '能够独立复述与应用',
    initialDays: 4,
    color: '#3F7562'
  }
};
const MASTERY_RANK = { unmastered: 0, normal: 1, mastered: 2 };
const TAG_TONES = [
  { bg: '#EDF3EF', border: '#D7E5DB', color: '#315B48' },
  { bg: '#F8F1E4', border: '#ECDFC8', color: '#7A5A2A' },
  { bg: '#F7EDE9', border: '#EAD8D0', color: '#88503E' },
  { bg: '#EDF1F4', border: '#D9E2E7', color: '#395867' },
  { bg: '#F1EEF5', border: '#E1DAEA', color: '#5C4A71' },
  { bg: '#F0F4EC', border: '#DEE7D6', color: '#4D623B' }
];
const MATHJAX_SCRIPT_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js',
  'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js',
  'https://unpkg.com/mathjax@3.2.2/es5/tex-svg.js',
  'https://cdn.bootcdn.net/ajax/libs/mathjax/3.2.2/es5/tex-svg.js'
];
const OCR_SCRIPT_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
  'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
];
const OCR_WORKER_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js',
  'https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js'
];
const OCR_CORE_URLS = [
  'https://unpkg.com/tesseract.js-core@5.1.1',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1'
];
const OCR_COMPACT_LANG_PATH = 'https://unpkg.com/@tesseract.js-data/chi_sim@1.0.0/4.0.0_best_int';
const OCR_FULL_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';

const ICONS = {
  home: '<path d="m3 10.8 9-7.8 9 7.8"/><path d="M5.5 9.4V20a1 1 0 0 0 1 1h3.2v-5.7h4.6V21h3.2a1 1 0 0 0 1-1V9.4"/>',
  book: '<path d="M12 7.4v13"/><path d="M4.7 17.9a2 2 0 0 1-1.7-2V4.7A1.7 1.7 0 0 1 4.7 3h4.1A3.2 3.2 0 0 1 12 6.2v14.2a3.2 3.2 0 0 0-3.2-3.2Z"/><path d="M19.3 17.9a2 2 0 0 0 1.7-2V4.7A1.7 1.7 0 0 0 19.3 3h-4.1A3.2 3.2 0 0 0 12 6.2v14.2a3.2 3.2 0 0 1 3.2-3.2Z"/>',
  review: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 9.5h18"/><path d="m8.7 15.5 2.1 2.1 4.5-4.6"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  settings: '<path d="M4 7h9M18 7h2M4 17h2M10 17h10"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="7.5" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-left': '<path d="m15 19-7-7 7-7"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  camera: '<path d="M14.2 5 16 7.5h3a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h3L9.8 5h4.4Z"/><circle cx="12" cy="13.4" r="3.4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.8" cy="9.2" r="1.5"/><path d="m4 17 5.2-5.2L14 16.6l2.4-2.4L20.5 18"/>',
  upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  file: '<path d="M14 2H6.5A1.5 1.5 0 0 0 5 3.5v17A1.5 1.5 0 0 0 6.5 22h11a1.5 1.5 0 0 0 1.5-1.5V7Z"/><path d="M14 2v5h5M8.5 12h7M8.5 16h7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.6 2.6 5.4-5.8"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  'bell-off': '<path d="M18 8a6 6 0 0 0-9-5.4M6 6.5A6 6 0 0 0 6 8c0 7-3 7-3 9h13"/><path d="M10 21h4M3 3l18 18"/>',
  tag: '<path d="M20.6 13.3 13.3 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.7Z"/><circle cx="7.8" cy="7.8" r="1.2"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  sparkles: '<path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3Z"/><path d="m19 15 .7 2.1 2.3.9-2.3.9L19 21l-.7-2.1-2.3-.9 2.3-.9L19 15Z"/><path d="M5 3v3M3.5 4.5h3"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 2.7-6.5L3 8"/><path d="M3 3v5h5"/>',
  refresh: '<path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 0-2.3 6.1"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  lightbulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.1V18h6v-1.2c0-.8.3-1.6 1-2.1A7 7 0 0 0 12 2Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 6.2A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.5M6.2 6.7A16 16 0 0 0 2.5 12S6 18 12 18a10 10 0 0 0 4-.8"/><path d="M9.7 9.7a3.3 3.3 0 0 0 4.6 4.6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  sort: '<path d="M3 6h18M6 12h12M10 18h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  'calendar-plus': '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 9.5h18M12 13v6M9 16h6"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 20 12a3.5 3.5 0 0 1-2.5 7Z"/>',
  feather: '<path d="M20.2 3.8a6 6 0 0 0-8.5 0L4 11.5V20h8.5l7.7-7.7a6 6 0 0 0 0-8.5Z"/><path d="M16 8 6 18M14 10h4M10 14h4"/>'
};

function icon(name, className = 'h-5 w-5', strokeWidth = 1.8) {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ---------- string / markup helpers ---------- */
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

// Preserve the author's paragraph breaks outside math, while leaving LaTeX
// untouched. Using <br> avoids MathJax's generated whitespace turning into
// visible line breaks under white-space: pre-wrap.
function renderRichText(value) {
  const text = String(value == null ? '' : value);
  let output = '';
  let plain = '';
  let mathMode = null;

  const flushPlain = () => {
    if (!plain) return;
    output += esc(plain).replace(/\n/g, '<br>');
    plain = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (mathMode) {
      if (mathMode === 'dollar') {
        if (char === '\\' && next === '$') {
          output += esc('\\$');
          index += 1;
          continue;
        }
        if (char === '$') {
          output += '$';
          mathMode = null;
          continue;
        }
      } else if (mathMode === 'double') {
        if (char === '$' && next === '$') {
          output += '$$';
          index += 1;
          mathMode = null;
          continue;
        }
      } else if (mathMode === 'paren') {
        if (char === '\\' && next === ')') {
          output += '\\)';
          index += 1;
          mathMode = null;
          continue;
        }
      } else if (mathMode === 'bracket') {
        if (char === '\\' && next === ']') {
          output += '\\]';
          index += 1;
          mathMode = null;
          continue;
        }
      }
      output += esc(char);
      continue;
    }

    if (char === '\\' && next === '$') {
      plain += '\\$';
      index += 1;
    } else if (char === '\\' && next === '(') {
      flushPlain();
      output += '\\(';
      mathMode = 'paren';
      index += 1;
    } else if (char === '\\' && next === '[') {
      flushPlain();
      output += '\\[';
      mathMode = 'bracket';
      index += 1;
    } else if (char === '$' && next === '$') {
      flushPlain();
      output += '$$';
      mathMode = 'double';
      index += 1;
    } else if (char === '$') {
      flushPlain();
      output += '$';
      mathMode = 'dollar';
    } else {
      plain += char;
    }
  }
  flushPlain();
  return output;
}

function renderPreviewText(value, maxLength = 0) {
  let text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (maxLength > 0 && text.length > maxLength) text = `${text.slice(0, maxLength).trimEnd()}…`;
  return esc(text);
}

function newId(prefix = 'q') {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
  } catch (error) {
    /* ignore */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ---------- dates ---------- */
function pad2(number) {
  return String(number).padStart(2, '0');
}

function dateKeyFromDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayKey() {
  return dateKeyFromDate(new Date());
}

function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isValidDateKey(dateKey) {
  return Boolean(parseDateKey(dateKey));
}

function addDaysToKey(dateKey, days) {
  const base = parseDateKey(dateKey) || new Date();
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0, 0);
  date.setDate(date.getDate() + Number(days || 0));
  return dateKeyFromDate(date);
}

function daysBetweenKeys(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function weekdayCN(date) {
  return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
}

function formatDateShort(dateKey, withYear = false) {
  const date = parseDateKey(dateKey);
  if (!date) return '';
  const now = new Date();
  if (withYear || date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateLong(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return '';
  const now = new Date();
  const year = date.getFullYear() !== now.getFullYear() ? `${date.getFullYear()}年` : '';
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 · 周${weekdayCN(date)}`;
}

function formatTodayLong() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 周${weekdayCN(now)}`;
}

function formatIsoTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatCreated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const key = dateKeyFromDate(date);
  const diff = daysBetweenKeys(key, todayKey());
  if (diff === 0) return `今天 ${formatIsoTime(iso)}`;
  if (diff === 1) return '昨天';
  if (diff > 1 && diff < 7) return `${diff} 天前`;
  return formatDateShort(key);
}

function formatRelativeDate(dateKey) {
  const diff = daysBetweenKeys(todayKey(), dateKey);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff > 2) return `${diff} 天后`;
  if (diff === -1) return '昨天';
  return formatDateShort(dateKey);
}

function dueLabel(question) {
  const diff = daysBetweenKeys(todayKey(), question.nextReview);
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今日复习';
  if (diff === 1) return '明天复习';
  if (diff <= 7) return `${diff} 天后复习`;
  return `${formatDateShort(question.nextReview, true)}复习`;
}

function dueTone(question) {
  const diff = daysBetweenKeys(todayKey(), question.nextReview);
  if (diff < 0) {
    return { text: '#98503C', bg: '#F8ECE7', border: '#ECD8CF' };
  }
  if (diff === 0) {
    return { text: '#8A6428', bg: '#FAF2E1', border: '#EEDFC0' };
  }
  return { text: 'rgba(33,75,62,.62)', bg: 'rgba(33,75,62,.06)', border: 'rgba(33,75,62,.12)' };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/* ---------- tags / mastery / formula render ---------- */
function tagTone(tag) {
  let hash = 0;
  const value = String(tag || '');
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return TAG_TONES[Math.abs(hash) % TAG_TONES.length];
}

function tagChip(tag, options = {}) {
  const tone = tagTone(tag);
  const count = options.count != null ? `<span class="ml-0.5 opacity-60">${esc(options.count)}</span>` : '';
  return `<span class="tag-chip" style="background:${tone.bg};border-color:${tone.border};color:${tone.color}"><span class="tag-dot" style="background:${tone.color};opacity:.72"></span>${esc(tag)}${count}</span>`;
}

function masteryPill(masteryKey) {
  const key = MASTERY[masteryKey] ? masteryKey : 'unmastered';
  return `<span class="mastery-pill mastery-${key}"><span class="mastery-dot"></span>${MASTERY[key].label}</span>`;
}

function initialNextReviewFor(masteryKey) {
  const meta = MASTERY[masteryKey] || MASTERY.unmastered;
  return addDaysToKey(todayKey(), meta.initialDays);
}

function previewIntervals(question, count = 3) {
  let stage = clampNumber(question.reviewStage, 0, EBBINGHAUS_DAYS.length - 1);
  let cursor = question.nextReview;
  const dates = [{ date: cursor, label: '下次复习' }];
  for (let index = 0; index < count; index += 1) {
    stage = Math.min(stage + 1, EBBINGHAUS_DAYS.length - 1);
    cursor = addDaysToKey(cursor, EBBINGHAUS_DAYS[stage]);
    dates.push({ date: cursor, label: `再往后` });
  }
  return dates;
}

/* ---------- state ---------- */
function defaultState() {
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: [],
    tags: [...DEFAULT_TAGS],
    settings: {
      notifications: false,
      lastDueSignature: '',
      lastInAppReminder: ''
    }
  };
}

function normalizeTagName(value) {
  return String(value == null ? '' : value)
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

function normalizeTags(list) {
  const seen = new Set();
  const result = [];
  if (!Array.isArray(list)) return result;
  list.forEach((item) => {
    const tag = normalizeTagName(item);
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    result.push(tag);
  });
  return result;
}

function isValidImageSource(value) {
  return typeof value === 'string'
    && (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)
      || /^https:\/\/[^\s"'<>]+$/i.test(value));
}

function normalizeHistoryList(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  list.slice(0, 60).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const atDate = new Date(item.at);
    if (Number.isNaN(atDate.getTime())) return;
    const feedback = ['again', 'fuzzy', 'good'].includes(item.feedback) ? item.feedback : 'good';
    const interval = Math.round(clampNumber(item.interval, 1, 365));
    const nextReview = isValidDateKey(item.nextReview) ? item.nextReview : addDaysToKey(todayKey(), interval);
    result.push({
      at: atDate.toISOString(),
      feedback,
      interval,
      nextReview
    });
  });
  return result;
}

function normalizeQuestion(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const stem = String(raw.stem == null ? '' : raw.stem).trim().slice(0, 30000);
  if (!stem) return null;
  const answer = String(raw.answer == null ? '' : raw.answer).trim().slice(0, 30000);
  const analysis = String(raw.analysis == null ? '' : raw.analysis).trim().slice(0, 30000);
  const tags = normalizeTags(raw.tags).slice(0, 12);
  const mastery = MASTERY[raw.mastery] ? raw.mastery : 'unmastered';
  const createdAtDate = new Date(raw.createdAt);
  const createdAt = Number.isNaN(createdAtDate.getTime()) ? new Date().toISOString() : createdAtDate.toISOString();
  const updatedAtDate = new Date(raw.updatedAt);
  const updatedAt = Number.isNaN(updatedAtDate.getTime()) ? createdAt : updatedAtDate.toISOString();
  const nextReview = isValidDateKey(raw.nextReview) ? raw.nextReview : initialNextReviewFor(mastery);
  const reviewStage = Math.round(clampNumber(raw.reviewStage, 0, EBBINGHAUS_DAYS.length - 1));
  const reviewHistory = normalizeHistoryList(raw.reviewHistory);
  let id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{4,90}$/.test(raw.id) ? raw.id : newId();
  if (options.usedIds) {
    while (options.usedIds.has(id)) id = newId();
    options.usedIds.add(id);
  }
  return {
    id,
    stem,
    answer,
    analysis,
    tags,
    mastery,
    image: isValidImageSource(raw.image) ? raw.image : '',
    imagePath: typeof raw.imagePath === 'string' ? raw.imagePath.slice(0, 500) : '',
    createdAt,
    updatedAt,
    nextReview,
    reviewStage,
    reviewHistory,
    lastReviewedAt: raw.lastReviewedAt && !Number.isNaN(new Date(raw.lastReviewedAt).getTime())
      ? new Date(raw.lastReviewedAt).toISOString()
      : ''
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const usedIds = new Set();
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = rawQuestions
    .slice(0, 5000)
    .map((question) => normalizeQuestion(question, { usedIds }))
    .filter(Boolean);
  const tags = normalizeTags([
    ...DEFAULT_TAGS,
    ...(Array.isArray(raw.tags) ? raw.tags : []),
    ...questions.flatMap((question) => question.tags)
  ]);
  const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    questions,
    tags,
    settings: {
      notifications: Boolean(rawSettings.notifications),
      lastDueSignature: typeof rawSettings.lastDueSignature === 'string' ? rawSettings.lastDueSignature : '',
      lastInAppReminder: typeof rawSettings.lastInAppReminder === 'string' ? rawSettings.lastInAppReminder : ''
    }
  };
}

function canUseLocalStorage() {
  try {
    const testKey = '__zhixi_storage_test__';
    localStorage.setItem(testKey, '1');
    const ok = localStorage.getItem(testKey) === '1';
    localStorage.removeItem(testKey);
    return ok;
  } catch (error) {
    return false;
  }
}

const storageAvailable = canUseLocalStorage();
const bootNotices = [];

function loadState() {
  if (!storageAvailable) {
    bootNotices.push({
      tone: 'warning',
      text: '当前浏览器不允许本地存储，本次录入的数据无法持久保存。请检查隐私设置或更换浏览器。'
    });
    return defaultState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.error('读取本地数据失败', error);
    try {
      localStorage.setItem(`${STORAGE_KEY}_corrupt_${Date.now()}`, localStorage.getItem(STORAGE_KEY) || '');
    } catch (innerError) {
      /* ignore backup failure */
    }
    bootNotices.push({
      tone: 'danger',
      text: '本地错题数据读取失败，已使用空数据启动。原数据已尽量保留在浏览器中。'
    });
    return defaultState();
  }
}

let state = defaultState();
let APP_BOOTED = false;
let commitListener = null;
let localRevision = 0;

function storageErrorMessage(error) {
  if (!error) return '保存失败，请稍后重试。';
  if (error.name === 'QuotaExceededError' || error.code === 22 || String(error.message).toLowerCase().includes('quota')) {
    return '浏览器本地存储空间不足。请减少题目图片，或先导出备份后清理旧数据。';
  }
  if (error.name === 'SecurityError') {
    return '浏览器阻止了本地存储。请检查隐私设置，或换用 Chrome / Edge 打开。';
  }
  return '数据保存失败，请检查浏览器存储设置。';
}

function notifyLocalCommit(previousState) {
  localRevision += 1;
  if (typeof commitListener === 'function') {
    try {
      commitListener(previousState, state, localRevision);
    } catch (error) {
      console.error('云端同步钩子执行失败', error);
    }
  }
}

function commitState(mutator, options = {}) {
  const snapshot = JSON.stringify(state);
  const previousState = JSON.parse(snapshot);
  try {
    mutator(state);
    state.updatedAt = new Date().toISOString();
  } catch (error) {
    state = JSON.parse(snapshot);
    console.error(error);
    if (!options.quiet) showToast('操作失败，数据未修改。', 'error');
    return false;
  }
  if (!storageAvailable) {
    notifyLocalCommit(previousState);
    if (!options.quiet) showToast(isCloudMode() ? '本地缓存不可用，修改会直接同步到云端。' : '本地缓存不可用，修改可能无法保留；请检查浏览器隐私设置。', 'warning', 5400);
    return true;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    notifyLocalCommit(previousState);
    return true;
  } catch (error) {
    state = JSON.parse(snapshot);
    console.error('保存本地数据失败', error);
    if (!options.quiet) showToast(storageErrorMessage(error), 'error', 6200);
    return false;
  }
}

function persistSilently() {
  if (!storageAvailable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    return false;
  }
}

/* ---------- derived data ---------- */
function getQuestionById(id) {
  return state.questions.find((question) => question.id === id) || null;
}

function sortedByReview(questions = state.questions) {
  return [...questions].sort((a, b) => {
    const dateCompare = String(a.nextReview).localeCompare(String(b.nextReview));
    if (dateCompare !== 0) return dateCompare;
    const masteryCompare = MASTERY_RANK[a.mastery] - MASTERY_RANK[b.mastery];
    if (masteryCompare !== 0) return masteryCompare;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function getDueQuestions() {
  const today = todayKey();
  return sortedByReview(state.questions.filter((question) => question.nextReview <= today));
}

function getUpcomingQuestions() {
  const today = todayKey();
  return sortedByReview(state.questions.filter((question) => question.nextReview > today));
}

function getNextUpcomingQuestion() {
  return getUpcomingQuestions()[0] || null;
}

function getMasteryCounts() {
  const counts = { unmastered: 0, normal: 0, mastered: 0 };
  state.questions.forEach((question) => {
    if (counts[question.mastery] != null) counts[question.mastery] += 1;
  });
  return counts;
}

function getTagCounts() {
  const counts = new Map();
  state.tags.forEach((tag) => counts.set(tag, 0));
  state.questions.forEach((question) => {
    question.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

function getReviewsToday() {
  const today = todayKey();
  let count = 0;
  state.questions.forEach((question) => {
    question.reviewHistory.forEach((entry) => {
      if (dateKeyFromDate(new Date(entry.at)) === today) count += 1;
    });
  });
  return count;
}

function getTotalReviewCount() {
  return state.questions.reduce((sum, question) => sum + question.reviewHistory.length, 0);
}

function getReviewStreak() {
  const days = new Set();
  state.questions.forEach((question) => {
    question.reviewHistory.forEach((entry) => {
      const date = new Date(entry.at);
      if (!Number.isNaN(date.getTime())) days.add(dateKeyFromDate(date));
    });
  });
  if (!days.size) return 0;
  let cursor = todayKey();
  if (!days.has(cursor)) {
    const yesterday = addDaysToKey(cursor, -1);
    if (!days.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

function getImageCount() {
  return state.questions.filter((question) => question.image).length;
}

function getStorageEstimate() {
  let rawSize = 0;
  if (storageAvailable) {
    try {
      rawSize = (localStorage.getItem(STORAGE_KEY) || '').length;
    } catch (error) {
      rawSize = 0;
    }
  }
  const bytes = rawSize * 2;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getUpcomingGroups(limit = 6) {
  const groups = new Map();
  getUpcomingQuestions().forEach((question) => {
    if (!groups.has(question.nextReview)) groups.set(question.nextReview, []);
    groups.get(question.nextReview).push(question);
  });
  return [...groups.entries()]
    .slice(0, limit)
    .map(([date, questions]) => ({ date, questions }));
}

/* ---------- routing + ui state ---------- */
function getRouteFromHash() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '').trim();
  const route = raw.split(/[/?]/)[0];
  return VALID_ROUTES.has(route) ? route : 'home';
}

let currentRoute = getRouteFromHash();
const ui = {
  modal: null,
  form: null,
  review: null,
  quizSetup: { tag: 'all', count: 10 },
  quizSession: null,
  library: {
    search: '',
    tag: 'all',
    mastery: 'all',
    sort: 'newest'
  },
  pendingImport: null,
  dueBannerDismissed: '',
  lastDateKey: todayKey(),
  ocrRun: 0
};

function navigate(route) {
  if (!VALID_ROUTES.has(route)) return;
  const target = `#/${route}`;
  if (window.location.hash === target) {
    currentRoute = route;
    renderRoute({ scrollTop: true, animate: false });
    return;
  }
  window.location.hash = target;
}

function getPageSubtitleDue() {
  const due = getDueQuestions().length;
  if (due > 0) return `${due} 道错题正等待复习`;
  return '所有复习任务都在计划之中';
}


/* ============================================================
   Rendering layer
   ============================================================ */

function pageHeading(eyebrow, title, description, actions = '') {
  return `
    <div class="animate-view flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <p class="eyebrow">${eyebrow}</p>
        <h1 class="mt-3 font-display text-[2rem] font-semibold leading-[1.18] tracking-tight text-ink sm:text-[2.5rem]">${title}</h1>
        <p class="mt-2.5 max-w-2xl text-sm leading-6 text-ink/50">${description}</p>
      </div>
      ${actions ? `<div class="flex flex-none items-center gap-2.5">${actions}</div>` : ''}
    </div>
  `;
}

function renderShell() {
  const dueCount = getDueQuestions().length;
  const masteryCounts = getMasteryCounts();
  const total = state.questions.length;
  const masteredPct = total ? Math.round((masteryCounts.mastered / total) * 100) : 0;
  const sidebar = document.getElementById('sidebar');
  const mobileHeader = document.getElementById('mobile-header');
  const mobileNav = document.getElementById('mobile-nav');
  if (!sidebar || !mobileHeader || !mobileNav) return;

  sidebar.innerHTML = `
    <div class="flex h-full min-h-0 flex-col overflow-y-auto px-5 pb-6 pt-7">
      <a href="#/home" class="group flex items-center gap-3 rounded-2xl py-1 pr-2">
        <span class="flex h-11 w-11 flex-none items-center justify-center rounded-[15px] bg-pine-900 text-gold-200 shadow-[0_12px_26px_-16px_rgba(18,50,41,.95)] transition-transform duration-300 group-hover:-rotate-3">
          <span class="font-display text-[22px] font-semibold leading-none">隙</span>
        </span>
        <span class="min-w-0">
          <span class="block font-display text-[23px] font-semibold leading-none tracking-wide text-ink">知隙</span>
          <span class="mt-1.5 block text-[9px] font-semibold uppercase leading-none tracking-[0.22em] text-ink/38">Zhixi · 985 Econ</span>
        </span>
      </a>

      <div class="mt-10">
        <p class="px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-ink/30">Study space</p>
        <nav class="mt-3 space-y-1.5">
          ${NAV_ITEMS.map((item) => {
            const active = currentRoute === item.route;
            const badge = item.route === 'review' && dueCount > 0
              ? `<span class="nav-badge ${active ? 'bg-white/14 text-gold-100' : 'bg-gold-100 text-gold-700'}">${dueCount > 99 ? '99+' : dueCount}</span>`
              : '';
            return `
              <a href="#/${item.route}" class="group flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors ${active ? 'sidebar-active' : 'text-ink/55 hover:bg-white/70 hover:text-ink'}">
                <span class="${active ? 'text-gold-200' : 'text-ink/35 group-hover:text-pine-600'}">${icon(item.icon, 'h-[19px] w-[19px]')}</span>
                <span class="flex min-w-0 flex-1 items-baseline gap-2">
                  <span class="text-[13.5px] font-semibold tracking-wide">${item.label}</span>
                  <span class="text-[8px] font-semibold uppercase tracking-[0.16em] ${active ? 'text-white/35' : 'text-ink/24'}">${item.en}</span>
                </span>
                ${badge}
              </a>
            `;
          }).join('')}
        </nav>
      </div>

      <button type="button" data-action="open-new" class="btn btn-primary mt-5 w-full justify-between px-4">
        <span class="flex items-center gap-2">${icon('plus', 'h-4 w-4', 2.1)}录入错题</span>
        <span class="text-[10px] font-normal tracking-wider text-white/38">NEW</span>
      </button>

      <div class="mt-auto pt-8">
        <div class="rounded-2xl border border-line/80 bg-white/55 p-4">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[11px] font-semibold tracking-wide text-ink/55">掌握进度</span>
            <span class="font-num text-[13px] font-bold text-pine-800">${masteredPct}%</span>
          </div>
          <div class="progress-track mt-2.5 h-1.5">
            <div class="progress-fill bg-pine-600" style="width:${masteredPct}%"></div>
          </div>
          <p class="mt-2.5 text-[10px] leading-5 text-ink/36">已掌握 ${masteryCounts.mastered} / ${total} 道错题</p>
        </div>

        <div class="mt-4 border-l-2 border-gold-300 pl-3.5">
          <p class="font-display text-[13px] leading-6 text-ink/55">博学之，审问之，<br>慎思之，明辨之，笃行之。</p>
          <p class="mt-1 text-[9px] tracking-[0.16em] text-ink/28">《礼记 · 中庸》</p>
        </div>

        <p class="mt-5 flex items-center gap-1.5 text-[9px] tracking-wide text-ink/28">
          ${icon(isCloudMode() ? 'cloud' : 'lock', 'h-3 w-3')} ${isCloudMode() ? '账号隔离 · 云端同步' : '数据保存在本机浏览器'}
        </p>
      </div>
    </div>
  `;

  mobileHeader.innerHTML = `
    <div class="flex h-[64px] items-center justify-between gap-3 px-4">
      <a href="#/home" class="flex min-w-0 items-center gap-2.5">
        <span class="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-pine-900 text-gold-200">
          <span class="font-display text-lg font-semibold leading-none">隙</span>
        </span>
        <span class="min-w-0">
          <span class="block font-display text-[19px] font-semibold leading-none tracking-wide">知隙</span>
          <span class="mt-1 block text-[8px] font-semibold uppercase tracking-[0.16em] text-ink/35">985 Econ · 错题本</span>
        </span>
      </a>
      <div class="flex flex-none items-center gap-2">
        ${dueCount > 0
          ? `<a href="#/review" class="inline-flex h-9 items-center gap-1.5 rounded-full border border-gold-200 bg-gold-50 px-3 text-[11px] font-semibold text-gold-700">
              <span class="relative flex h-1.5 w-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-45"></span><span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-500"></span></span>
              ${dueCount > 99 ? '99+' : dueCount} 道待复习
            </a>`
          : `<span class="inline-flex h-9 items-center gap-1.5 rounded-full border border-pine-100 bg-pine-50 px-3 text-[11px] font-semibold text-pine-600">${icon('check', 'h-3 w-3', 2.3)}今日已清空</span>`}
      </div>
    </div>
  `;

  mobileNav.innerHTML = `
    <div class="safe-bottom mx-auto grid max-w-xl grid-cols-5 items-end gap-1 px-2 pt-1.5">
      ${NAV_ITEMS.map((item) => {
        const active = currentRoute === item.route;
        const dueBadge = item.route === 'review' && dueCount > 0
          ? `<span class="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-clay-500 px-0.5 text-[8px] font-bold leading-none text-white ring-2 ring-paper2">${dueCount > 9 ? '9+' : dueCount}</span>`
          : '';
        return `
          <a href="#/${item.route}" class="group flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 pb-1 pt-1.5">
            <span class="relative flex h-7 w-10 items-center justify-center rounded-lg transition-colors ${active ? 'bg-pine-900 text-gold-100' : 'text-ink/36'}">
              ${icon(item.icon, 'h-[18px] w-[18px]')}
              ${dueBadge}
            </span>
            <span class="text-[10px] font-semibold ${active ? 'text-pine-900' : 'text-ink/34'}">${item.label}</span>
          </a>
        `;
      }).join('')}
    </div>
  `;

  updateFabVisibility();
}

function updateFabVisibility() {
  const fab = document.getElementById('fab');
  if (!fab) return;
  fab.innerHTML = icon('plus', 'h-[24px] w-[24px]', 2);
  const hideForReview = currentRoute === 'review' && ui.review && ui.review.phase === 'active';
  const hideForQuiz = currentRoute === 'quiz' && ui.quizSession && ui.quizSession.phase === 'playing';
  const hideForSettings = false;
  fab.classList.toggle('is-hidden', Boolean(hideForReview || hideForQuiz || hideForSettings));
}

function updateDueBanner() {
  const el = document.getElementById('due-banner');
  if (!el) return;
  const dueCount = getDueQuestions().length;
  const hiddenRoute = currentRoute === 'home' || currentRoute === 'review';
  const inActiveQuiz = currentRoute === 'quiz' && ui.quizSession && ui.quizSession.phase === 'playing';
  const dismissed = ui.dueBannerDismissed === todayKey();
  if (!dueCount || hiddenRoute || inActiveQuiz || dismissed) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="mb-4 flex items-center gap-3 rounded-2xl border border-gold-200/80 bg-gold-50/90 px-3.5 py-2.5 shadow-[0_8px_24px_-22px_rgba(122,84,40,.55)] sm:px-4">
      <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gold-100 text-gold-700">${icon('bell', 'h-4 w-4')}</span>
      <p class="min-w-0 flex-1 text-xs leading-5 text-gold-700/80">今天有 <strong class="font-num font-bold text-gold-700">${dueCount}</strong> 道错题到了复习时间</p>
      <a href="#/review" class="flex-none text-[11px] font-bold text-gold-700 underline decoration-gold-300 underline-offset-4 hover:text-gold-600">去复习</a>
      <button type="button" class="flex h-8 w-8 flex-none items-center justify-center rounded-full text-gold-700/45 hover:bg-gold-100 hover:text-gold-700" data-action="dismiss-due-banner" aria-label="关闭提醒">${icon('x', 'h-3.5 w-3.5')}</button>
    </div>
  `;
}

function renderRoute(options = {}) {
  currentRoute = getRouteFromHash();
  const view = document.getElementById('view');
  if (!view) return;
  const animate = options.animate !== false;
  view.innerHTML = renderCurrentView();
  view.classList.toggle('animate-view', animate);
  renderShell();
  updateDueBanner();
  updateFabVisibility();
  typesetMath(view);
  if (options.scrollTop) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function rerenderCurrentView(options = {}) {
  const view = document.getElementById('view');
  if (!view) return;
  view.innerHTML = renderCurrentView();
  renderShell();
  updateDueBanner();
  updateFabVisibility();
  typesetMath(view);
  if (options.scrollTop) {
    window.scrollTo({ top: 0, behavior: options.smooth ? 'smooth' : 'auto' });
  }
}

function renderCurrentView() {
  switch (currentRoute) {
    case 'library':
      return renderLibraryView();
    case 'review':
      return renderReviewView();
    case 'quiz':
      return renderQuizView();
    case 'settings':
      return renderSettingsView();
    case 'home':
    default:
      return renderHomeView();
  }
}

/* ============================================================
   Home
   ============================================================ */

function renderHomeView() {
  const total = state.questions.length;
  const due = getDueQuestions();
  const dueCount = due.length;
  const reviewedToday = getReviewsToday();
  const streak = getReviewStreak();
  const activeReview = ui.review && ui.review.phase === 'active';

  const hero = `
    <section class="animate-view relative overflow-hidden rounded-[28px] bg-pine-900 text-[#F8F4EB] shadow-[0_30px_80px_-48px_rgba(18,50,41,.85)] sm:rounded-[32px]">
      <div class="hero-lines pointer-events-none absolute inset-0"></div>
      <div class="hero-orb pointer-events-none absolute -right-24 -top-36 h-[28rem] w-[28rem] rounded-full"></div>
      <div class="pointer-events-none absolute -right-7 top-24 h-52 w-52 rounded-full border border-white/[0.07]"></div>
      <div class="pointer-events-none absolute -right-16 top-16 h-72 w-72 rounded-full border border-white/[0.055]"></div>
      <div class="pointer-events-none absolute bottom-0 left-0 h-px w-2/3 bg-gradient-to-r from-gold-300/30 to-transparent"></div>

      <div class="relative grid gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[1.45fr_.72fr] lg:items-center lg:gap-10 lg:px-11 lg:py-12">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.055] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.17em] text-gold-100/75">
              <span class="h-1 w-1 rounded-full bg-gold-300"></span>${formatTodayLong()}
            </span>
            <span class="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25">For 985 Economics</span>
          </div>

          <h1 class="mt-5 font-display text-[2.15rem] font-semibold leading-[1.26] tracking-tight sm:text-[2.8rem] lg:text-[3.35rem]">
            把每一道错题，<br>
            <span class="text-gold-200">变成下一次得分。</span>
          </h1>
          <p class="mt-4 max-w-xl text-[12.5px] leading-6 text-white/48 sm:text-[13.5px] sm:leading-7">
            ${total === 0
              ? '从第一道错题开始，记录、反思、重逢。让遗忘曲线替你安排复习节奏。'
              : dueCount > 0
                ? `${greeting()}。今天有 <span class="font-semibold text-gold-100">${dueCount}</span> 道错题到了该重逢的时候，先把它们逐一补上。`
                : `${greeting()}。今日复习已经清空，下一轮记忆安排在计划之中，保持这个节奏。`}
          </p>

          <div class="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            ${dueCount > 0 || activeReview
              ? `${activeReview
                  ? `<a href="#/review" class="btn btn-gold w-full sm:w-auto">${icon('arrow-right', 'h-4 w-4', 2.1)}继续今日复习</a>`
                  : `<button type="button" data-action="start-review" class="btn btn-gold w-full sm:w-auto">${icon('arrow-right', 'h-4 w-4', 2.1)}开始今日复习</button>`}`
              : `<button type="button" data-action="open-new" class="btn btn-gold w-full sm:w-auto">${icon('plus', 'h-4 w-4', 2.1)}${total === 0 ? '录入第一道错题' : '再记一道错题'}</button>`}
            <a href="#/library" class="btn w-full border-white/15 bg-white/[0.035] text-white/72 hover:bg-white/[0.075] hover:text-white sm:w-auto">
              ${icon('book', 'h-4 w-4')}打开错题本
            </a>
          </div>

          <div class="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-white/30">
            <span class="inline-flex items-center gap-1.5">${icon('sparkles', 'h-3.5 w-3.5')}艾宾浩斯自动排期</span>
            <span class="inline-flex items-center gap-1.5">${icon(isCloudMode() ? 'cloud' : 'lock', 'h-3 w-3')}${isCloudMode() ? '账号私有 · 云端同步' : '本地保存 · 离线可用'}</span>
            <span class="inline-flex items-center gap-1.5">${icon('camera', 'h-3.5 w-3.5')}拍照 OCR 录题</span>
          </div>
        </div>

        <aside class="relative rounded-[22px] border border-white/12 bg-white/[0.055] p-4 backdrop-blur-sm sm:p-5">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/38">Today's review</p>
            <span class="rounded-full border border-white/10 px-2 py-1 text-[9px] font-semibold ${dueCount ? 'bg-gold-300/10 text-gold-100' : 'bg-white/5 text-white/40'}">
              ${dueCount ? '待复习' : '已完成'}
            </span>
          </div>
          <div class="mt-3 flex items-end gap-2">
            <span class="font-display font-num text-[4.2rem] leading-[.9] tracking-tight text-gold-200">${dueCount > 99 ? '99+' : String(dueCount).padStart(2, '0')}</span>
            <span class="pb-1.5 text-[11px] leading-5 text-white/40">道<br>到期</span>
          </div>
          <div class="mt-5">
            <div class="flex items-center justify-between text-[9px] text-white/35">
              <span>今日进度</span>
              <span class="font-num">${reviewedToday} 道已复习</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-200 transition-all duration-500" style="width:${dueCount + reviewedToday ? Math.round((reviewedToday / (dueCount + reviewedToday)) * 100) : 0}%"></div>
            </div>
          </div>
          <div class="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3 text-[10px] text-white/36">
            <span>连续复习 <strong class="font-num font-semibold text-white/70">${streak}</strong> 天</span>
            <span>${state.questions.reduce((sum, q) => sum + q.reviewHistory.length, 0)} 次复盘</span>
          </div>
        </aside>
      </div>
    </section>
  `;

  if (total === 0) {
    return hero + renderHomeOnboarding();
  }

  return `
    ${hero}
    <div class="mt-5 grid gap-5 xl:grid-cols-12">
      <section class="xl:col-span-8 rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
        ${renderDueCard(due)}
      </section>
      <section class="xl:col-span-4 rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
        ${renderMasteryCard()}
      </section>
      <section class="xl:col-span-8 rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
        ${renderRecentCard()}
      </section>
      <aside class="xl:col-span-4 space-y-5">
        <section class="rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
          ${renderTagOverviewCard()}
        </section>
        <section class="relative overflow-hidden rounded-[26px] border border-[#E8E0D1] bg-[#F0EBDF] p-5 sm:p-6">
          <div class="pointer-events-none absolute -right-7 -top-9 h-28 w-28 rounded-full border border-gold-600/10"></div>
          <span class="font-display text-3xl leading-none text-gold-500/55">“</span>
          <p class="mt-1 font-display text-[15px] leading-7 text-ink/65">为学日益，为道日损。记录错题，不是记住失败，而是看清自己真正的知识边界。</p>
          <div class="mt-3 h-px w-8 bg-gold-400/50"></div>
          <p class="mt-2 text-[9px] uppercase tracking-[0.17em] text-ink/30">A note for the long run</p>
        </section>
      </aside>
    </div>
  `;
}

function renderHomeOnboarding() {
  const steps = [
    {
      number: '01',
      title: '录入错题',
      desc: '拍照 OCR 或手动输入题干、参考答案与真正错因。',
      iconName: 'camera'
    },
    {
      number: '02',
      title: '标好掌握度',
      desc: '用标签收纳知识模块，用掌握程度决定初始复习间隔。',
      iconName: 'tag'
    },
    {
      number: '03',
      title: '按曲线重逢',
      desc: '在将忘未忘时复习；每次反馈都会动态调整下一次日期。',
      iconName: 'review'
    }
  ];
  return `
    <section class="mt-5 overflow-hidden rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-7">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="eyebrow">Start here</p>
          <h2 class="mt-2.5 font-display text-[1.65rem] font-semibold leading-tight">从第一道错题开始</h2>
          <p class="mt-2 text-[13px] leading-6 text-ink/45">${isCloudMode() ? '登录后，每一条错题只属于你。账号密码登录，多设备自动接续。' : '每一条错题只属于你。数据保存在当前浏览器，可随时导出 JSON 备份。'}</p>
        </div>
        <button type="button" data-action="load-demo" class="btn btn-secondary self-start sm:self-auto">${icon('sparkles', 'h-4 w-4')}载入示例看看</button>
      </div>
      <div class="mt-6 grid gap-3 sm:grid-cols-3">
        ${steps.map((step) => `
          <div class="group rounded-2xl border border-line-soft bg-paper2/70 p-4 transition-colors hover:border-gold-200 hover:bg-gold-50/40">
            <div class="flex items-center justify-between">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-pine-700 ring-1 ring-line-soft">${icon(step.iconName, 'h-4 w-4')}</span>
              <span class="font-num text-[10px] font-bold tracking-[0.18em] text-ink/20">${step.number}</span>
            </div>
            <h3 class="mt-3 text-[13px] font-bold text-ink/80">${step.title}</h3>
            <p class="mt-1.5 text-[11px] leading-5 text-ink/40">${step.desc}</p>
          </div>
        `).join('')}
      </div>
      <div class="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <button type="button" data-action="open-new" class="btn btn-primary">${icon('plus', 'h-4 w-4', 2.1)}录入第一道错题</button>
        <a href="#/settings" class="btn btn-ghost justify-start text-ink/42">了解复习算法与数据备份 ${icon('arrow-right', 'h-4 w-4')}</a>
      </div>
    </section>

    <section class="mt-5 grid gap-4 sm:grid-cols-3">
      ${[
        ['1', '首轮间隔', '明天安排第一次复习'],
        ['8', '记忆节点', '最长间隔延展至 90 天'],
        ['∞', isCloudMode() ? '云端同步' : '本地保存', isCloudMode() ? '账号隔离 · 多设备接续' : '无需登录 · 打开即用']
      ].map(([number, title, desc]) => `
        <div class="rounded-2xl border border-line/80 bg-[#F9F6EF] px-5 py-4">
          <p class="font-display font-num text-2xl font-semibold text-pine-800">${number}</p>
          <p class="mt-1 text-[11px] font-bold text-ink/65">${title}</p>
          <p class="mt-1 text-[10px] text-ink/35">${desc}</p>
        </div>
      `).join('')}
    </section>
  `;
}

function renderDueCard(due) {
  const activeReview = ui.review && ui.review.phase === 'active';
  if (!due.length) {
    const next = getNextUpcomingQuestion();
    return `
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="eyebrow">Review queue</p>
          <h2 class="mt-2 font-display text-[1.55rem] font-semibold leading-tight">今日复习</h2>
        </div>
        <span class="rounded-full bg-pine-50 px-2.5 py-1 text-[10px] font-semibold text-pine-600">已清空</span>
      </div>
      <div class="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-pine-200/80 bg-pine-50/40 px-5 py-9 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-white text-pine-600 shadow-sm ring-1 ring-pine-100">${icon('check', 'h-6 w-6', 2.1)}</span>
        <h3 class="mt-4 font-display text-xl font-semibold text-ink/80">今天的复习已完成</h3>
        <p class="mt-1.5 max-w-sm text-[11px] leading-5 text-ink/40">
          ${next ? `下一道安排在 <span class="font-semibold text-pine-700">${formatRelativeDate(next.nextReview)}</span>。不必追赶，记忆需要间隔。` : '录入错题后，系统会自动为每一道题安排复习日期。'}
        </p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <a href="#/review" class="btn btn-secondary">查看复习计划</a>
          ${next ? '' : `<button type="button" data-action="open-new" class="btn btn-soft">录入错题</button>`}
        </div>
      </div>
    `;
  }

  return `
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="eyebrow">Review queue</p>
        <div class="mt-2 flex flex-wrap items-center gap-2.5">
          <h2 class="font-display text-[1.55rem] font-semibold leading-tight">今日复习</h2>
          <span class="rounded-full bg-gold-50 px-2 py-1 text-[10px] font-bold text-gold-700">${due.length} 道待完成</span>
        </div>
        <p class="mt-1.5 text-[11px] leading-5 text-ink/38">按遗忘曲线与逾期程度排序，先处理最该重逢的题。</p>
      </div>
      <span class="hidden h-10 w-10 flex-none items-center justify-center rounded-xl bg-paper2 text-ink/30 sm:flex">${icon('clock', 'h-[18px] w-[18px]')}</span>
    </div>

    <div class="mt-4 space-y-0.5">
      ${due.slice(0, 4).map((question, index) => renderDueRow(question, index)).join('')}
    </div>

    <div class="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-[10px] text-ink/32">今日已复习 <span class="font-semibold text-ink/55">${getReviewsToday()}</span> 道 · 连续 <span class="font-semibold text-ink/55">${getReviewStreak()}</span> 天</p>
      ${activeReview
        ? `<a href="#/review" class="btn btn-primary">继续未完成的复习 ${icon('arrow-right', 'h-4 w-4')}</a>`
        : `<button type="button" data-action="start-review" class="btn btn-primary">开始复习 ${due.length} 道 ${icon('arrow-right', 'h-4 w-4')}</button>`}
    </div>
  `;
}

function renderDueRow(question, index) {
  const overdue = daysBetweenKeys(todayKey(), question.nextReview) < 0;
  return `
    <div class="group relative flex items-center gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-paper2">
      <a href="#/review" data-action="open-question" data-id="${esc(question.id)}" class="absolute inset-0 z-0 rounded-xl" aria-label="查看错题详情"></a>
      <span class="pointer-events-none relative z-[1] flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-line-soft bg-white font-num text-[10px] font-bold text-ink/35">${String(index + 1).padStart(2, '0')}</span>
      <div class="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <p class="q-clamp-1 text-[12.5px] font-medium leading-6 text-ink/78">${renderPreviewText(question.stem)}</p>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">
          ${question.tags.slice(0, 2).map((tag) => tagChip(tag)).join('')}
          ${overdue ? `<span class="text-[9px] font-semibold text-clay-600">${dueLabel(question)}</span>` : ''}
        </div>
      </div>
      <span class="pointer-events-none relative z-[1] hidden flex-none text-ink/25 transition-transform group-hover:translate-x-0.5 group-hover:text-pine-600 sm:block">${icon('chevron-right', 'h-4 w-4')}</span>
    </div>
  `;
}

function renderMasteryCard() {
  const counts = getMasteryCounts();
  const total = state.questions.length;
  const pMastered = total ? (counts.mastered / total) * 100 : 0;
  const pNormal = total ? (counts.normal / total) * 100 : 0;
  const pUnmastered = total ? (counts.unmastered / total) * 100 : 0;
  const masteredPct = total ? Math.round(pMastered) : 0;
  const ringBackground = total
    ? `conic-gradient(#3F7562 0 ${pMastered}%, #C29A54 ${pMastered}% ${pMastered + pNormal}%, #B46650 ${pMastered + pNormal}% ${pMastered + pNormal + pUnmastered}%)`
    : 'conic-gradient(#E8E2D6 0 100%)';

  return `
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="eyebrow">Mastery</p>
        <h2 class="mt-2 font-display text-[1.55rem] font-semibold leading-tight">掌握进度</h2>
      </div>
      <span class="hidden h-10 w-10 flex-none items-center justify-center rounded-xl bg-paper2 text-ink/30 sm:flex">${icon('chart', 'h-[18px] w-[18px]')}</span>
    </div>
    <div class="mt-5 flex items-center gap-5">
      <div class="relative flex h-[7.5rem] w-[7.5rem] flex-none items-center justify-center rounded-full" style="background:${ringBackground}">
        <div class="absolute inset-[9px] rounded-full bg-white"></div>
        <div class="relative text-center">
          <p class="font-display font-num text-[1.7rem] font-semibold leading-none text-ink">${masteredPct}<span class="ml-0.5 text-sm text-ink/35">%</span></p>
          <p class="mt-1.5 text-[9px] font-semibold tracking-wide text-ink/35">已掌握</p>
        </div>
      </div>
      <div class="min-w-0 flex-1 space-y-3">
        ${MASTERY_ORDER.map((key) => {
          const meta = MASTERY[key];
          const count = counts[key];
          const percent = total ? Math.round((count / total) * 100) : 0;
          return `
            <div>
              <div class="flex items-center gap-1.5 text-[10px] text-ink/45">
                <span class="h-1.5 w-1.5 flex-none rounded-full" style="background:${meta.color}"></span>
                <span class="flex-1">${meta.label}</span>
                <span class="font-num font-semibold text-ink/70">${count}</span>
                <span class="w-7 text-right font-num text-[9px] text-ink/28">${percent}%</span>
              </div>
              <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.055]">
                <div class="h-full rounded-full" style="width:${percent}%;background:${meta.color};opacity:.78"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="mt-5 flex items-start gap-2 rounded-xl bg-paper2/80 px-3 py-2.5 text-[10px] leading-5 text-ink/38">
      ${icon('sparkles', 'mt-0.5 h-3.5 w-3.5 flex-none text-gold-500/75')}
      <p>掌握程度会随每次复习反馈自动更新。别急着标记「已掌握」，能独立复述才是真的会。</p>
    </div>
  `;
}

function renderRecentCard() {
  const questions = [...state.questions]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 4);
  return `
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="eyebrow">Recently added</p>
        <h2 class="mt-2 font-display text-[1.55rem] font-semibold leading-tight">最近录入</h2>
      </div>
      <a href="#/library" class="inline-flex items-center gap-1 text-[11px] font-semibold text-pine-700/55 hover:text-pine-800">全部错题 ${icon('arrow-right', 'h-3.5 w-3.5')}</a>
    </div>
    <div class="mt-3 divide-y divide-line-soft/70">
      ${questions.map((question) => `
        <div class="group relative flex items-center gap-3 py-3">
          <a href="#/library" data-action="open-question" data-id="${esc(question.id)}" class="absolute inset-0 z-0 -mx-2 rounded-xl" aria-label="查看错题详情"></a>
          <div class="relative z-[1] h-9 w-[3px] flex-none rounded-full" style="background:${MASTERY[question.mastery].color};opacity:.55"></div>
          <div class="relative z-[1] min-w-0 flex-1 pointer-events-none">
            <p class="q-clamp-1 text-[12.5px] font-medium leading-6 text-ink/76">${renderPreviewText(question.stem)}</p>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <span class="text-[9px] text-ink/28">${formatCreated(question.createdAt)}</span>
              ${question.tags.slice(0, 2).map((tag) => tagChip(tag)).join('')}
            </div>
          </div>
          <div class="relative z-[1] flex flex-none items-center gap-2 pointer-events-none">
            ${masteryPill(question.mastery)}
            <span class="hidden text-ink/22 transition-transform group-hover:translate-x-0.5 sm:block">${icon('chevron-right', 'h-4 w-4')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTagOverviewCard() {
  const used = getTagCounts().filter((item) => item.count > 0).slice(0, 6);
  const max = used.length ? used[0].count : 1;
  return `
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="eyebrow">Knowledge tags</p>
        <h2 class="mt-2 font-display text-[1.55rem] font-semibold leading-tight">标签分布</h2>
      </div>
      <a href="#/settings" class="flex h-8 w-8 items-center justify-center rounded-lg text-ink/30 hover:bg-paper2 hover:text-pine-700" aria-label="管理标签">${icon('settings', 'h-4 w-4')}</a>
    </div>
    ${used.length
      ? `<div class="mt-4 space-y-3">
          ${used.map(({ tag, count }) => {
            const tone = tagTone(tag);
            return `
              <div>
                <div class="flex items-center justify-between gap-3 text-[10.5px]">
                  <span class="inline-flex min-w-0 items-center gap-1.5 text-ink/55"><span class="h-1.5 w-1.5 flex-none rounded-full" style="background:${tone.color};opacity:.65"></span><span class="truncate">${esc(tag)}</span></span>
                  <span class="font-num font-semibold text-ink/38">${count}</span>
                </div>
                <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.05]">
                  <div class="h-full rounded-full" style="width:${Math.max(7, Math.round((count / max) * 100))}%;background:${tone.color};opacity:.6"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>`
      : `<div class="mt-5 rounded-xl border border-dashed border-line bg-paper2/60 px-4 py-5 text-center">
          <p class="text-[11px] leading-5 text-ink/40">还没有用过标签。给错题归个类，复习时更容易聚焦薄弱模块。</p>
          <a href="#/library" class="mt-2 inline-flex text-[10px] font-semibold text-pine-700">去错题本看看 ${icon('arrow-right', 'ml-1 h-3 w-3')}</a>
        </div>`}
  `;
}

/* ============================================================
   Library
   ============================================================ */

function getFilteredLibraryQuestions() {
  const search = ui.library.search.trim().toLowerCase();
  const terms = search ? search.split(/\s+/).filter(Boolean) : [];
  let list = state.questions.filter((question) => {
    if (ui.library.tag !== 'all' && !question.tags.includes(ui.library.tag)) return false;
    if (ui.library.mastery !== 'all' && question.mastery !== ui.library.mastery) return false;
    if (terms.length) {
      const haystack = [
        question.stem,
        question.answer,
        question.analysis,
        question.tags.join(' ')
      ].join('\n').toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });

  if (ui.library.sort === 'due') {
    list = sortedByReview(list);
  } else if (ui.library.sort === 'mastery') {
    list = [...list].sort((a, b) => {
      const rank = MASTERY_RANK[a.mastery] - MASTERY_RANK[b.mastery];
      if (rank !== 0) return rank;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  } else if (ui.library.sort === 'oldest') {
    list = [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  } else {
    list = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  return list;
}

function renderLibraryView() {
  const total = state.questions.length;
  const dueCount = getDueQuestions().length;
  return `
    ${pageHeading(
      'Question archive',
      '错题本',
      `共 ${total} 道错题${dueCount ? ` · <span class="font-semibold text-gold-700">${dueCount} 道待复习</span>` : ' · 复习节奏正常'}`,
      `<button type="button" data-action="open-new" class="btn btn-primary w-full sm:w-auto">${icon('plus', 'h-4 w-4', 2.1)}录入错题</button>`
    )}

    <section class="card mt-6 p-3.5 sm:p-4">
      <div class="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <label class="relative block min-w-0 flex-1" for="library-search">
          <span class="sr-only">搜索错题</span>
          <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/28">${icon('search', 'h-[18px] w-[18px]')}</span>
          <input id="library-search" type="search" class="field pl-11 pr-10" placeholder="搜索题干、答案、错因或标签…" value="${esc(ui.library.search)}" autocomplete="off">
          <button id="library-search-clear" type="button" data-action="clear-library-search" class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink/30 hover:bg-paper2 hover:text-ink/65 ${ui.library.search ? '' : 'hidden'}" aria-label="清空搜索">${icon('x', 'h-3.5 w-3.5')}</button>
        </label>
        <div class="flex flex-none items-center gap-2">
          <label for="library-sort" class="flex items-center gap-1.5 text-[10px] font-semibold text-ink/35">${icon('sort', 'h-3.5 w-3.5')}排序</label>
          <select id="library-sort" class="field min-h-[42px] w-auto min-w-[7.5rem] cursor-pointer py-2 pr-8 text-[12px]">
            <option value="newest" ${ui.library.sort === 'newest' ? 'selected' : ''}>最新录入</option>
            <option value="due" ${ui.library.sort === 'due' ? 'selected' : ''}>按复习日期</option>
            <option value="mastery" ${ui.library.sort === 'mastery' ? 'selected' : ''}>按掌握程度</option>
            <option value="oldest" ${ui.library.sort === 'oldest' ? 'selected' : ''}>最早录入</option>
          </select>
        </div>
      </div>

      <div class="mt-3 flex flex-col gap-2.5 border-t border-line-soft/80 pt-3 xl:flex-row xl:items-center xl:gap-4">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-paper2 text-ink/30">${icon('tag', 'h-3.5 w-3.5')}</span>
          <div id="library-tag-filters" class="no-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
            ${renderLibraryTagFilters()}
          </div>
        </div>
        <div id="library-mastery-filters" class="no-scrollbar flex flex-none items-center gap-1.5 overflow-x-auto border-line-soft pb-0.5 xl:ml-auto xl:border-l xl:pl-4">
          ${renderLibraryMasteryFilters()}
        </div>
      </div>
    </section>

    <div class="mt-5 flex flex-wrap items-center justify-between gap-2 px-1">
      <p id="library-results-meta" class="text-[11px] text-ink/35">${renderLibraryResultsMeta(getFilteredLibraryQuestions())}</p>
      <p class="text-[10px] text-ink/25">点击卡片查看完整题目与错因</p>
    </div>
    <div id="library-results" class="mt-3">
      ${renderLibraryResultsMarkup(getFilteredLibraryQuestions())}
    </div>
  `;
}

function renderLibraryTagFilters() {
  const counts = getTagCounts();
  const total = state.questions.length;
  const buttons = [
    `<button type="button" data-action="filter-tag" data-tag="all" aria-pressed="${ui.library.tag === 'all'}" class="inline-flex flex-none items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10.5px] font-semibold transition-colors ${ui.library.tag === 'all' ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-white text-ink/48 hover:border-pine-200 hover:text-pine-700'}">
      全部<span class="font-num opacity-55">${total}</span>
    </button>`
  ];
  counts.forEach(({ tag, count }) => {
    const active = ui.library.tag === tag;
    buttons.push(`
      <button type="button" data-action="filter-tag" data-tag="${esc(tag)}" aria-pressed="${active}" class="inline-flex flex-none items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10.5px] font-semibold transition-colors ${active ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-white text-ink/48 hover:border-pine-200 hover:text-pine-700'}">
        ${esc(tag)}<span class="font-num opacity-50">${count}</span>
      </button>
    `);
  });
  return buttons.join('');
}

function renderLibraryMasteryFilters() {
  const counts = getMasteryCounts();
  const total = state.questions.length;
  const items = [
    { key: 'all', label: '全部', count: total, color: '' },
    ...MASTERY_ORDER.map((key) => ({ key, label: MASTERY[key].label, count: counts[key], color: MASTERY[key].color }))
  ];
  return items.map((item) => {
    const active = ui.library.mastery === item.key;
    return `
      <button type="button" data-action="filter-mastery" data-mastery="${item.key}" aria-pressed="${active}" class="inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10.5px] font-semibold transition-colors ${active ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-white text-ink/46 hover:border-pine-200 hover:text-pine-700'}">
        ${item.color ? `<span class="h-1.5 w-1.5 rounded-full" style="background:${active ? 'rgba(255,255,255,.72)' : item.color}"></span>` : ''}
        ${item.label}<span class="font-num opacity-50">${item.count}</span>
      </button>
    `;
  }).join('');
}

function renderLibraryResultsMeta(list) {
  const hasFilters = ui.library.search || ui.library.tag !== 'all' || ui.library.mastery !== 'all';
  if (!state.questions.length) return '还没有错题';
  if (!list.length) return hasFilters ? '没有匹配的错题' : '还没有错题';
  return `找到 <span class="font-num font-semibold text-ink/60">${list.length}</span> 道错题${hasFilters ? ' · 已筛选' : ''}`;
}

function renderLibraryResultsMarkup(list) {
  if (!state.questions.length) {
    return `
      <div class="rounded-[26px] border border-dashed border-line bg-white/55 px-6 py-14 text-center">
        <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-pine-900 text-gold-200 shadow-soft">${icon('book', 'h-6 w-6')}</span>
        <h2 class="mt-5 font-display text-2xl font-semibold">错题本还是空的</h2>
        <p class="mx-auto mt-2 max-w-md text-xs leading-6 text-ink/42">你的每一次失误都值得被认真记录。拍照识别题目，写好参考答案和真正错因，剩下的交给复习曲线。</p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" data-action="open-new" class="btn btn-primary">${icon('plus', 'h-4 w-4', 2.1)}录入第一道错题</button>
          <button type="button" data-action="load-demo" class="btn btn-secondary">载入示例</button>
        </div>
      </div>
    `;
  }
  if (!list.length) {
    const hasFilters = ui.library.search || ui.library.tag !== 'all' || ui.library.mastery !== 'all';
    return `
      <div class="rounded-[24px] border border-dashed border-line bg-white/50 px-6 py-12 text-center">
        <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper2 text-ink/30">${icon('search', 'h-5 w-5')}</span>
        <p class="mt-4 text-[13px] font-semibold text-ink/60">没有找到匹配的错题</p>
        <p class="mt-1 text-[11px] text-ink/35">试试更换标签、掌握程度，或清空搜索词。</p>
        ${hasFilters ? `<button type="button" data-action="clear-library-filters" class="btn btn-secondary mt-4">${icon('refresh', 'h-4 w-4')}清除筛选条件</button>` : ''}
      </div>
    `;
  }
  return `
    <div class="grid gap-3.5 xl:grid-cols-2">
      ${list.map((question) => renderQuestionCard(question)).join('')}
    </div>
  `;
}

function renderQuestionCard(question) {
  const tone = MASTERY[question.mastery];
  const dueToneValue = dueTone(question);
  const extraTags = question.tags.length > 3 ? `<span class="tag-chip" style="background:#F7F5EF;border-color:#EEE9DF;color:rgba(27,41,34,.38)">+${question.tags.length - 3}</span>` : '';
  return `
    <article class="group relative overflow-hidden rounded-[22px] border border-line bg-white/90 p-4 shadow-[0_1px_2px_rgba(27,41,34,.02)] transition duration-200 hover:-translate-y-0.5 hover:border-[#D6CDBB] hover:shadow-soft sm:p-5">
      <span class="absolute left-0 top-0 h-full w-[3px]" style="background:${tone.color};opacity:.62"></span>
      <a href="#/library" data-action="open-question" data-id="${esc(question.id)}" class="absolute inset-0 z-0 rounded-[22px]" aria-label="查看错题详情"></a>
      <div class="overlay-content">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          ${masteryPill(question.mastery)}
          ${question.tags.slice(0, 3).map((tag) => tagChip(tag)).join('')}
          ${extraTags}
          <span class="ml-auto text-[9px] text-ink/25">${formatCreated(question.createdAt)}</span>
        </div>
        <div class="mt-3.5">
          <p class="q-clamp-2 rich-text text-[13.5px] font-medium leading-[1.85] text-ink/80">${renderPreviewText(question.stem)}</p>
        </div>
        ${question.image ? `<div class="mt-2 inline-flex items-center gap-1 text-[9px] text-ink/28">${icon('image', 'h-3 w-3')}含题目图片</div>` : ''}
        <div class="mt-3.5 flex items-center justify-between gap-3 border-t border-line-soft/80 pt-3">
          <span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9.5px] font-semibold" style="color:${dueToneValue.text};background:${dueToneValue.bg};border-color:${dueToneValue.border}">
            ${icon('clock', 'h-3 w-3')}${dueLabel(question)}
          </span>
          <div class="pointer-auto flex items-center gap-1">
            <button type="button" data-action="edit-question" data-id="${esc(question.id)}" class="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-ink/38 transition-colors hover:bg-paper2 hover:text-pine-800" aria-label="编辑错题">${icon('edit', 'h-3.5 w-3.5')}编辑</button>
            <button type="button" data-action="open-question" data-id="${esc(question.id)}" class="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-pine-700 transition-colors hover:bg-pine-50" aria-label="查看详情">详情 ${icon('arrow-right', 'h-3.5 w-3.5')}</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function refreshLibraryView() {
  const tagContainer = document.getElementById('library-tag-filters');
  const masteryContainer = document.getElementById('library-mastery-filters');
  const meta = document.getElementById('library-results-meta');
  const results = document.getElementById('library-results');
  const clearButton = document.getElementById('library-search-clear');
  if (tagContainer) tagContainer.innerHTML = renderLibraryTagFilters();
  if (masteryContainer) masteryContainer.innerHTML = renderLibraryMasteryFilters();
  if (clearButton) clearButton.classList.toggle('hidden', !ui.library.search);
  const filtered = getFilteredLibraryQuestions();
  if (meta) meta.innerHTML = renderLibraryResultsMeta(filtered);
  if (results) {
    results.innerHTML = renderLibraryResultsMarkup(filtered);
    typesetMath(results);
  }
}

/* ============================================================
   Review
   ============================================================ */

function renderReviewView() {
  if (ui.review && ui.review.phase === 'active') {
    return renderReviewSession();
  }
  if (ui.review && ui.review.phase === 'done') {
    return renderReviewComplete();
  }
  return renderReviewOverview();
}

function renderReviewOverview() {
  const due = getDueQuestions();
  const upcomingGroups = getUpcomingGroups(5);
  const reviewedToday = getReviewsToday();
  const streak = getReviewStreak();
  const totalReviews = getTotalReviewCount();
  const next = getNextUpcomingQuestion();

  return `
    ${pageHeading(
      'Review plan',
      '复习计划',
      '按照艾宾浩斯遗忘曲线，在将忘未忘时再见一面。每一次反馈，都会影响下一次重逢的日期。',
      `<a href="#/library" class="btn btn-secondary w-full sm:w-auto">${icon('book', 'h-4 w-4')}返回错题本</a>`
    )}

    <div class="mt-6 grid gap-5 xl:grid-cols-12">
      <section class="xl:col-span-8 overflow-hidden rounded-[26px] border border-line bg-white/90 shadow-soft">
        <div class="relative overflow-hidden bg-pine-900 px-5 py-6 text-white sm:px-7 sm:py-7">
          <div class="hero-lines pointer-events-none absolute inset-0"></div>
          <div class="hero-orb pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full"></div>
          <div class="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Today's focus</p>
              <div class="mt-2 flex items-end gap-2">
                <span class="font-display font-num text-5xl font-semibold leading-none text-gold-200">${String(due.length).padStart(2, '0')}</span>
                <span class="pb-1 text-[11px] text-white/40">道错题<br>等待复习</span>
              </div>
              <p class="mt-3 max-w-sm text-[11px] leading-5 text-white/38">
                ${due.length
                  ? '跳过也没关系，但未完成的题会继续留在待复习队列里。'
                  : next ? `下一道复习安排在 ${formatRelativeDate(next.nextReview)}，今天可以安心整理新错题。` : '所有复习任务都已完成，去记录新的错题吧。'}
              </p>
            </div>
            <div class="flex flex-none flex-col items-stretch gap-2">
              ${due.length
                ? `<button type="button" data-action="start-review" class="btn btn-gold">开始复习 ${icon('arrow-right', 'h-4 w-4')}</button>`
                : `<a href="#/library" class="btn btn-gold">去错题本</a>`}
              <p class="text-center text-[9px] text-white/30">约 ${Math.max(1, Math.ceil(due.length * 2))} 分钟</p>
            </div>
          </div>
        </div>

        <div class="p-5 sm:p-6">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-display text-xl font-semibold text-ink/80">待复习清单</h2>
            <span class="text-[10px] text-ink/30">${due.length ? `由旧到新排序 · 共 ${due.length} 道` : '当前队列为空'}</span>
          </div>
          ${due.length
            ? `<div class="mt-3 space-y-1">
                ${due.slice(0, 6).map((question, index) => renderReviewQueueRow(question, index)).join('')}
              </div>
              ${due.length > 6 ? `<p class="mt-2 px-1 text-[10px] text-ink/28">还有 ${due.length - 6} 道将在本轮复习中依次出现</p>` : ''}`
            : `<div class="mt-4 rounded-2xl border border-dashed border-pine-200/70 bg-pine-50/45 px-5 py-9 text-center">
                <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-pine-600 shadow-sm ring-1 ring-pine-100">${icon('check', 'h-5 w-5', 2.2)}</span>
                <p class="mt-3 font-display text-lg font-semibold text-ink/70">今天的复习已经完成</p>
                <p class="mt-1 text-[11px] text-ink/36">${next ? `下一道会在 ${formatRelativeDate(next.nextReview)} 提醒你。` : '录入错题后，会自动生成复习日期。'}</p>
              </div>`}
        </div>
      </section>

      <aside class="xl:col-span-4 space-y-5">
        <section class="rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
          <p class="eyebrow">Rhythm</p>
          <h2 class="mt-2 font-display text-xl font-semibold">复习节奏</h2>
          <div class="mt-4 grid grid-cols-3 gap-2">
            ${[
              ['今日', reviewedToday, '已复习'],
              ['连续', streak, '天'],
              ['累计', totalReviews, '次复盘']
            ].map(([label, value, suffix]) => `
              <div class="rounded-xl border border-line-soft bg-paper2/55 px-2 py-3 text-center">
                <p class="text-[9px] text-ink/32">${label}</p>
                <p class="mt-1 font-display font-num text-[1.45rem] font-semibold leading-none text-pine-800">${value}</p>
                <p class="mt-1 text-[8px] text-ink/28">${suffix}</p>
              </div>
            `).join('')}
          </div>
          <div class="mt-4 flex items-start gap-2 border-t border-line-soft pt-4 text-[10px] leading-5 text-ink/36">
            ${icon('lightbulb', 'mt-0.5 h-3.5 w-3.5 flex-none text-gold-500/70')}
            <p>复习时先合上答案，在草稿纸上完整写出思路。能独立复现，才算真正掌握。</p>
          </div>
        </section>

        <section class="overflow-hidden rounded-[26px] bg-pine-900 p-5 text-white shadow-soft sm:p-6">
          <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-gold-200/55">Ebbinghaus</p>
          <h2 class="mt-2 font-display text-xl font-semibold">为什么在这些天复习？</h2>
          <p class="mt-2 text-[11px] leading-6 text-white/38">遗忘并不是均匀发生的。在即将遗忘的节点重新提取记忆，会让记忆痕迹变得更深。</p>
          <div class="mt-5 flex items-center gap-1.5">
            ${EBBINGHAUS_DAYS.map((day, index) => `
              <div class="flex flex-1 flex-col items-center gap-2">
                <span class="h-1.5 w-1.5 rounded-full ${index < 4 ? 'bg-gold-300' : 'bg-white/20'}"></span>
                <span class="font-num text-[8px] text-white/30">${day}</span>
              </div>
            `).join('')}
          </div>
          <div class="mt-2 flex items-center justify-between text-[8px] uppercase tracking-wider text-white/22"><span>首次</span><span>90 天后</span></div>
        </section>
      </aside>

      <section class="xl:col-span-8 rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="eyebrow">Upcoming</p>
            <h2 class="mt-2 font-display text-xl font-semibold">接下来的安排</h2>
          </div>
          <span class="text-[10px] text-ink/28">未来 ${upcomingGroups.length || 0} 个复习日</span>
        </div>
        ${upcomingGroups.length
          ? `<div class="mt-5">
              <div class="relative ml-[5px] border-l border-dashed border-line pl-5">
                ${upcomingGroups.map((group) => renderUpcomingGroup(group)).join('')}
              </div>
            </div>`
          : `<div class="mt-4 rounded-xl bg-paper2/70 px-4 py-6 text-center text-[11px] text-ink/35">${state.questions.length ? '没有需要往后安排的复习了。新的复习日期会在每次反馈后自动生成。' : '还没有错题，录题后即可看到完整的复习安排。'}</div>`}
      </section>

      <aside class="xl:col-span-4 rounded-[26px] border border-line bg-[#F0EBDF] p-5 sm:p-6">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-white/60 text-pine-700 ring-1 ring-white/70">${icon('calendar-plus', 'h-[18px] w-[18px]')}</div>
        <h2 class="mt-4 font-display text-xl font-semibold leading-snug">复习不是重看，<br>而是重新作答。</h2>
        <p class="mt-2 text-[11px] leading-6 text-ink/42">重读答案会产生「我好像会了」的错觉。先回忆、先落笔，再对照参考答案，反馈才真实。</p>
        <div class="mt-4 border-t border-ink/[0.06] pt-3 text-[9px] uppercase tracking-[0.16em] text-ink/25">Retrieval practice</div>
      </aside>
    </div>
  `;
}

function renderReviewQueueRow(question, index) {
  return `
    <div class="group relative flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-paper2/80">
      <a href="#/review" data-action="open-question" data-id="${esc(question.id)}" class="absolute inset-0 z-0 rounded-xl" aria-label="查看错题详情"></a>
      <span class="pointer-events-none relative z-[1] flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line bg-white font-num text-[9px] font-bold text-ink/32">${String(index + 1).padStart(2, '0')}</span>
      <div class="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <p class="q-clamp-1 text-[12px] font-medium leading-6 text-ink/72">${renderPreviewText(question.stem)}</p>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">
          ${masteryPill(question.mastery)}
          ${question.tags.slice(0, 2).map((tag) => tagChip(tag)).join('')}
        </div>
      </div>
      <span class="pointer-events-none relative z-[1] flex-none text-[9px] font-semibold ${daysBetweenKeys(todayKey(), question.nextReview) < 0 ? 'text-clay-600' : 'text-ink/24'}">${dueLabel(question)}</span>
    </div>
  `;
}

function renderUpcomingGroup(group) {
  const questions = group.questions;
  return `
    <div class="relative pb-5 last:pb-0">
      <span class="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-gold-400 shadow-[0_0_0_1px_#D9C7A4]"></span>
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] font-bold text-ink/65">${formatDateLong(group.date)}</p>
        <p class="font-num text-[9px] text-ink/28">${questions.length} 道</p>
      </div>
      <div class="mt-2 space-y-1.5">
        ${questions.slice(0, 2).map((question) => `
          <div class="group relative rounded-lg border border-line-soft/80 bg-paper2/45 px-3 py-2">
            <a href="#/review" data-action="open-question" data-id="${esc(question.id)}" class="absolute inset-0 z-0 rounded-lg" aria-label="查看错题详情"></a>
            <p class="q-clamp-1 relative z-[1] text-[10.5px] leading-5 text-ink/53 pointer-events-none">${renderPreviewText(question.stem)}</p>
          </div>
        `).join('')}
        ${questions.length > 2 ? `<p class="pl-1 text-[9px] text-ink/28">+ ${questions.length - 2} 道</p>` : ''}
      </div>
    </div>
  `;
}

function renderReviewSession() {
  const session = ui.review;
  if (!session || session.phase !== 'active') return renderReviewOverview();
  let currentQuestion = getQuestionById(session.ids[session.index]);
  if (!currentQuestion) {
    while (session.index < session.ids.length && !getQuestionById(session.ids[session.index])) {
      session.index += 1;
    }
    if (session.index >= session.ids.length) {
      session.phase = 'done';
      session.revealed = false;
      return renderReviewComplete();
    }
    currentQuestion = getQuestionById(session.ids[session.index]);
  }
  if (!currentQuestion) {
    session.phase = 'done';
    return renderReviewComplete();
  }
  const total = session.ids.length;
  const current = Math.min(session.index + 1, total);
  const progress = total ? Math.round((session.index / total) * 100) : 0;
  const stage = clampNumber(currentQuestion.reviewStage, 0, EBBINGHAUS_DAYS.length - 1);
  const goodStage = Math.min(stage + 1, EBBINGHAUS_DAYS.length - 1);
  const goodDays = EBBINGHAUS_DAYS[goodStage];

  return `
    <div class="mx-auto max-w-3xl animate-view">
      <div class="flex items-center justify-between gap-3">
        <button type="button" data-action="exit-review" class="inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold text-ink/42 transition-colors hover:bg-white/60 hover:text-ink/72">
          ${icon('arrow-left', 'h-4 w-4')}退出复习
        </button>
        <div class="text-center">
          <p class="text-[9px] font-bold uppercase tracking-[0.18em] text-ink/28">Focused review</p>
          <p class="mt-1 font-num text-[11px] font-semibold text-ink/50">${current} <span class="text-ink/22">/ ${total}</span></p>
        </div>
        <div class="flex h-10 min-w-[3.5rem] items-center justify-end">
          <span class="rounded-full border border-line bg-white/60 px-2.5 py-1 text-[9px] font-semibold text-ink/30">专注模式</span>
        </div>
      </div>

      <div class="mt-3 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
        <div class="h-full rounded-full bg-pine-700 transition-all duration-500" style="width:${progress}%"></div>
      </div>

      <article class="mt-5 overflow-hidden rounded-[26px] border border-line bg-white shadow-soft">
        <div class="h-1 w-full bg-gradient-to-r from-gold-300 via-gold-200 to-transparent"></div>
        <div class="p-5 sm:p-8">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            ${masteryPill(currentQuestion.mastery)}
            ${currentQuestion.tags.map((tag) => tagChip(tag)).join('')}
            <span class="ml-auto text-[9px] text-ink/26">第 ${stage + 1} 轮记忆</span>
          </div>

          <div class="mt-6">
            ${!session.revealed ? `<p class="mb-3 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-ink/25">${icon('eye-off', 'h-3.5 w-3.5')}先在草稿纸上独立作答</p>` : `<p class="mb-3 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-ink/25">${icon('book', 'h-3.5 w-3.5')}比对参考答案与错因</p>`}
            <div class="rich-text text-[15.5px] font-medium leading-[2] text-ink/85 sm:text-[16.5px]">${renderRichText(currentQuestion.stem)}</div>
            ${currentQuestion.image ? `<div class="mt-4 overflow-hidden rounded-xl border border-line bg-paper2/50 p-1.5"><img src="${esc(currentQuestion.image)}" alt="题目图片" class="question-image mx-auto w-full rounded-lg" loading="lazy"></div>` : ''}
          </div>

          ${session.revealed
            ? `<div class="animate-reveal">
                <section class="mt-7 border-t border-line-soft pt-6">
                  <div class="flex items-center gap-2">
                    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-pine-50 text-pine-700">${icon('check-circle', 'h-4 w-4')}</span>
                    <h3 class="text-[12px] font-bold text-ink/70">参考答案</h3>
                  </div>
                  <div class="mt-3 rounded-2xl border border-pine-100/80 bg-pine-50/55 px-4 py-4 sm:px-5">
                    <div class="rich-text text-[14px] leading-[1.95] text-ink/72">${currentQuestion.answer ? renderRichText(currentQuestion.answer) : '<span class="text-ink/30">这道题还没有填写参考答案。</span>'}</div>
                  </div>
                </section>
                <section class="mt-5">
                  <div class="flex items-center gap-2">
                    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-50 text-gold-700">${icon('lightbulb', 'h-4 w-4')}</span>
                    <h3 class="text-[12px] font-bold text-ink/70">错因分析</h3>
                  </div>
                  <div class="mt-3 rounded-2xl border border-gold-200/55 bg-gold-50/45 px-4 py-4 sm:px-5">
                    <div class="rich-text text-[13px] leading-[1.95] text-ink/64">${currentQuestion.analysis ? renderRichText(currentQuestion.analysis) : '<span class="text-ink/30">还没有记录错因。下一次录入时，试着写清楚「是知识点不会，还是思路/计算出了问题」。</span>'}</div>
                  </div>
                </section>

                <div class="mt-7 border-t border-line-soft pt-5">
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-[12px] font-bold text-ink/70">刚才回忆得怎么样？</h3>
                    <span class="text-[9px] text-ink/25">选择后将自动安排下一次复习</span>
                  </div>
                  <div class="mt-3 grid gap-2 sm:grid-cols-3">
                    <button type="button" data-action="review-feedback" data-feedback="again" class="group flex min-h-[74px] flex-col items-start justify-center rounded-xl border border-clay-200 bg-clay-50/60 px-4 py-3 text-left transition-colors hover:border-clay-300 hover:bg-clay-50">
                      <span class="flex w-full items-center justify-between text-[11px] font-bold text-clay-700">还没掌握 ${icon('rotate', 'h-3.5 w-3.5 transition-transform group-hover:-rotate-45')}</span>
                      <span class="mt-1 text-[9px] text-clay-600/55">回到未掌握 · 明天再见</span>
                    </button>
                    <button type="button" data-action="review-feedback" data-feedback="fuzzy" class="group flex min-h-[74px] flex-col items-start justify-center rounded-xl border border-gold-200 bg-gold-50/55 px-4 py-3 text-left transition-colors hover:border-gold-300 hover:bg-gold-50">
                      <span class="flex w-full items-center justify-between text-[11px] font-bold text-gold-700">有点模糊 ${icon('clock', 'h-3.5 w-3.5')}</span>
                      <span class="mt-1 text-[9px] text-gold-700/50">保持一般 · 2 天后复习</span>
                    </button>
                    <button type="button" data-action="review-feedback" data-feedback="good" class="group flex min-h-[74px] flex-col items-start justify-center rounded-xl border border-pine-200 bg-pine-50/60 px-4 py-3 text-left transition-colors hover:border-pine-300 hover:bg-pine-50">
                      <span class="flex w-full items-center justify-between text-[11px] font-bold text-pine-700">掌握扎实 ${icon('check', 'h-3.5 w-3.5', 2.2)}</span>
                      <span class="mt-1 text-[9px] text-pine-600/45">标记已掌握 · ${goodDays} 天后复习</span>
                    </button>
                  </div>
                </div>
              </div>`
            : `<div class="mt-7 rounded-2xl border border-line bg-paper2/70 px-5 py-7 text-center">
                <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-pine-700 shadow-sm ring-1 ring-line">${icon('eye', 'h-5 w-5')}</span>
                <p class="mt-3 text-[12px] font-semibold text-ink/65">想好了，再打开答案</p>
                <p class="mt-1 text-[10px] leading-5 text-ink/35">参考答案与错因分析都藏在后面。先完成自己的推导，再回来对照。</p>
                <button type="button" data-action="reveal-answer" class="btn btn-primary mt-4">${icon('eye', 'h-4 w-4')}查看参考答案</button>
              </div>`}
        </div>
      </article>

      <div class="mt-3 flex items-center justify-between gap-3 px-1">
        <button type="button" data-action="skip-review" class="text-[10px] font-semibold text-ink/30 transition-colors hover:text-ink/60">稍后再看</button>
        <p class="text-[9px] text-ink/24">${session.revealed ? '真实反馈比“全部掌握”更有价值' : '先回忆，再核对'}</p>
      </div>
    </div>
  `;
}

function renderReviewComplete() {
  const session = ui.review;
  const results = session.results || [];
  const counts = {
    again: results.filter((item) => item.feedback === 'again').length,
    fuzzy: results.filter((item) => item.feedback === 'fuzzy').length,
    good: results.filter((item) => item.feedback === 'good').length
  };
  const skipped = session.skipped || 0;
  const total = session.ids.length || 1;
  const dueLeft = getDueQuestions().length;
  const next = getNextUpcomingQuestion();
  return `
    <div class="mx-auto max-w-2xl animate-view">
      <section class="overflow-hidden rounded-[28px] border border-line bg-white shadow-soft">
        <div class="relative overflow-hidden bg-pine-900 px-6 pb-12 pt-9 text-center text-white sm:px-10">
          <div class="hero-lines pointer-events-none absolute inset-0"></div>
          <div class="hero-orb pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full"></div>
          <div class="relative">
            <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold-200/30 bg-gold-300/10 text-gold-200">${icon('check', 'h-7 w-7', 2)}</span>
            <p class="mt-5 text-[9px] font-bold uppercase tracking-[0.24em] text-gold-200/50">Session complete</p>
            <h1 class="mt-3 font-display text-[2rem] font-semibold leading-tight sm:text-[2.4rem]">本轮复习完成</h1>
            <p class="mx-auto mt-2 max-w-md text-[11px] leading-6 text-white/38">${results.length ? '记忆是在一次次主动提取中变牢的。下一次见面，已经安排好了。' : '本轮没有完成题目，但待复习队列会继续保留它们。'}</p>
          </div>
        </div>
        <div class="relative z-10 -mt-6 px-5 pb-6 sm:px-8">
          <div class="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-white p-3 shadow-sm">
            ${[
              ['掌握', counts.good, 'pine'],
              ['模糊', counts.fuzzy, 'gold'],
              ['忘记', counts.again, 'clay']
            ].map(([label, value, tone]) => `
              <div class="rounded-xl px-2 py-3 text-center ${tone === 'pine' ? 'bg-pine-50/70' : tone === 'gold' ? 'bg-gold-50/70' : 'bg-clay-50/60'}">
                <p class="font-display font-num text-2xl font-semibold ${tone === 'pine' ? 'text-pine-700' : tone === 'gold' ? 'text-gold-700' : 'text-clay-700'}">${value}</p>
                <p class="mt-1 text-[9px] font-semibold ${tone === 'pine' ? 'text-pine-600/60' : tone === 'gold' ? 'text-gold-700/55' : 'text-clay-600/55'}">${label}</p>
              </div>
            `).join('')}
          </div>

          <div class="mt-5 space-y-2.5 text-[11px]">
            <div class="flex items-center justify-between rounded-xl bg-paper2/75 px-4 py-3">
              <span class="text-ink/40">本轮完成</span>
              <span class="font-semibold text-ink/65">${results.length} / ${total} 道${skipped ? ` · 跳过 ${skipped} 道` : ''}</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-paper2/75 px-4 py-3">
              <span class="text-ink/40">下一次复习</span>
              <span class="font-semibold text-ink/65">${next ? `${formatRelativeDate(next.nextReview)} · ${formatDateShort(next.nextReview)}` : '暂无后续安排'}</span>
            </div>
            ${dueLeft ? `<div class="flex items-center justify-between rounded-xl border border-gold-200/70 bg-gold-50/60 px-4 py-3"><span class="text-gold-700/65">仍在待复习队列</span><span class="font-semibold text-gold-700">${dueLeft} 道</span></div>` : ''}
          </div>

          <div class="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" data-action="review-overview" class="btn btn-secondary flex-1">返回复习计划</button>
            ${dueLeft ? `<button type="button" data-action="start-review" class="btn btn-primary flex-1">继续复习剩余 ${dueLeft} 道</button>` : `<a href="#/quiz" class="btn btn-primary flex-1">去刷一组题 ${icon('arrow-right', 'h-4 w-4')}</a>`}
          </div>
        </div>
      </section>
    </div>
  `;
}

/* ============================================================
   Quiz
   ============================================================ */

function getQuizPool() {
  const tag = ui.quizSetup.tag;
  return tag === 'all' ? [...state.questions] : state.questions.filter((question) => question.tags.includes(tag));
}

function renderQuizView() {
  if (ui.quizSession) {
    if (ui.quizSession.phase === 'done') return renderQuizSummary();
    return renderQuizPlaying();
  }
  return renderQuizSetup();
}

function renderQuizSetup() {
  const counts = getTagCounts();
  const pool = getQuizPool();
  const countOptions = [
    { value: 5, label: '5 道', hint: '轻量热身' },
    { value: 10, label: '10 道', hint: '每日一组' },
    { value: 20, label: '20 道', hint: '集中突破' },
    { value: 'all', label: '全部', hint: pool.length ? `${pool.length} 道` : '暂无题目' }
  ];
  const actualCount = ui.quizSetup.count === 'all' ? pool.length : Math.min(Number(ui.quizSetup.count), pool.length);

  return `
    ${pageHeading(
      'Practice mode',
      '刷题模式',
      '随机抽题，先作答再看答案。用真实正确率检验掌握程度，而不是用「看懂了」安慰自己。',
      `<a href="#/library" class="btn btn-secondary w-full sm:w-auto">${icon('book', 'h-4 w-4')}查看错题本</a>`
    )}

    <div class="mt-6 grid gap-5 xl:grid-cols-12">
      <section class="xl:col-span-8 rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-7">
        <div class="flex items-start gap-3">
          <span class="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-pine-900 font-num text-[11px] font-bold text-gold-200">01</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-xl font-semibold text-ink/85">选择刷题范围</h2>
            <p class="mt-1 text-[11px] leading-5 text-ink/36">按标签聚焦薄弱模块，或从全部错题中随机抽取。</p>
            <div class="mt-4 flex flex-wrap gap-1.5">
              <button type="button" data-action="quiz-set-tag" data-tag="all" class="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10.5px] font-semibold transition-colors ${ui.quizSetup.tag === 'all' ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-white text-ink/46 hover:border-pine-200 hover:text-pine-700'}">
                全部标签<span class="font-num opacity-55">${state.questions.length}</span>
              </button>
              ${counts.map(({ tag, count }) => {
                const active = ui.quizSetup.tag === tag;
                return `<button type="button" data-action="quiz-set-tag" data-tag="${esc(tag)}" class="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10.5px] font-semibold transition-colors ${active ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-white text-ink/46 hover:border-pine-200 hover:text-pine-700'}">${esc(tag)}<span class="font-num opacity-50">${count}</span></button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="mt-7 flex items-start gap-3 border-t border-line-soft pt-6">
          <span class="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-paper2 font-num text-[11px] font-bold text-gold-700 ring-1 ring-line-soft">02</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-xl font-semibold text-ink/85">选择题目数量</h2>
            <p class="mt-1 text-[11px] leading-5 text-ink/36">每次随机打乱顺序；如果题库不足，会自动抽取全部可用题目。</p>
            <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              ${countOptions.map((option) => {
                const active = String(ui.quizSetup.count) === String(option.value);
                return `
                  <button type="button" data-action="quiz-set-count" data-count="${option.value}" class="rounded-xl border px-3 py-3 text-left transition-colors ${active ? 'border-pine-700 bg-pine-50/80' : 'border-line bg-white hover:border-pine-200'}">
                    <span class="block font-num text-[15px] font-bold ${active ? 'text-pine-800' : 'text-ink/60'}">${option.label}</span>
                    <span class="mt-1 block text-[9px] ${active ? 'text-pine-600/55' : 'text-ink/28'}">${option.hint}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="mt-7 flex flex-col gap-3 rounded-2xl border border-line-soft bg-paper2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-pine-600 ring-1 ring-line-soft">${icon('shuffle', 'h-4 w-4')}</span>
            <p class="text-[11px] leading-5 text-ink/42">将从 <strong class="font-semibold text-ink/70">${pool.length}</strong> 道题中随机抽取 <strong class="font-semibold text-ink/70">${actualCount}</strong> 道</p>
          </div>
          <button type="button" data-action="start-quiz" class="btn btn-primary" ${pool.length ? '' : 'disabled'}>
            ${pool.length ? `开始刷题 ${icon('arrow-right', 'h-4 w-4')}` : '暂无可用题目'}
          </button>
        </div>
      </section>

      <aside class="xl:col-span-4 space-y-5">
        <section class="relative overflow-hidden rounded-[26px] bg-pine-900 p-5 text-white shadow-soft sm:p-6">
          <div class="hero-lines pointer-events-none absolute inset-0"></div>
          <div class="hero-orb pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full"></div>
          <div class="relative">
            <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-gold-200/50">Practice notes</p>
            <h2 class="mt-2 font-display text-xl font-semibold">自测时，请对自己诚实</h2>
            <div class="mt-5 space-y-4">
              ${[
                ['01', '先写答案', '不翻书、不查笔记，先完整写出思路。'],
                ['02', '按步给分', '经济学习题看结果，也看推导与建模过程。'],
                ['03', '记录误差', '算错、看漏条件、概念混淆，都算错。']
              ].map(([no, title, desc]) => `
                <div class="flex gap-3">
                  <span class="font-num text-[9px] font-bold leading-5 text-gold-200/42">${no}</span>
                  <div class="min-w-0">
                    <p class="text-[11px] font-semibold text-white/72">${title}</p>
                    <p class="mt-0.5 text-[10px] leading-5 text-white/32">${desc}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <section class="rounded-[26px] border border-line bg-white/80 p-5">
          <p class="eyebrow">Current pool</p>
          <div class="mt-4 flex items-end justify-between gap-3">
            <div>
              <p class="font-display font-num text-4xl font-semibold text-ink/80">${pool.length}</p>
              <p class="mt-1 text-[10px] text-ink/32">道题在当前筛选范围内</p>
            </div>
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper2 text-pine-600">${icon('target', 'h-5 w-5')}</div>
          </div>
          <div class="mt-4 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <div class="h-full rounded-full bg-pine-600" style="width:${state.questions.length ? Math.round((pool.length / state.questions.length) * 100) : 0}%"></div>
          </div>
          <p class="mt-2 text-[9px] text-ink/25">占全部错题 ${state.questions.length ? Math.round((pool.length / state.questions.length) * 100) : 0}%</p>
        </section>
      </aside>
    </div>
  `;
}

function renderQuizPlaying() {
  const session = ui.quizSession;
  let currentQuestion = getQuestionById(session.ids[session.index]);
  if (!currentQuestion) {
    while (session.index < session.ids.length && !getQuestionById(session.ids[session.index])) {
      session.index += 1;
    }
    if (session.index >= session.ids.length) {
      session.phase = 'done';
      session.revealed = false;
      return renderQuizSummary();
    }
    currentQuestion = getQuestionById(session.ids[session.index]);
  }
  if (!currentQuestion) {
    session.phase = 'done';
    return renderQuizSummary();
  }
  const count = session.ids.length;
  const index = session.index;
  const correct = session.results.filter((item) => item.correct).length;
  const wrong = session.results.filter((item) => !item.correct).length;
  const progress = count ? Math.round((index / count) * 100) : 0;

  return `
    <div class="mx-auto max-w-3xl animate-view">
      <div class="flex items-center justify-between gap-3">
        <button type="button" data-action="exit-quiz" class="inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold text-ink/42 transition-colors hover:bg-white/60 hover:text-ink/72">${icon('x', 'h-4 w-4')}退出</button>
        <div class="text-center">
          <p class="text-[9px] font-bold uppercase tracking-[0.18em] text-ink/28">Practice in progress</p>
          <p class="mt-1 font-num text-[11px] font-semibold text-ink/52">第 ${index + 1} 题 <span class="text-ink/22">/ ${count}</span></p>
        </div>
        <div class="flex items-center gap-1.5 text-[10px] font-semibold">
          <span class="inline-flex items-center gap-1 rounded-full bg-pine-50 px-2 py-1 text-pine-700">${icon('check', 'h-3 w-3', 2.2)}${correct}</span>
          <span class="inline-flex items-center gap-1 rounded-full bg-clay-50 px-2 py-1 text-clay-600">${icon('x', 'h-3 w-3', 2.2)}${wrong}</span>
        </div>
      </div>
      <div class="mt-3 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
        <div class="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all duration-500" style="width:${progress}%"></div>
      </div>

      <article class="mt-5 overflow-hidden rounded-[26px] border border-line bg-white shadow-soft">
        <div class="h-1 w-full bg-gradient-to-r from-pine-800 via-pine-700 to-gold-300/40"></div>
        <div class="p-5 sm:p-8">
          <div class="flex flex-wrap items-center gap-1.5">
            ${currentQuestion.tags.length ? currentQuestion.tags.map((tag) => tagChip(tag)).join('') : '<span class="tag-chip" style="background:#F7F5EF;border-color:#EEE9DF;color:rgba(27,41,34,.38)">未分类</span>'}
            <span class="ml-auto text-[9px] font-semibold text-ink/25">随机抽题</span>
          </div>

          <div class="mt-6">
            <div class="rich-text text-[15.5px] font-medium leading-[2] text-ink/85 sm:text-[16.5px]">${renderRichText(currentQuestion.stem)}</div>
            ${currentQuestion.image ? `<div class="mt-4 overflow-hidden rounded-xl border border-line bg-paper2/50 p-1.5"><img src="${esc(currentQuestion.image)}" alt="题目图片" class="question-image mx-auto w-full rounded-lg" loading="lazy"></div>` : ''}
          </div>

          ${session.revealed
            ? `<div class="animate-reveal">
                <section class="mt-7 border-t border-line-soft pt-6">
                  <div class="flex items-center gap-2">
                    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-pine-50 text-pine-700">${icon('check-circle', 'h-4 w-4')}</span>
                    <h3 class="text-[12px] font-bold text-ink/70">参考答案</h3>
                  </div>
                  <div class="mt-3 rounded-2xl border border-pine-100/80 bg-pine-50/55 px-4 py-4 sm:px-5">
                    <div class="rich-text text-[14px] leading-[1.95] text-ink/72">${currentQuestion.answer ? renderRichText(currentQuestion.answer) : '<span class="text-ink/30">这道题还没有填写参考答案。</span>'}</div>
                  </div>
                </section>
                ${currentQuestion.analysis ? `<section class="mt-4 rounded-2xl border border-gold-200/55 bg-gold-50/45 px-4 py-4 sm:px-5">
                  <div class="flex items-center gap-2 text-[11px] font-bold text-gold-700">${icon('lightbulb', 'h-4 w-4')}错因提醒</div>
                  <div class="mt-2 rich-text text-[12px] leading-[1.9] text-ink/58">${renderRichText(currentQuestion.analysis)}</div>
                </section>` : ''}
                <div class="mt-6 rounded-2xl bg-paper2/80 px-4 py-4">
                  <p class="text-center text-[11px] font-semibold text-ink/55">对照参考答案，刚才做对了吗？</p>
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" data-action="quiz-judge" data-correct="false" class="btn btn-danger min-h-[54px] flex-col gap-0.5 border-clay-200 px-4">
                      <span class="flex items-center gap-1.5 font-bold">${icon('x', 'h-4 w-4', 2.2)}答错了</span>
                      <span class="text-[9px] font-normal opacity-55">没思路、算错或漏条件</span>
                    </button>
                    <button type="button" data-action="quiz-judge" data-correct="true" class="btn btn-primary min-h-[54px] flex-col gap-0.5 px-4">
                      <span class="flex items-center gap-1.5 font-bold">${icon('check', 'h-4 w-4', 2.2)}答对了</span>
                      <span class="text-[9px] font-normal opacity-55">能独立写出完整答案</span>
                    </button>
                  </div>
                </div>
              </div>`
            : `<div class="mt-7 rounded-2xl border border-line bg-paper2/70 px-5 py-7 text-center">
                <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-pine-700 shadow-sm ring-1 ring-line">${icon('eye-off', 'h-5 w-5')}</span>
                <p class="mt-3 text-[12px] font-semibold text-ink/65">答案已经藏好了</p>
                <p class="mt-1 text-[10px] leading-5 text-ink/35">先在草稿纸上完成作答，再打开参考答案。对自己诚实，刷题才有意义。</p>
                <button type="button" data-action="quiz-reveal" class="btn btn-primary mt-4">${icon('eye', 'h-4 w-4')}查看参考答案</button>
              </div>`}
        </div>
      </article>
      <p class="mt-3 px-1 text-center text-[9px] text-ink/22">${session.revealed ? '作答反馈会记录在本轮成绩中，不会改动复习计划。' : '随机抽题 · 不显示掌握程度 · 减少提示偏差'}</p>
    </div>
  `;
}

function renderQuizSummary() {
  const session = ui.quizSession;
  if (!session) return renderQuizSetup();
  const total = session.results.length;
  const correct = session.results.filter((item) => item.correct).length;
  const wrongIds = session.results.filter((item) => !item.correct).map((item) => item.id);
  const wrongQuestions = wrongIds.map((id) => getQuestionById(id)).filter(Boolean);
  const percent = total ? Math.round((correct / total) * 100) : 0;
  let message = '继续积累，正确率会慢慢长出来。';
  if (percent >= 90) message = '状态很稳。保持输出，把这种熟练度带进考场。';
  else if (percent >= 70) message = '基础不错，把错题里的细节再抠一遍。';
  else if (percent >= 40) message = '还有明显的知识缝隙，正好趁现在补上。';

  return `
    <div class="mx-auto max-w-2xl animate-view">
      <section class="overflow-hidden rounded-[28px] border border-line bg-white shadow-soft">
        <div class="relative overflow-hidden bg-pine-900 px-6 pb-14 pt-9 text-center text-white sm:px-10">
          <div class="hero-lines pointer-events-none absolute inset-0"></div>
          <div class="hero-orb pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full"></div>
          <div class="relative">
            <p class="text-[9px] font-bold uppercase tracking-[0.24em] text-gold-200/50">Practice complete</p>
            <h1 class="mt-3 font-display text-[2rem] font-semibold leading-tight sm:text-[2.4rem]">本组刷题完成</h1>
            <p class="mx-auto mt-2 max-w-md text-[11px] leading-6 text-white/38">${message}</p>
          </div>
        </div>
        <div class="relative z-10 -mt-8 px-5 pb-6 sm:px-8">
          <div class="flex items-center gap-5 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <div class="relative flex h-[6.5rem] w-[6.5rem] flex-none items-center justify-center rounded-full" style="background:conic-gradient(#3F7562 0 ${percent}%, #E8E2D6 ${percent}% 100%)">
              <div class="absolute inset-[8px] rounded-full bg-white"></div>
              <div class="relative text-center">
                <p class="font-display font-num text-2xl font-semibold leading-none text-ink">${percent}<span class="text-xs text-ink/30">%</span></p>
                <p class="mt-1 text-[8px] text-ink/30">正确率</p>
              </div>
            </div>
            <div class="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <div class="rounded-xl bg-pine-50/70 px-3 py-2.5">
                <p class="font-num text-xl font-bold text-pine-700">${correct}</p>
                <p class="mt-0.5 text-[9px] text-pine-600/50">答对</p>
              </div>
              <div class="rounded-xl bg-clay-50/65 px-3 py-2.5">
                <p class="font-num text-xl font-bold text-clay-600">${total - correct}</p>
                <p class="mt-0.5 text-[9px] text-clay-600/50">答错</p>
              </div>
              <div class="col-span-2 rounded-xl bg-paper2/80 px-3 py-2 text-[10px] text-ink/38">
                共完成 <span class="font-semibold text-ink/60">${total}</span> 道 · 用时约 <span class="font-semibold text-ink/60">${Math.max(1, Math.ceil(total * 1.5))}</span> 分钟
              </div>
            </div>
          </div>

          ${wrongQuestions.length
            ? `<div class="mt-5">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-[12px] font-bold text-ink/65">这组需要回看的题</h2>
                  <span class="text-[9px] text-ink/28">${wrongQuestions.length} 道</span>
                </div>
                <div class="mt-2.5 space-y-2">
                  ${wrongQuestions.map((question) => `
                    <details class="group rounded-xl border border-line-soft bg-paper2/45 px-3.5 py-3">
                      <summary class="flex items-start gap-2">
                        <span class="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-clay-50 text-clay-500">${icon('x', 'h-3 w-3', 2.3)}</span>
                        <span class="q-clamp-2 min-w-0 flex-1 text-[11px] leading-5 text-ink/60">${renderPreviewText(question.stem)}</span>
                        <span class="mt-0.5 flex-none text-ink/22">${icon('chevron-down', 'h-3.5 w-3.5 transition-transform group-open:rotate-180')}</span>
                      </summary>
                      <div class="mt-2 border-t border-line-soft pt-2">
                        <div class="rich-text text-[10.5px] leading-5 text-ink/48">${question.answer ? renderRichText(question.answer) : '未填写参考答案'}</div>
                        <button type="button" data-action="open-question" data-id="${esc(question.id)}" class="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-pine-700">查看完整错题 ${icon('arrow-right', 'h-3 w-3')}</button>
                      </div>
                    </details>
                  `).join('')}
                </div>
              </div>`
            : `<div class="mt-5 rounded-2xl border border-dashed border-pine-200/80 bg-pine-50/40 px-5 py-6 text-center">
                <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-pine-600 shadow-sm ring-1 ring-pine-100">${icon('sparkles', 'h-4 w-4')}</span>
                <p class="mt-2 text-[11px] font-semibold text-pine-700/75">这一组全部答对</p>
                <p class="mt-1 text-[9px] text-ink/30">可以挑战更大的题量，或者去复习其他知识点。</p>
              </div>`}

          <div class="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" data-action="quiz-again" class="btn btn-primary flex-1">${icon('shuffle', 'h-4 w-4')}再随机抽一组</button>
            <button type="button" data-action="quiz-back-setup" class="btn btn-secondary flex-1">调整筛选</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

/* ============================================================
   Settings
   ============================================================ */

function renderSettingsView() {
  const notificationSupported = typeof window.Notification !== 'undefined';
  const permission = notificationSupported ? Notification.permission : 'unsupported';
  const notificationsOn = Boolean(state.settings.notifications);
  const permissionLabel = {
    granted: '已授权',
    denied: '已拒绝',
    default: '尚未授权',
    unsupported: '不支持'
  }[permission] || '未知';
  const permissionTone = permission === 'granted'
    ? 'background:#EDF4EF;border-color:#D7E6DC;color:#2B624F'
    : permission === 'denied'
      ? 'background:#F8ECE7;border-color:#ECD8CF;color:#98503C'
      : 'background:#F7F5EF;border-color:#E4DED1;color:rgba(27,41,34,.45)';
  const tagCounts = getTagCounts();
  const tagCountMap = new Map(tagCounts.map((item) => [item.tag, item.count]));
  const activeTagCount = tagCounts.filter((item) => item.count > 0).length;
  const presetSet = new Set(DEFAULT_TAGS);

  return `
    ${pageHeading(
      'Preferences',
      '设置',
      isCloudMode()
        ? '管理提醒、标签与云端同步。错题按账号隔离保存在 Supabase，并在多设备间自动同步。'
        : '管理提醒、标签与本地数据。错题保存在当前浏览器，可随时导出 JSON 备份。',
      `<a href="#/home" class="btn btn-secondary w-full sm:w-auto">${icon('home', 'h-4 w-4')}返回概览</a>`
    )}

    <div class="mt-6 grid gap-5 xl:grid-cols-12">
      <div class="xl:col-span-8 space-y-5">
        ${window.ZhixiCloudUI && typeof window.ZhixiCloudUI.accountCardHTML === 'function' ? window.ZhixiCloudUI.accountCardHTML() : ''}
        <section class="rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
          <div class="flex items-start gap-4">
            <span class="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">${icon('bell', 'h-5 w-5')}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="font-display text-xl font-semibold text-ink/85">复习提醒</h2>
                  <p class="mt-1 text-[11px] leading-5 text-ink/38">每日打开知隙时，自动检查到期错题并提醒。</p>
                </div>
                <button type="button" data-action="toggle-notifications" role="switch" aria-checked="${notificationsOn}" aria-label="开启或关闭复习提醒" ${notificationSupported ? '' : 'disabled'} class="relative mt-0.5 h-7 w-12 flex-none rounded-full transition-colors ${notificationsOn ? 'bg-pine-800' : 'bg-ink/15'}">
                  <span class="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${notificationsOn ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold" style="${permissionTone}">${icon('bell', 'h-3 w-3')}通知权限：${permissionLabel}</span>
                ${notificationsOn && permission === 'granted' ? `<button type="button" data-action="test-notification" class="text-[9px] font-semibold text-pine-700/65 underline decoration-pine-200 underline-offset-4 hover:text-pine-800">发送测试通知</button>` : ''}
              </div>
              <p class="mt-3 text-[10px] leading-5 text-ink/33">
                ${notificationSupported
                  ? permission === 'denied'
                    ? '通知权限已被浏览器拒绝。你可以点击地址栏左侧的站点图标，在「通知」中重新允许。'
                    : permission === 'granted'
                      ? '系统通知已授权。页面打开时，到期的错题会以页面横幅与系统通知提醒；关闭页面后浏览器无法后台提醒。'
                      : '开启后浏览器会请求通知权限。未授权时，页面内仍会显示到期提醒横幅。'
                  : '当前浏览器不支持系统通知，页面内提醒仍可正常使用。'}
              </p>
              <div class="mt-3 rounded-xl bg-paper2/75 px-3 py-2.5 text-[9.5px] leading-5 text-ink/35">
                ${icon('info', 'inline h-3 w-3 align-[-1px]')} 静态前端没有常驻后台任务，系统提醒只在页面打开期间生效；${isCloudMode() ? '云端同步会在下次打开时补齐。' : '数据保存在本机浏览器。'}
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="eyebrow">Knowledge tags</p>
              <h2 class="mt-2 font-display text-xl font-semibold text-ink/85">标签管理</h2>
              <p class="mt-1 text-[11px] leading-5 text-ink/36">预设标签不可删除；自定义标签删除时会同时从错题中移除。</p>
            </div>
            <span class="flex-none text-[10px] text-ink/28">${activeTagCount} / ${state.tags.length} 使用中</span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            ${state.tags.map((tag) => {
              const count = tagCountMap.get(tag) || 0;
              const preset = presetSet.has(tag);
              const tone = tagTone(tag);
              return `
                <span class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10.5px]" style="background:${tone.bg};border-color:${tone.border};color:${tone.color}">
                  <span class="h-1.5 w-1.5 flex-none rounded-full" style="background:${tone.color};opacity:.68"></span>
                  <span class="truncate">${esc(tag)}</span>
                  <span class="font-num text-[9px] opacity-50">${count}</span>
                  ${preset
                    ? `<span class="rounded-full bg-white/50 px-1.5 py-0.5 text-[8px] opacity-55">预设</span>`
                    : `<button type="button" data-action="delete-tag" data-tag="${esc(tag)}" class="ml-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full hover:bg-black/10" aria-label="删除标签 ${esc(tag)}">${icon('x', 'h-2.5 w-2.5', 2)}</button>`}
                </span>
              `;
            }).join('')}
          </div>
          <div class="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4 sm:flex-row">
            <label class="relative flex min-w-0 flex-1 items-center" for="settings-new-tag">
              <span class="sr-only">新标签名称</span>
              <input id="settings-new-tag" type="text" maxlength="24" class="field min-h-[42px] py-2.5 pr-20 text-sm" placeholder="添加自定义标签，例如：福利经济学">
              <span class="pointer-events-none absolute right-3 text-[9px] text-ink/20">最多 24 字</span>
            </label>
            <button type="button" data-action="add-tag" class="btn btn-secondary min-h-[42px]">${icon('plus', 'h-4 w-4')}添加标签</button>
          </div>
        </section>

        <section class="rounded-[26px] border border-line bg-white/90 p-5 shadow-soft sm:p-6">
          <div class="flex items-start gap-4">
            <span class="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-pine-50 text-pine-700 ring-1 ring-pine-100">${icon('database', 'h-5 w-5')}</span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-display text-xl font-semibold text-ink/85">数据备份</h2>
                  <p class="mt-1 text-[11px] leading-5 text-ink/38">定期导出 JSON，换设备或清理浏览器前可完整恢复。</p>
                </div>
                <span class="rounded-full bg-paper2 px-2.5 py-1 text-[9px] font-semibold text-ink/35">${storageAvailable ? '本地缓存可用' : '本地缓存不可用'}</span>
              </div>
              <div class="mt-4 grid grid-cols-3 gap-2">
                ${[
                  ['错题', state.questions.length],
                  ['含图', getImageCount()],
                  ['占用', getStorageEstimate()]
                ].map(([label, value]) => `
                  <div class="rounded-xl border border-line-soft bg-paper2/55 px-3 py-2.5">
                    <p class="text-[9px] text-ink/30">${label}</p>
                    <p class="mt-1 truncate font-num text-[13px] font-bold text-ink/62">${value}</p>
                  </div>
                `).join('')}
              </div>
              <div class="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" data-action="export-data" class="btn btn-primary flex-1">${icon('download', 'h-4 w-4')}导出 JSON 备份</button>
                <button type="button" data-action="trigger-import" class="btn btn-secondary flex-1">${icon('upload', 'h-4 w-4')}导入 JSON 恢复</button>
              </div>
              <p class="mt-3 text-[9.5px] leading-5 text-ink/30">备份文件包含题目图片（Base64），可能较大。导入时可选择合并或覆盖现有错题。</p>
            </div>
          </div>
        </section>

        <section class="rounded-[26px] border border-[#EADDD5] bg-[#FBF3EF]/65 p-5 sm:p-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-3">
              <span class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/70 text-clay-500 ring-1 ring-clay-100">${icon('alert', 'h-[18px] w-[18px]')}</span>
              <div>
                <h2 class="text-[13px] font-bold text-ink/70">清空全部数据</h2>
                <p class="mt-1 text-[10px] leading-5 text-ink/35">删除所有错题、复习记录与自定义标签；此操作无法撤销。</p>
              </div>
            </div>
            <button type="button" data-action="clear-all-data" class="btn btn-danger flex-none">清空数据</button>
          </div>
        </section>
      </div>

      <aside class="xl:col-span-4 space-y-5">
        <section class="relative overflow-hidden rounded-[26px] bg-pine-900 p-5 text-white shadow-soft sm:p-6">
          <div class="hero-lines pointer-events-none absolute inset-0"></div>
          <div class="relative">
            <div class="flex items-center justify-between">
              <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-gold-200/50">The algorithm</p>
              <span class="text-gold-200/40">${icon('sparkles', 'h-4 w-4')}</span>
            </div>
            <h2 class="mt-3 font-display text-[1.45rem] font-semibold leading-snug">艾宾浩斯<br>间隔复习</h2>
            <p class="mt-2 text-[10.5px] leading-5 text-white/36">复习反馈会改变下一次间隔。忘记则缩短，模糊则回溯，掌握则延长。</p>
            <div class="mt-5 flex items-center justify-between gap-1">
              ${EBBINGHAUS_DAYS.map((day, index) => `
                <div class="flex flex-1 flex-col items-center gap-2">
                  <span class="h-2 w-2 rounded-full ${index < 4 ? 'bg-gold-300' : 'bg-white/18'}"></span>
                  <span class="font-num text-[8px] text-white/28">${day}</span>
                </div>
              `).join('')}
            </div>
            <div class="mt-2 h-px bg-gradient-to-r from-gold-300/30 via-white/10 to-transparent"></div>
            <div class="mt-4 space-y-2.5">
              ${[
                ['明天再见', '还没掌握 / 忘记，重置为第 1 天'],
                ['两天后', '有点模糊，先巩固再延长'],
                ['按曲线延长', '掌握扎实，依次进入 4 / 7 / 15 / 30 天']
              ].map(([title, desc], index) => `
                <div class="flex gap-2.5">
                  <span class="mt-[3px] font-num text-[8px] text-gold-200/38">0${index + 1}</span>
                  <div>
                    <p class="text-[10px] font-semibold text-white/64">${title}</p>
                    <p class="mt-0.5 text-[9px] leading-4 text-white/28">${desc}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <section class="rounded-[26px] border border-line bg-white/80 p-5 sm:p-6">
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-pine-900 font-display text-lg font-semibold text-gold-200">隙</span>
            <div>
              <p class="font-display text-[15px] font-semibold text-ink/80">知隙 · Zhixi</p>
              <p class="mt-0.5 text-[9px] tracking-wide text-ink/30">经济学考研错题本 · v1.0</p>
            </div>
          </div>
          <div class="mt-4 space-y-2.5 text-[10px] leading-5 text-ink/38">
            ${isCloudMode()
              ? `<p class="flex items-start gap-2">${icon('lock', 'mt-0.5 h-3.5 w-3.5 flex-none text-pine-600/55')}错题与图片保存在你的 Supabase 私有库中，RLS 保证只能访问自己的数据；本地仅保留缓存。</p>`
              : `<p class="flex items-start gap-2">${icon('lock', 'mt-0.5 h-3.5 w-3.5 flex-none text-pine-600/55')}错题与图片保存在当前浏览器的本地缓存中，不会上传到服务器。</p>`}
            <p class="flex items-start gap-2">${icon('cloud', 'mt-0.5 h-3.5 w-3.5 flex-none text-pine-600/55')}OCR 首次使用需联网加载识别模型（约 6 MB），识别在浏览器本地完成；以中文题目为主，兼容常见英文与数字。</p>
            <p class="flex items-start gap-2">${icon('alert', 'mt-0.5 h-3.5 w-3.5 flex-none text-clay-500/60')}${isCloudMode() ? '清理站点数据只会清除本机缓存，云端数据仍可重新拉取；仍建议定期导出 JSON 备份。' : '清理站点数据会删除本机错题与图片；请定期导出 JSON 备份。'}</p>
          </div>
          <div class="mt-4 border-t border-line-soft pt-3 text-[9px] leading-5 text-ink/25">
            面向目标为顶尖 985 经济学考研的学习者。<br>MathJax 公式渲染 · Tesseract.js 本地 OCR。
          </div>
        </section>
      </aside>
    </div>
  `;
}

/* ============================================================
   Question detail / form / import modal bodies
   ============================================================ */

function renderQuestionDetailBody(question) {
  const stage = clampNumber(question.reviewStage, 0, EBBINGHAUS_DAYS.length - 1);
  const preview = previewIntervals(question, 3);
  const feedbackLabels = { again: '还没掌握', fuzzy: '有点模糊', good: '掌握扎实' };
  return `
    <div class="flex flex-wrap items-center gap-1.5">
      ${masteryPill(question.mastery)}
      ${question.tags.length ? question.tags.map((tag) => tagChip(tag)).join('') : '<span class="tag-chip" style="background:#F7F5EF;border-color:#EEE9DF;color:rgba(27,41,34,.38)">未分类</span>'}
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div class="rounded-xl border border-line-soft bg-paper2/55 px-3 py-2.5">
        <p class="text-[9px] text-ink/28">下次复习</p>
        <p class="mt-1 text-[11px] font-semibold text-ink/65">${formatRelativeDate(question.nextReview)}</p>
      </div>
      <div class="rounded-xl border border-line-soft bg-paper2/55 px-3 py-2.5">
        <p class="text-[9px] text-ink/28">复习轮次</p>
        <p class="mt-1 text-[11px] font-semibold text-ink/65">第 ${stage + 1} / ${EBBINGHAUS_DAYS.length} 轮</p>
      </div>
      <div class="col-span-2 rounded-xl border border-line-soft bg-paper2/55 px-3 py-2.5 sm:col-span-1">
        <p class="text-[9px] text-ink/28">录入时间</p>
        <p class="mt-1 text-[11px] font-semibold text-ink/65">${formatCreated(question.createdAt)}</p>
      </div>
    </div>

    <section class="mt-7">
      <div class="flex items-center justify-between gap-3">
        <h3 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink/40">${icon('file', 'h-3.5 w-3.5')}题目</h3>
        <span class="rounded-full px-2 py-1 text-[9px] font-semibold" style="color:${dueTone(question).text};background:${dueTone(question).bg}">${dueLabel(question)}</span>
      </div>
      <div class="mt-3 rounded-2xl border border-line-soft bg-white px-4 py-4 sm:px-5">
        <div class="rich-text text-[14px] leading-[2] text-ink/80">${renderRichText(question.stem)}</div>
      </div>
      ${question.image ? `<div class="mt-3 overflow-hidden rounded-xl border border-line bg-paper2/50 p-1.5"><img src="${esc(question.image)}" alt="题目图片" class="question-image mx-auto w-full rounded-lg"></div>` : ''}
    </section>

    <section class="mt-5">
      <h3 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-pine-700/55">${icon('check-circle', 'h-3.5 w-3.5')}参考答案</h3>
      <div class="mt-2.5 rounded-2xl border border-pine-100/80 bg-pine-50/50 px-4 py-4 sm:px-5">
        <div class="rich-text text-[13px] leading-[1.95] text-ink/70">${question.answer ? renderRichText(question.answer) : '<span class="text-ink/28">尚未填写参考答案。</span>'}</div>
      </div>
    </section>

    <section class="mt-5">
      <h3 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-gold-700/60">${icon('lightbulb', 'h-3.5 w-3.5')}错因分析</h3>
      <div class="mt-2.5 rounded-2xl border border-gold-200/55 bg-gold-50/45 px-4 py-4 sm:px-5">
        <div class="rich-text text-[12.5px] leading-[1.95] text-ink/62">${question.analysis ? renderRichText(question.analysis) : '<span class="text-ink/28">还没有记录错因分析。</span>'}</div>
      </div>
    </section>

    <section class="mt-7 border-t border-line-soft pt-5">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-[11px] font-bold uppercase tracking-[0.1em] text-ink/40">复习节奏</h3>
        <span class="text-[9px] text-ink/28">按当前状态预测</span>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        ${preview.map((item, index) => `
          <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9.5px] ${index === 0 ? 'border-pine-200 bg-pine-50/70 text-pine-700' : 'border-line bg-white text-ink/38'}">
            <span class="font-num font-semibold">${index === 0 ? '下次' : `+${index}`}</span>${formatDateShort(item.date)}
          </span>
        `).join('')}
      </div>
      ${question.reviewHistory.length
        ? `<details class="group mt-4 rounded-xl border border-line-soft bg-paper2/40 px-3.5 py-3">
            <summary class="flex items-center justify-between gap-3">
              <span class="text-[10px] font-semibold text-ink/45">历史复习记录 · ${question.reviewHistory.length} 次</span>
              <span class="text-ink/25">${icon('chevron-down', 'h-3.5 w-3.5 transition-transform group-open:rotate-180')}</span>
            </summary>
            <div class="mt-2.5 space-y-2 border-t border-line-soft pt-2.5">
              ${question.reviewHistory.slice(0, 8).map((entry) => `
                <div class="flex items-center justify-between gap-3 text-[9.5px]">
                  <span class="text-ink/35">${formatDateShort(dateKeyFromDate(new Date(entry.at)))} ${formatIsoTime(entry.at)}</span>
                  <span class="font-semibold ${entry.feedback === 'again' ? 'text-clay-500' : entry.feedback === 'fuzzy' ? 'text-gold-600' : 'text-pine-600'}">${feedbackLabels[entry.feedback] || '复习'}</span>
                  <span class="text-ink/25">间隔 ${entry.interval} 天</span>
                </div>
              `).join('')}
            </div>
          </details>`
        : ''}
    </section>
  `;
}

function renderFileSize(dataUrl) {
  if (!dataUrl) return '';
  const base64 = dataUrl.split(',')[1] || '';
  const bytes = Math.round((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function renderOcrStatus() {
  const form = ui.form;
  if (!form || !form.image) return '';
  const ocr = form.ocr || { status: 'idle', progress: 0, message: '' };
  if (ocr.status === 'processing') {
    const progress = clampNumber(ocr.progress, 0, 100);
    return `
      <div class="mt-3 rounded-xl border border-line-soft bg-paper2/70 px-3.5 py-3">
        <div class="flex items-center gap-2 text-[10px] font-semibold text-ink/50">
          <span class="spinner"></span>
          <span id="ocr-status-text">${esc(ocr.message || '正在准备 OCR 引擎…')}</span>
          <span class="ml-auto font-num text-ink/28">${progress}%</span>
        </div>
        <div class="mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
          <div class="h-full rounded-full bg-gold-400 transition-all duration-300" style="width:${Math.max(4, progress)}%"></div>
        </div>
        <p class="mt-2 text-[9px] leading-4 text-ink/28">首次识别需下载识别模型，识别可能需要几十秒。请保持网络连接，期间可以先手动补充题干。</p>
      </div>
    `;
  }
  if (ocr.status === 'done') {
    return `
      <div class="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-pine-100 bg-pine-50/60 px-3.5 py-2.5">
        <span class="flex h-5 w-5 items-center justify-center rounded-full bg-white text-pine-600">${icon('check', 'h-3 w-3', 2.2)}</span>
        <p class="min-w-0 flex-1 text-[9.5px] leading-5 text-pine-700/65">识别完成，文字已填入题干。请校对公式、上下标和符号。</p>
        <button type="button" data-action="retry-ocr" class="text-[9px] font-semibold text-pine-700 underline decoration-pine-200 underline-offset-4">重新识别</button>
      </div>
    `;
  }
  if (ocr.status === 'error') {
    return `
      <div class="mt-3 rounded-xl border border-clay-100 bg-clay-50/55 px-3.5 py-3">
        <div class="flex items-start gap-2">
          <span class="mt-0.5 text-clay-500">${icon('alert', 'h-3.5 w-3.5')}</span>
          <div class="min-w-0 flex-1">
            <p class="text-[9.5px] font-semibold text-clay-700/70">OCR 识别失败</p>
            <p class="mt-0.5 text-[9px] leading-4 text-clay-600/55">${esc(ocr.message || '请检查网络后重试，或直接手动输入题干。')}</p>
            <button type="button" data-action="retry-ocr" class="mt-1.5 text-[9px] font-semibold text-clay-700 underline underline-offset-4">${icon('refresh', 'inline h-3 w-3 align-[-1px]')}重试识别</button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="mt-3 flex items-center justify-between gap-2 text-[9px] text-ink/28">
      <span>图片已添加。可点击「开始 OCR」自动识别文字。</span>
      <button type="button" data-action="retry-ocr" class="flex-none font-semibold text-pine-700">开始 OCR</button>
    </div>
  `;
}

function renderImageField() {
  const form = ui.form;
  if (!form) return '';
  if (!form.image) {
    return `
      <div class="rounded-2xl border border-dashed border-[#D8D1C3] bg-paper2/55 px-4 py-6 text-center">
        <span class="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-pine-700 shadow-sm ring-1 ring-line-soft">${icon('camera', 'h-5 w-5')}</span>
        <p class="mt-3 text-[11px] font-semibold text-ink/55">拍照识别题目</p>
        <p class="mx-auto mt-1 max-w-sm text-[9.5px] leading-5 text-ink/30">支持 JPG / PNG / WEBP。图片会压缩后上传到你的私有 Storage，OCR 全程在浏览器本地完成；首次识别需联网加载模型（约 6 MB）。</p>
        <div class="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" data-action="trigger-camera" class="btn btn-soft min-h-[38px] px-3 text-[10.5px]">${icon('camera', 'h-3.5 w-3.5')}拍照</button>
          <button type="button" data-action="trigger-gallery" class="btn btn-secondary min-h-[38px] px-3 text-[10.5px]">${icon('image', 'h-3.5 w-3.5')}从相册选择</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="rounded-2xl border border-line bg-paper2/45 p-3">
      <div class="flex gap-3">
        <div class="relative h-24 w-24 flex-none overflow-hidden rounded-xl border border-line bg-white">
          <img src="${esc(form.image)}" alt="题目图片预览" class="h-full w-full object-cover">
        </div>
        <div class="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <p class="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink/60">${icon('image', 'h-3.5 w-3.5 text-pine-600/65')}题目图片已添加</p>
            <p class="mt-1 text-[9px] text-ink/28">约 ${renderFileSize(form.image)} · OCR 本地执行 · ${isCloudMode() ? '保存后同步私有云端' : '保存到本机'}</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button type="button" data-action="trigger-gallery" class="inline-flex h-7 items-center rounded-lg border border-line bg-white px-2 text-[9px] font-semibold text-ink/45 hover:text-pine-700">更换</button>
            <button type="button" data-action="trigger-camera" class="inline-flex h-7 items-center rounded-lg border border-line bg-white px-2 text-[9px] font-semibold text-ink/45 hover:text-pine-700">重拍</button>
            <button type="button" data-action="remove-image" class="inline-flex h-7 items-center rounded-lg px-2 text-[9px] font-semibold text-clay-500/65 hover:bg-clay-50 hover:text-clay-600">移除图片</button>
          </div>
        </div>
      </div>
      <div id="ocr-status">${renderOcrStatus()}</div>
    </div>
  `;
}

function getFormAllTags() {
  return normalizeTags([...state.tags, ...(ui.form && ui.form.newTags ? ui.form.newTags : [])]);
}

function renderFormTags() {
  if (!ui.form) return '';
  const tags = getFormAllTags();
  return tags.map((tag) => {
    const selected = ui.form.tags.includes(tag);
    const tone = tagTone(tag);
    return `
      <button type="button" data-action="toggle-form-tag" data-tag="${esc(tag)}" aria-pressed="${selected}" class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10.5px] font-semibold transition-all ${selected ? 'border-pine-800 bg-pine-800 text-white shadow-sm' : 'bg-white hover:border-pine-200'}" style="${selected ? '' : `border-color:${tone.border};color:${tone.color};background:${tone.bg}`}">
        <span class="h-1.5 w-1.5 flex-none rounded-full" style="background:${selected ? 'rgba(255,255,255,.72)' : tone.color};opacity:.75"></span>${esc(tag)}
        ${selected ? icon('check', 'h-2.5 w-2.5', 2.5) : ''}
      </button>
    `;
  }).join('');
}

function renderFormMastery() {
  if (!ui.form) return '';
  return MASTERY_ORDER.map((key) => {
    const meta = MASTERY[key];
    const selected = ui.form.mastery === key;
    return `
      <button type="button" data-action="set-form-mastery" data-mastery="${key}" aria-pressed="${selected}" class="flex min-h-[54px] flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${selected ? 'border-pine-700 bg-pine-50/75 shadow-[inset_0_0_0_1px_rgba(33,75,62,.08)]' : 'border-line bg-white hover:border-pine-200'}">
        <span class="flex h-4 w-4 flex-none items-center justify-center rounded-full border ${selected ? 'border-pine-700 bg-pine-700 text-white' : 'border-line bg-white'}">
          ${selected ? icon('check', 'h-2.5 w-2.5', 3) : ''}
        </span>
        <span class="min-w-0">
          <span class="block text-[10.5px] font-bold ${selected ? 'text-pine-800' : 'text-ink/55'}">${meta.label}</span>
          <span class="mt-0.5 block truncate text-[8.5px] ${selected ? 'text-pine-600/55' : 'text-ink/26'}">${meta.hint}</span>
        </span>
      </button>
    `;
  }).join('');
}

function renderFormScheduleNote() {
  if (!ui.form) return '';
  const isEditing = ui.form.mode === 'edit';
  const original = isEditing && ui.form.nextReviewOriginal
    ? ui.form.nextReviewOriginal
    : initialNextReviewFor(ui.form.mastery);
  return `
    <div class="flex items-start gap-2.5 rounded-xl border border-pine-100/80 bg-pine-50/50 px-3.5 py-3">
      <span class="mt-0.5 flex-none text-pine-600">${icon('calendar-plus', 'h-4 w-4')}</span>
      <div class="min-w-0 text-[9.5px] leading-5 text-pine-700/60">
        <p class="font-semibold text-pine-800/70">${isEditing ? '保持当前复习节奏' : '首次复习自动安排'}</p>
        <p class="mt-0.5">${isEditing ? `下次复习：${formatRelativeDate(original)}（${formatDateShort(original)}）。手动修改掌握程度不会重置本轮计划。` : `保存后将于 ${formatRelativeDate(original)}（${formatDateShort(original)}）提醒你复习，之后按 1 → 2 → 4 → 7 → 15 → 30 天递进延长。`}</p>
      </div>
    </div>
  `;
}

function renderQuestionFormBody() {
  const form = ui.form;
  if (!form) return '';
  return `
    <form id="question-form" class="space-y-7" novalidate>
      <div id="form-error" class="hidden rounded-xl border border-clay-100 bg-clay-50/70 px-3.5 py-2.5 text-[10px] leading-5 text-clay-700"></div>

      <section>
        <div class="mb-2 flex items-end justify-between gap-3">
          <label class="field-label mb-0">题目图片 <span class="field-hint">可选 · OCR 自动识别</span></label>
          <span class="text-[9px] text-ink/25">OCR 本地识别 · ${isCloudMode() ? '保存后同步' : '保存到本机'}</span>
        </div>
        <div id="question-image-field">${renderImageField()}</div>
        <input id="question-camera-input" type="file" accept="image/*" capture="environment" class="hidden">
        <input id="question-gallery-input" type="file" accept="image/*" class="hidden">
      </section>

      <section>
        <div class="mb-2 flex items-end justify-between gap-3">
          <label for="question-stem" class="field-label mb-0">题干 <span class="required-mark">*</span></label>
          <span class="inline-flex items-center gap-1 rounded-full bg-paper2 px-2 py-1 text-[8.5px] text-ink/32">支持 LaTeX：$…$</span>
        </div>
        <textarea id="question-stem" class="field min-h-[150px]" maxlength="30000" placeholder="输入或粘贴题目。例如：已知某消费者的效用函数为 $U=x^{0.5}y^{0.5}$，收入为 $m$，商品价格分别为 $p_x,p_y$，求最优消费组合。" required>${esc(form.stem)}</textarea>
      </section>

      <section>
        <div class="mb-2 flex items-end justify-between gap-3">
          <label for="question-answer" class="field-label mb-0">参考答案</label>
          <span class="text-[8.5px] text-ink/25">公式用 $…$ 包裹</span>
        </div>
        <textarea id="question-answer" class="field min-h-[120px]" maxlength="30000" placeholder="写下最终答案与关键步骤。复习时，它会和你的回忆对照。">${esc(form.answer)}</textarea>
      </section>

      <section>
        <div class="mb-2 flex items-end justify-between gap-3">
          <label for="question-analysis" class="field-label mb-0">错因分析</label>
          <span class="text-[8.5px] text-ink/25">比答案更重要</span>
        </div>
        <textarea id="question-analysis" class="field min-h-[110px]" maxlength="30000" placeholder="是概念混淆、条件看漏、计算失误，还是完全没有思路？写下真正的原因，复习时才不会重复踩坑。">${esc(form.analysis)}</textarea>
      </section>

      <section>
        <div class="mb-2 flex items-end justify-between gap-3">
          <span class="field-label mb-0">标签 <span class="field-hint">可多选</span></span>
          <span id="form-tag-count" class="text-[8.5px] text-ink/25">${ui.form.tags.length} 个已选择</span>
        </div>
        <div id="form-tags" class="flex flex-wrap gap-1.5">${renderFormTags()}</div>
        <div class="mt-2.5 flex items-center gap-2">
          <input id="form-new-tag" type="text" maxlength="24" class="field min-h-[38px] flex-1 py-2 text-[12px]" placeholder="新建标签，例如：博弈论">
          <button type="button" data-action="add-form-tag" class="btn btn-secondary min-h-[38px] px-3 text-[10px]">${icon('plus', 'h-3.5 w-3.5')}添加</button>
        </div>
      </section>

      <section>
        <div class="mb-2 flex items-end justify-between gap-3">
          <span class="field-label mb-0">掌握程度</span>
          <span class="text-[8.5px] text-ink/25">决定初始复习节奏</span>
        </div>
        <div id="form-mastery" class="flex flex-col gap-2 sm:flex-row">${renderFormMastery()}</div>
      </section>

      <section id="form-schedule-note">${renderFormScheduleNote()}</section>
    </form>
  `;
}

function renderImportPreviewBody() {
  const pending = ui.pendingImport;
  if (!pending) return '';
  return `
    <div class="rounded-2xl border border-gold-200/70 bg-gold-50/55 px-4 py-4">
      <div class="flex items-start gap-2.5">
        <span class="mt-0.5 flex-none text-gold-700">${icon('file', 'h-4 w-4')}</span>
        <div class="min-w-0 text-[10px] leading-5 text-gold-700/65">
          <p class="font-semibold text-gold-700">检测到有效的知隙备份文件</p>
          <p class="mt-0.5 break-all">${esc(pending.fileName)}</p>
        </div>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-2">
      ${[
        ['错题', pending.questions.length],
        ['标签', pending.tags.length],
        ['含图', pending.questions.filter((question) => question.image).length]
      ].map(([label, value]) => `
        <div class="rounded-xl border border-line-soft bg-paper2/55 px-3 py-3 text-center">
          <p class="font-display font-num text-xl font-semibold text-ink/72">${value}</p>
          <p class="mt-1 text-[9px] text-ink/30">${label}</p>
        </div>
      `).join('')}
    </div>

    ${pending.exportedAt ? `<p class="mt-3 text-[9px] text-ink/30">备份导出时间：${formatDateShort(dateKeyFromDate(new Date(pending.exportedAt)), true)} ${formatIsoTime(pending.exportedAt)}</p>` : ''}
    ${pending.invalidCount ? `<p class="mt-2 text-[9px] text-clay-600/65">有 ${pending.invalidCount} 条记录格式不完整，已被跳过。</p>` : ''}

    <div class="mt-5 space-y-2.5">
      <div class="rounded-xl border border-line bg-white px-3.5 py-3">
        <p class="text-[10px] font-bold text-ink/60">合并导入</p>
        <p class="mt-1 text-[9px] leading-5 text-ink/33">保留现有错题，仅加入备份中新的题目；相同 ID 的题目会跳过。适合把多台设备的数据合到一起。</p>
      </div>
      <div class="rounded-xl border border-clay-100 bg-clay-50/45 px-3.5 py-3">
        <p class="text-[10px] font-bold text-clay-700">覆盖导入</p>
        <p class="mt-1 text-[9px] leading-5 text-clay-600/55">用备份内容替换当前全部错题与自定义标签。当前未备份的数据会丢失，请先导出。</p>
      </div>
    </div>
    <p class="mt-4 text-[9px] leading-5 text-ink/25">导入只恢复题目与标签；通知等本地设置不会被覆盖。</p>
  `;
}


/* ============================================================
   Interaction layer: routing, modals, forms, OCR, backup
   ============================================================ */

const ROUTE_TITLES = {
  home: '知隙 · 经济学考研错题本',
  library: '错题本 · 知隙',
  review: '复习计划 · 知隙',
  quiz: '刷题模式 · 知隙',
  settings: '设置 · 知隙'
};

let librarySearchTimer = null;
let confirmState = null;
let ocrScriptPromise = null;
let ocrWorkerPromise = null;
let ocrLogger = null;
let ocrTaskChain = Promise.resolve();
let lastOcrPaintAt = 0;
let dueCheckInterval = null;
let mathJaxPromise = null;
let mathJaxFailureShown = false;

/* ---------- MathJax ---------- */
function loadMathJax() {
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    return Promise.resolve(window.MathJax);
  }
  if (mathJaxPromise) return mathJaxPromise;
  mathJaxPromise = new Promise((resolve, reject) => {
    let index = 0;
    const attempt = () => {
      if (index >= MATHJAX_SCRIPT_URLS.length) {
        reject(new Error('MathJax CDN unavailable'));
        return;
      }
      const source = MATHJAX_SCRIPT_URLS[index];
      index += 1;
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.remove();
        attempt();
      }, 14000);
      script.onload = () => {
        if (settled) return;
        if (!window.MathJax || typeof window.MathJax.typesetPromise !== 'function') {
          settled = true;
          window.clearTimeout(timer);
          script.remove();
          attempt();
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        Promise.resolve(window.MathJax.startup && window.MathJax.startup.promise)
          .then(() => {
            window.dispatchEvent(new Event('engine-ready'));
            resolve(window.MathJax);
          })
          .catch((error) => {
            reject(error);
          });
      };
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        script.remove();
        attempt();
      };
      document.head.appendChild(script);
    };
    attempt();
  });
  mathJaxPromise = mathJaxPromise.catch((error) => {
    mathJaxPromise = null;
    throw error;
  });
  return mathJaxPromise;
}

function initializeMathJax() {
  loadMathJax()
    .then(() => {
      typesetMath(document.getElementById('view'));
      typesetMath(document.getElementById('main-modal-body'));
    })
    .catch((error) => {
      console.warn('MathJax 加载失败', error);
      if (mathJaxFailureShown) return;
      mathJaxFailureShown = true;
      showToast('公式渲染组件加载失败。请检查网络后刷新；暂时仍可正常录入和复习。', 'warning', 7200);
    });
}

/* ---------- MathJax typesetting ---------- */
function typesetMath(container) {
  if (!container) return;
  let attempts = 0;
  let timer = null;
  const tryTypeset = () => {
    const mathJax = window.MathJax;
    if (!mathJax || typeof mathJax.typesetPromise !== 'function') return false;
    try {
      mathJax.typesetPromise([container]).catch((error) => {
        console.warn('MathJax typeset failed', error);
      });
    } catch (error) {
      console.warn('MathJax typeset failed', error);
    }
    return true;
  };
  if (tryTypeset()) return;
  timer = window.setInterval(() => {
    attempts += 1;
    if (tryTypeset() || attempts > 40) {
      window.clearInterval(timer);
    }
  }, 250);
}

/* ---------- toast ---------- */
function showToast(message, tone = 'default', duration = 3600) {
  const root = document.getElementById('toast-root');
  if (!root || !message) return;
  while (root.children.length >= 4) root.removeChild(root.firstElementChild);
  const toneMeta = {
    default: { bar: 'bg-pine-900', icon: 'check-circle', iconColor: 'text-gold-200', border: 'border-white/10' },
    success: { bar: 'bg-pine-900', icon: 'check-circle', iconColor: 'text-gold-200', border: 'border-white/10' },
    warning: { bar: 'bg-[#2A3D32]', icon: 'bell', iconColor: 'text-gold-200', border: 'border-gold-200/20' },
    error: { bar: 'bg-[#7E4434]', icon: 'alert', iconColor: 'text-[#F5D7C8]', border: 'border-white/10' },
    info: { bar: 'bg-pine-900', icon: 'info', iconColor: 'text-gold-200', border: 'border-white/10' }
  }[tone] || {
    bar: 'bg-pine-900', icon: 'info', iconColor: 'text-gold-200', border: 'border-white/10'
  };
  const item = document.createElement('div');
  item.className = `toast-item pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border ${toneMeta.border} ${toneMeta.bar} px-4 py-3 text-white shadow-[0_18px_40px_-18px_rgba(10,25,20,.7)]`;
  item.innerHTML = `
    <span class="mt-0.5 flex-none ${toneMeta.iconColor}">${icon(toneMeta.icon, 'h-4 w-4')}</span>
    <p class="min-w-0 flex-1 text-[11px] leading-5 text-white/78">${esc(message)}</p>
    <button type="button" data-toast-close class="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-white/28 transition-colors hover:bg-white/10 hover:text-white/65" aria-label="关闭提示">${icon('x', 'h-3 w-3', 2)}</button>
  `;
  root.appendChild(item);
  const remove = () => {
    if (!item.isConnected) return;
    item.classList.add('is-leaving');
    window.setTimeout(() => item.remove(), 200);
  };
  item.querySelector('[data-toast-close]')?.addEventListener('click', remove);
  window.setTimeout(remove, duration);
}

/* ---------- modal manager ---------- */
function syncBodyLock() {
  const locked = Boolean(ui.modal) || Boolean(confirmState);
  document.body.style.overflow = locked ? 'hidden' : '';
}

function openMainModal(config) {
  if (ui.modal) closeMainModal({ restoreFocus: false, silent: true });
  const root = document.getElementById('modal-root');
  if (!root) return;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.modal = {
    kind: config.kind || 'generic',
    onRequestClose: config.onRequestClose || null,
    onClose: config.onClose || null,
    previousFocus
  };
  const size = config.size || 'max-w-3xl';
  const bodyClass = config.bodyClass || 'px-5 py-5 sm:px-7 sm:py-6';
  const footer = config.footer || '';
  root.innerHTML = `
    <div class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div class="modal-backdrop absolute inset-0" data-modal-backdrop></div>
      <section id="main-modal-panel" role="dialog" aria-modal="true" aria-labelledby="main-modal-title" tabindex="-1" class="modal-panel relative flex max-h-[94dvh] w-full ${size} flex-col overflow-hidden rounded-t-[26px] border border-white/45 bg-paper sm:max-h-[88vh] sm:rounded-[26px]">
        <header class="flex flex-none items-start justify-between gap-4 border-b border-line/70 px-5 pb-4 pt-4 sm:px-7 sm:pt-5">
          <div class="min-w-0">
            <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-pine-700/45">${config.eyebrow || 'Zhixi · 知隙'}</p>
            <h2 id="main-modal-title" class="mt-1.5 font-display text-[1.4rem] font-semibold leading-tight text-ink sm:text-[1.6rem]">${config.title || ''}</h2>
            ${config.subtitle ? `<p class="mt-1 text-[10px] leading-5 text-ink/35">${config.subtitle}</p>` : ''}
          </div>
          <button type="button" data-action="request-close-modal" class="btn-icon mt-0.5 h-9 w-9 border-transparent bg-transparent hover:bg-black/[0.04]" aria-label="关闭">${icon('x', 'h-[18px] w-[18px]')}</button>
        </header>
        <div id="main-modal-body" class="modal-body min-h-0 flex-1 overflow-y-auto ${bodyClass}">${config.body || ''}</div>
        ${footer ? `<footer class="safe-bottom flex-none border-t border-line/80 bg-paper2/88 px-5 py-3.5 sm:px-7">${footer}</footer>` : ''}
      </section>
    </div>
  `;
  syncBodyLock();
  const panel = document.getElementById('main-modal-panel');
  if (panel) {
    try { panel.focus({ preventScroll: true }); } catch (error) { panel.focus(); }
  }
  if (typeof config.onMount === 'function') {
    try { config.onMount(root); } catch (error) { console.error(error); }
  }
  typesetMath(document.getElementById('main-modal-body'));
}

function closeMainModal(options = {}) {
  if (!ui.modal) return;
  const modal = ui.modal;
  const restoreTarget = options.restoreFocus !== false ? modal.previousFocus : null;
  ui.modal = null;
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  syncBodyLock();
  if (!options.silent && typeof modal.onClose === 'function') {
    try { modal.onClose(); } catch (error) { console.error(error); }
  }
  if (restoreTarget && restoreTarget.isConnected) {
    window.requestAnimationFrame(() => {
      try { restoreTarget.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
    });
  }
}

function requestCloseMainModal() {
  if (!ui.modal) return;
  if (typeof ui.modal.onRequestClose === 'function') {
    ui.modal.onRequestClose();
    return;
  }
  closeMainModal();
}

function askConfirm(options = {}) {
  if (confirmState) return Promise.resolve(false);
  const root = document.getElementById('confirm-root');
  if (!root) return Promise.resolve(false);
  const tone = options.tone === 'danger' ? 'danger' : 'default';
  const cancelText = options.cancelText || '取消';
  const confirmText = options.confirmText || '确认';
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise((resolve) => {
    const finish = (value) => {
      if (!confirmState) return;
      const target = confirmState.previousFocus;
      confirmState = null;
      root.innerHTML = '';
      syncBodyLock();
      resolve(Boolean(value));
      if (target && target.isConnected) {
        window.requestAnimationFrame(() => {
          try { target.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
        });
      }
    };
    confirmState = { finish, previousFocus };
    root.innerHTML = `
      <div class="fixed inset-0 z-[96] flex items-center justify-center px-4 py-6">
        <div class="modal-backdrop absolute inset-0" data-confirm-backdrop></div>
        <div id="confirm-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabindex="-1" class="confirm-panel relative w-full max-w-[25rem] overflow-hidden rounded-[24px] border border-white/50 bg-paper shadow-[0_40px_100px_-34px_rgba(4,16,12,.6)]">
          <div class="px-5 pb-4 pt-5 sm:px-6">
            <div class="flex items-start gap-3">
              <span class="flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone === 'danger' ? 'bg-clay-50 text-clay-500' : 'bg-pine-50 text-pine-600'}">
                ${icon(tone === 'danger' ? 'alert' : 'info', 'h-[18px] w-[18px]')}
              </span>
              <div class="min-w-0 pt-0.5">
                <h2 id="confirm-title" class="font-display text-[17px] font-semibold leading-snug text-ink">${esc(options.title || '确认操作')}</h2>
                <p class="mt-1.5 text-[11px] leading-5 text-ink/42">${esc(options.message || '')}</p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-line/70 bg-paper2/80 px-4 py-3.5 sm:px-5">
            <button type="button" data-confirm-cancel class="btn btn-secondary min-h-[40px] px-4 text-[11px]">${esc(cancelText)}</button>
            <button type="button" data-confirm-ok class="btn min-h-[40px] px-4 text-[11px] ${tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}">${esc(confirmText)}</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector('[data-confirm-backdrop]')?.addEventListener('click', () => finish(false));
    root.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => finish(false));
    root.querySelector('[data-confirm-ok]')?.addEventListener('click', () => finish(true));
    syncBodyLock();
    const panel = document.getElementById('confirm-panel');
    if (panel) {
      try { panel.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
    }
    window.setTimeout(() => {
      const target = root.querySelector(tone === 'danger' ? '[data-confirm-cancel]' : '[data-confirm-ok]');
      if (target) {
        try { target.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
      }
    }, 30);
  });
}

/* ---------- actions ---------- */
const CLICK_ACTIONS = new Set([
  'open-new', 'open-question', 'edit-question', 'delete-question', 'review-single',
  'request-close-modal', 'dismiss-due-banner',
  'start-review', 'reveal-answer', 'review-feedback', 'skip-review', 'exit-review',
  'review-overview',
  'quiz-set-tag', 'quiz-set-count', 'start-quiz', 'quiz-reveal', 'quiz-judge',
  'exit-quiz', 'quiz-again', 'quiz-back-setup',
  'filter-tag', 'filter-mastery', 'clear-library-search', 'clear-library-filters',
  'toggle-notifications', 'test-notification', 'add-tag', 'delete-tag',
  'export-data', 'trigger-import', 'import-merge', 'import-overwrite', 'clear-all-data',
  'toggle-form-tag', 'add-form-tag', 'set-form-mastery', 'trigger-camera',
  'trigger-gallery', 'remove-image', 'retry-ocr', 'save-question', 'load-demo'
]);

function handleDocumentClick(event) {
  if (event.target.closest('#confirm-root')) return;
  const backdrop = event.target.closest('[data-modal-backdrop]');
  if (backdrop) {
    requestCloseMainModal();
    return;
  }
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.getAttribute('data-action');
  if (!action) return;
  if (actionTarget.tagName === 'A') event.preventDefault();
  event.stopPropagation();
  void handleAction(action, actionTarget, event).catch((error) => {
    console.error('Action failed:', action, error);
    showToast('操作没有完成，请稍后重试。', 'error');
  });
}

async function handleAction(action, element) {
  if (!CLICK_ACTIONS.has(action)) return;
  switch (action) {
    case 'open-new':
      openQuestionForm();
      break;
    case 'open-question':
      openQuestionDetail(element.getAttribute('data-id'));
      break;
    case 'edit-question': {
      const id = element.getAttribute('data-id');
      if (ui.modal) closeMainModal({ restoreFocus: false });
      openQuestionForm(id);
      break;
    }
    case 'delete-question':
      await deleteQuestion(element.getAttribute('data-id'));
      break;
    case 'review-single': {
      const id = element.getAttribute('data-id');
      if (ui.modal) closeMainModal({ restoreFocus: false });
      startReviewWithIds([id], { single: true });
      break;
    }
    case 'request-close-modal':
      requestCloseMainModal();
      break;
    case 'dismiss-due-banner':
      ui.dueBannerDismissed = todayKey();
      updateDueBanner();
      break;
    case 'start-review':
      startReviewWithDue();
      break;
    case 'reveal-answer':
      revealReviewAnswer();
      break;
    case 'review-feedback':
      submitReviewFeedback(element.getAttribute('data-feedback'));
      break;
    case 'skip-review':
      skipCurrentReview();
      break;
    case 'exit-review':
      await exitReviewSession();
      break;
    case 'review-overview':
      ui.review = null;
      rerenderCurrentView({});
      break;
    case 'quiz-set-tag':
      setQuizTag(element.getAttribute('data-tag'));
      break;
    case 'quiz-set-count':
      setQuizCount(element.getAttribute('data-count'));
      break;
    case 'start-quiz':
      startQuiz();
      break;
    case 'quiz-reveal':
      revealQuizAnswer();
      break;
    case 'quiz-judge':
      judgeQuizAnswer(element.getAttribute('data-correct') === 'true');
      break;
    case 'exit-quiz':
      await exitQuiz();
      break;
    case 'quiz-again':
      startQuiz();
      break;
    case 'quiz-back-setup':
      ui.quizSession = null;
      rerenderCurrentView({});
      break;
    case 'filter-tag':
      setLibraryTagFilter(element.getAttribute('data-tag'));
      break;
    case 'filter-mastery':
      setLibraryMasteryFilter(element.getAttribute('data-mastery'));
      break;
    case 'clear-library-search':
      clearLibrarySearch();
      break;
    case 'clear-library-filters':
      clearLibraryFilters();
      break;
    case 'toggle-notifications':
      await toggleNotifications();
      break;
    case 'test-notification':
      sendTestNotification();
      break;
    case 'add-tag':
      addGlobalTag();
      break;
    case 'delete-tag':
      await deleteGlobalTag(element.getAttribute('data-tag'));
      break;
    case 'export-data':
      await exportBackup();
      break;
    case 'trigger-import':
      triggerImportPicker();
      break;
    case 'import-merge':
      await completeImport('merge');
      break;
    case 'import-overwrite':
      await completeImport('overwrite');
      break;
    case 'clear-all-data':
      await clearAllData();
      break;
    case 'toggle-form-tag':
      toggleFormTag(element.getAttribute('data-tag'));
      break;
    case 'add-form-tag':
      addFormTag();
      break;
    case 'set-form-mastery':
      setFormMastery(element.getAttribute('data-mastery'));
      break;
    case 'trigger-camera':
      openImagePicker('question-camera-input');
      break;
    case 'trigger-gallery':
      openImagePicker('question-gallery-input');
      break;
    case 'remove-image':
      removeFormImage();
      break;
    case 'retry-ocr':
      startOcrForCurrentImage();
      break;
    case 'save-question':
      saveQuestionFromForm();
      break;
    case 'load-demo':
      loadDemoData();
      break;
    default:
      break;
  }
}

/* ---------- input & change events ---------- */
function handleDocumentInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.id === 'library-search') {
    ui.library.search = target.value;
    const clearButton = document.getElementById('library-search-clear');
    if (clearButton) clearButton.classList.toggle('hidden', !ui.library.search);
    window.clearTimeout(librarySearchTimer);
    librarySearchTimer = window.setTimeout(() => {
      if (currentRoute === 'library') refreshLibraryView();
    }, 140);
    return;
  }

  if (!ui.form || !document.getElementById('question-form')) return;
  if (target.id === 'question-stem') {
    ui.form.stem = target.value;
    markFormDirty();
    clearFormError();
  } else if (target.id === 'question-answer') {
    ui.form.answer = target.value;
    markFormDirty();
    clearFormError();
  } else if (target.id === 'question-analysis') {
    ui.form.analysis = target.value;
    markFormDirty();
    clearFormError();
  }
}

function handleDocumentChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.id === 'library-sort' && target instanceof HTMLSelectElement) {
    ui.library.sort = target.value;
    refreshLibraryView();
    return;
  }

  if (target.id === 'question-camera-input' || target.id === 'question-gallery-input') {
    const file = target.files && target.files[0];
    target.value = '';
    if (file) void handleSelectedImage(file);
    return;
  }

  if (target.id === 'import-file') {
    const file = target.files && target.files[0];
    target.value = '';
    if (file) void handleImportFile(file);
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    if (confirmState) {
      confirmState.finish(false);
      event.preventDefault();
      return;
    }
    if (ui.modal) {
      requestCloseMainModal();
      event.preventDefault();
      return;
    }
  }

  if (event.key === 'Tab') {
    trapFocus(event);
    return;
  }

  if (event.key === 'Enter' && !event.isComposing) {
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.id === 'form-new-tag') {
        event.preventDefault();
        addFormTag();
        return;
      }
      if (target.id === 'settings-new-tag') {
        event.preventDefault();
        addGlobalTag();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && document.getElementById('question-form') && target.closest('#question-form')) {
        event.preventDefault();
        saveQuestionFromForm();
        return;
      }
    }
  }
}

function getFocusable(container) {
  if (!container) return [];
  return [...container.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node instanceof HTMLElement && node.offsetParent !== null);
}

function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const panel = confirmState
    ? document.getElementById('confirm-panel')
    : ui.modal
      ? document.getElementById('main-modal-panel')
      : null;
  if (!panel) return;
  const focusable = getFocusable(panel);
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !panel.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !panel.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- routing ---------- */
function handleHashChange() {
  const previousRoute = currentRoute;
  currentRoute = getRouteFromHash();
  if (previousRoute !== currentRoute) {
    if (previousRoute === 'review' && ui.review && ui.review.phase === 'done') ui.review = null;
    if (previousRoute === 'quiz' && ui.quizSession && ui.quizSession.phase === 'done') ui.quizSession = null;
  }
  document.title = ROUTE_TITLES[currentRoute] || ROUTE_TITLES.home;
  renderRoute({ scrollTop: true, animate: true });
  updateReminderState({ initial: false });
}

function bindGlobalEvents() {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('input', handleDocumentInput);
  document.addEventListener('change', handleDocumentChange);
  document.addEventListener('keydown', handleDocumentKeydown);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('storage', handleStorageSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateReminderState({ initial: false });
  });
  const fab = document.getElementById('fab');
  if (fab) fab.addEventListener('click', () => openQuestionForm());
}

function init() {
  bindGlobalEvents();
  document.title = ROUTE_TITLES[currentRoute] || ROUTE_TITLES.home;
  renderRoute({ scrollTop: false, animate: false });
  initializeMathJax();
  updateReminderState({ initial: true });
  dueCheckInterval = window.setInterval(() => updateReminderState({ initial: false }), 60000);
  window.setTimeout(() => {
    bootNotices.forEach((notice) => {
      showToast(notice.text, notice.tone === 'danger' ? 'error' : 'warning', 7600);
    });
  }, 500);
  window.addEventListener('engine-ready', () => typesetMath(document.getElementById('view')));
}

/* ============================================================
   Reminder engine
   ============================================================ */
function updateReminderState(options = {}) {
  const today = todayKey();
  const dateRolled = ui.lastDateKey !== today;
  if (dateRolled) {
    ui.lastDateKey = today;
    ui.dueBannerDismissed = '';
  }
  const due = getDueQuestions();
  const dueCount = due.length;
  if (ui._lastDueCount !== dueCount) {
    renderShell();
    ui._lastDueCount = dueCount;
    updateDueBanner();
  } else {
    updateDueBanner();
  }
  if (dateRolled) {
    rerenderCurrentView({});
  }

  if (dueCount > 0 && state.settings.notifications && typeof window.Notification !== 'undefined' && Notification.permission === 'granted') {
    const signature = `${today}|${due.map((question) => question.id).sort().join('|')}`;
    if (state.settings.lastDueSignature !== signature) {
      try {
        const notification = new Notification('知隙 · 该复习了', {
          body: `今天有 ${dueCount} 道错题到了复习时间。先回忆，再对照答案。`,
          tag: 'zhixi-review-due'
        });
        notification.onclick = () => {
          try { window.focus(); } catch (error) { /* ignore */ }
          if (window.location.hash !== '#/review') window.location.hash = '#/review';
          notification.close();
        };
        state.settings.lastDueSignature = signature;
        persistSilently();
      } catch (error) {
        console.warn('系统通知发送失败', error);
      }
    }
  }

  if ((options.initial || dateRolled) && dueCount > 0 && state.settings.lastInAppReminder !== today) {
    const activeFocusSession = (currentRoute === 'review' && ui.review && ui.review.phase === 'active')
      || (currentRoute === 'quiz' && ui.quizSession && ui.quizSession.phase === 'playing');
    if (!ui.modal && !confirmState && !activeFocusSession) {
      state.settings.lastInAppReminder = today;
      persistSilently();
      window.setTimeout(() => {
        if (!ui.modal && !confirmState && getDueQuestions().length > 0) {
          showToast(`今天有 ${getDueQuestions().length} 道错题需要复习，先回忆，再作答。`, 'warning', 5600);
        }
      }, 900);
    }
  }
}

function handleStorageSync(event) {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const incoming = normalizeState(JSON.parse(event.newValue));
    state = incoming;
    if (ui.library.tag !== 'all' && !state.tags.includes(ui.library.tag)) ui.library.tag = 'all';
    if (ui.quizSetup.tag !== 'all' && !state.tags.includes(ui.quizSetup.tag)) ui.quizSetup.tag = 'all';
    if (ui.review && ui.review.phase === 'active') {
      const remaining = ui.review.ids.slice(ui.review.index).filter((id) => getQuestionById(id));
      if (!remaining.length) ui.review = null;
    }
    if (ui.quizSession && ui.quizSession.phase === 'playing') {
      if (!getQuestionById(ui.quizSession.ids[ui.quizSession.index] || '')) ui.quizSession = null;
    }
    renderRoute({ scrollTop: false, animate: false });
    showToast('数据已从另一个标签页同步更新。', 'info');
  } catch (error) {
    console.warn('同步其他标签页数据失败', error);
  }
}

/* ============================================================
   Question detail
   ============================================================ */
function openQuestionDetail(id) {
  if (!id) return;
  const question = getQuestionById(id);
  if (!question) {
    showToast('这道错题已不存在。', 'error');
    return;
  }
  const due = question.nextReview <= todayKey();
  openMainModal({
    kind: 'detail',
    eyebrow: 'Question detail',
    title: '错题详情',
    subtitle: question.tags.length ? question.tags.map((tag) => `#${tag}`).join('  ') : '记录 · 反思 · 在遗忘前重逢',
    body: renderQuestionDetailBody(question),
    bodyClass: 'px-5 py-5 sm:px-7 sm:py-6',
    size: 'max-w-2xl',
    footer: `
      <div class="flex items-center justify-between gap-2.5">
        <button type="button" data-action="delete-question" data-id="${esc(question.id)}" class="btn btn-ghost min-h-[42px] px-2.5 text-[11px] text-clay-600/65 hover:bg-clay-50 hover:text-clay-700">
          ${icon('trash', 'h-4 w-4')}删除
        </button>
        <div class="flex flex-1 justify-end gap-2">
          <button type="button" data-action="edit-question" data-id="${esc(question.id)}" class="btn btn-secondary min-h-[42px]">${icon('edit', 'h-4 w-4')}编辑</button>
          <button type="button" data-action="review-single" data-id="${esc(question.id)}" class="btn btn-primary min-h-[42px]">${icon('rotate', 'h-4 w-4')}${due ? '立即复习' : '提前复习'}</button>
        </div>
      </div>
    `
  });
}

async function deleteQuestion(id) {
  const question = getQuestionById(id);
  if (!question) {
    showToast('这道错题已不存在。', 'error');
    return;
  }
  const confirmed = await askConfirm({
    title: '删除这道错题？',
    message: '删除后，它的复习记录、图片与标签引用都会一并移除，且无法恢复。建议先导出备份。',
    confirmText: '删除',
    cancelText: '保留',
    tone: 'danger'
  });
  if (!confirmed) return;
  const success = commitState((draft) => {
    draft.questions = draft.questions.filter((item) => item.id !== id);
  });
  if (!success) return;
  if (ui.modal && ui.modal.kind === 'detail') closeMainModal({ restoreFocus: false });
  rerenderCurrentView({});
  showToast('错题已删除。', 'default');
}

/* ============================================================
   Question form
   ============================================================ */
function openQuestionForm(id = null) {
  let question = null;
  if (id) {
    question = getQuestionById(id);
    if (!question) {
      showToast('这道错题已不存在。', 'error');
      return;
    }
  }
  const preselectedTags = !question && currentRoute === 'library' && ui.library.tag !== 'all' && state.tags.includes(ui.library.tag)
    ? [ui.library.tag]
    : [];
  const initialMastery = !question && currentRoute === 'library' && MASTERY[ui.library.mastery]
    ? ui.library.mastery
    : 'unmastered';
  ui.ocrRun += 1;
  ui.form = {
    mode: question ? 'edit' : 'new',
    id: question ? question.id : null,
    stem: question ? question.stem : '',
    answer: question ? question.answer : '',
    analysis: question ? question.analysis : '',
    tags: question ? [...question.tags] : preselectedTags,
    newTags: [],
    mastery: question ? question.mastery : initialMastery,
    image: question ? question.image : '',
    imagePath: question ? (question.imagePath || '') : '',
    imageChanged: false,
    ocr: { status: 'idle', progress: 0, message: '' },
    lastOcrText: '',
    dirty: false,
    saving: false,
    closing: false,
    nextReviewOriginal: question ? question.nextReview : ''
  };
  openMainModal({
    kind: 'question-form',
    eyebrow: question ? 'Edit question' : 'New question',
    title: question ? '编辑错题' : '录入错题',
    subtitle: question ? '修改内容不会重置已开始运转的复习计划' : '记录真实错误，剩下的交给遗忘曲线',
    body: renderQuestionFormBody(),
    bodyClass: 'px-5 py-5 sm:px-7 sm:py-6',
    size: 'max-w-3xl',
    onRequestClose: requestCloseQuestionForm,
    onClose: () => {
      ui.ocrRun += 1;
      ui.form = null;
      ocrLogger = null;
    },
    footer: `
      <div class="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p class="hidden text-[9px] leading-4 text-ink/28 sm:block">支持 MathJax 公式 · ${isCloudMode() ? '保存后自动同步私有云端' : '保存后写入本机'}</p>
        <div class="flex w-full items-center gap-2 sm:w-auto">
          <button type="button" data-action="request-close-modal" class="btn btn-ghost min-h-[42px] flex-1 sm:flex-none">取消</button>
          <button type="button" data-action="save-question" class="btn btn-primary min-h-[42px] flex-[1.6] px-5">
            ${icon('check', 'h-4 w-4', 2.2)}保存错题
          </button>
        </div>
      </div>
    `
  });
}

function markFormDirty() {
  if (!ui.form) return;
  ui.form.dirty = true;
}

function showFormError(message) {
  const el = document.getElementById('form-error');
  if (!el) {
    showToast(message, 'error');
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
  try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (error) { /* ignore */ }
}

function clearFormError() {
  const el = document.getElementById('form-error');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

async function requestCloseQuestionForm() {
  if (!ui.form || ui.form.saving || ui.form.closing) return;
  if (!ui.form.dirty) {
    closeMainModal();
    return;
  }
  ui.form.closing = true;
  const confirmed = await askConfirm({
    title: '放弃本次编辑？',
    message: '已经填写的题目、答案或图片不会被保存。',
    confirmText: '放弃修改',
    cancelText: '继续编辑',
    tone: 'danger'
  });
  if (ui.form) ui.form.closing = false;
  if (confirmed && ui.form) closeMainModal();
}

function syncFormFieldsFromDom() {
  if (!ui.form) return;
  const stem = document.getElementById('question-stem');
  const answer = document.getElementById('question-answer');
  const analysis = document.getElementById('question-analysis');
  if (stem instanceof HTMLTextAreaElement) ui.form.stem = stem.value;
  if (answer instanceof HTMLTextAreaElement) ui.form.answer = answer.value;
  if (analysis instanceof HTMLTextAreaElement) ui.form.analysis = analysis.value;
}

function readFormNewTagInput() {
  const input = document.getElementById('form-new-tag');
  return input instanceof HTMLInputElement ? normalizeTagName(input.value) : '';
}

function addFormTag() {
  if (!ui.form) return;
  const tag = readFormNewTagInput();
  if (!tag) {
    showToast('请输入标签名称。', 'warning');
    return;
  }
  const allTags = getFormAllTags();
  if (allTags.includes(tag)) {
    if (!ui.form.tags.includes(tag)) {
      if (ui.form.tags.length >= 12) {
        showToast('每道题最多选择 12 个标签。', 'warning');
        return;
      }
      ui.form.tags.push(tag);
    }
    markFormDirty();
    refreshFormTagArea();
    const input = document.getElementById('form-new-tag');
    if (input) input.value = '';
    showToast('该标签已存在，已为你选中。', 'info', 2600);
    return;
  }
  if (ui.form.tags.length >= 12) {
    showToast('每道题最多选择 12 个标签。', 'warning');
    return;
  }
  ui.form.newTags = normalizeTags([...ui.form.newTags, tag]);
  ui.form.tags = normalizeTags([...ui.form.tags, tag]);
  markFormDirty();
  refreshFormTagArea();
  const input = document.getElementById('form-new-tag');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.focus();
  }
  showToast(`已添加标签「${tag}」`, 'success', 2400);
}

function toggleFormTag(tag) {
  if (!ui.form || !tag) return;
  const normalized = normalizeTagName(tag);
  if (ui.form.tags.includes(normalized)) {
    ui.form.tags = ui.form.tags.filter((item) => item !== normalized);
  } else {
    if (ui.form.tags.length >= 12) {
      showToast('每道题最多选择 12 个标签。', 'warning');
      return;
    }
    ui.form.tags.push(normalized);
  }
  markFormDirty();
  refreshFormTagArea();
}

function refreshFormTagArea() {
  if (!ui.form) return;
  const tags = document.getElementById('form-tags');
  if (tags) tags.innerHTML = renderFormTags();
  const count = document.getElementById('form-tag-count');
  if (count) count.textContent = `${ui.form.tags.length} 个已选择`;
}

function setFormMastery(mastery) {
  if (!ui.form || !MASTERY[mastery]) return;
  if (ui.form.mastery === mastery) return;
  ui.form.mastery = mastery;
  markFormDirty();
  const container = document.getElementById('form-mastery');
  if (container) container.innerHTML = renderFormMastery();
  const note = document.getElementById('form-schedule-note');
  if (note) note.innerHTML = renderFormScheduleNote();
}

function setSaveButtonLoading(loading) {
  const button = document.querySelector('[data-action="save-question"]');
  if (!(button instanceof HTMLButtonElement)) return;
  button.disabled = Boolean(loading);
  button.innerHTML = loading
    ? `<span class="spinner !border-white/30 !border-t-white"></span>保存中…`
    : `${icon('check', 'h-4 w-4', 2.2)}保存错题`;
}

function saveQuestionFromForm() {
  if (!ui.form || ui.form.saving) return;
  syncFormFieldsFromDom();
  const stem = ui.form.stem.trim();
  if (!stem) {
    showFormError('题干不能为空，请先输入或识别题目。');
    const stemField = document.getElementById('question-stem');
    if (stemField) {
      stemField.focus();
      try { stemField.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (error) { /* ignore */ }
    }
    return;
  }
  if (ui.form.mode === 'edit' && !getQuestionById(ui.form.id)) {
    showFormError('这道错题已在其他页面被删除，请关闭后重新打开。');
    return;
  }

  const existing = ui.form.mode === 'edit' ? getQuestionById(ui.form.id) : null;
  const tags = normalizeTags(ui.form.tags).slice(0, 12);
  const newQuestion = {
    id: existing ? existing.id : newId(),
    stem,
    answer: ui.form.answer.trim(),
    analysis: ui.form.analysis.trim(),
    tags,
    mastery: MASTERY[ui.form.mastery] ? ui.form.mastery : 'unmastered',
    image: ui.form.image || '',
    imagePath: existing && !ui.form.imageChanged ? (existing.imagePath || '') : '',
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextReview: existing ? existing.nextReview : initialNextReviewFor(ui.form.mastery),
    reviewStage: existing ? existing.reviewStage : 0,
    reviewHistory: existing ? existing.reviewHistory : [],
    lastReviewedAt: existing ? existing.lastReviewedAt : ''
  };

  ui.form.saving = true;
  setSaveButtonLoading(true);
  clearFormError();
  const success = commitState((draft) => {
    const index = draft.questions.findIndex((item) => item.id === newQuestion.id);
    if (index >= 0) draft.questions[index] = newQuestion;
    else draft.questions.unshift(newQuestion);
    draft.tags = normalizeTags([...draft.tags, ...tags, ...ui.form.newTags]);
  });

  if (!success) {
    ui.form.saving = false;
    setSaveButtonLoading(false);
    showFormError('保存失败，可能是浏览器的本地存储空间不足。可尝试移除图片、清理旧错题，或先导出备份。');
    return;
  }

  const wasEditing = ui.form.mode === 'edit';
  ui.form.dirty = false;
  ui.form.saving = false;
  const routeBefore = currentRoute;
  closeMainModal({ restoreFocus: false });
  ui.ocrRun += 1;
  ui.form = null;
  ocrLogger = null;
  if (routeBefore === 'library' && ui.library.tag !== 'all' && !state.tags.includes(ui.library.tag)) {
    ui.library.tag = 'all';
  }
  rerenderCurrentView({});
  showToast(wasEditing ? '错题已更新，复习计划保持不变。' : '错题已录入，复习日期已经排好。', 'success', 3800);
}

/* ============================================================
   Image handling + OCR
   ============================================================ */
function openImagePicker(inputId) {
  if (!ui.form) return;
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) return;
  input.value = '';
  input.click();
}

function refreshImageFieldContainer() {
  const container = document.getElementById('question-image-field');
  if (!container || !ui.form) return;
  container.innerHTML = renderImageField();
}

function markImageProcessing() {
  const container = document.getElementById('question-image-field');
  if (!container) return;
  if (!ui.form || !ui.form.image) {
    container.innerHTML = `
      <div class="rounded-2xl border border-dashed border-[#D8D1C3] bg-paper2/55 px-4 py-8 text-center">
        <span class="spinner mx-auto"></span>
        <p class="mt-3 text-[10px] font-semibold text-ink/45">正在压缩图片…</p>
        <p class="mt-1 text-[9px] text-ink/28">大尺寸照片会先缩放，以减少本地存储占用。</p>
      </div>
    `;
  } else {
    paintOcrStatus({ status: 'processing', message: '正在处理新图片…', progress: 2 });
  }
}

async function handleSelectedImage(file) {
  if (!(file instanceof File) || !ui.form) return;
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件。', 'warning');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast('图片超过 25 MB，请使用压缩后的图片或降低拍摄分辨率。', 'warning', 5000);
    return;
  }
  const form = ui.form;
  markImageProcessing();
  try {
    const compressed = await compressImage(file);
    if (ui.form !== form) return;
    form.image = compressed;
    form.imagePath = '';
    form.imageChanged = true;
    form.ocr = { status: 'idle', progress: 0, message: '' };
    markFormDirty();
    refreshImageFieldContainer();
    startOcrForCurrentImage();
  } catch (error) {
    console.error('图片处理失败', error);
    if (ui.form !== form) return;
    refreshImageFieldContainer();
    if (form.image) {
      form.ocr = { status: 'error', progress: 0, message: '图片处理失败，请换一张照片重试。' };
      paintOcrStatus(form.ocr);
    }
    showToast('图片处理失败，请换一张 JPG 或 PNG 图片重试。', 'error', 4800);
  }
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取图片文件'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片解码失败'));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const image = await loadImageElement(file);
  const maxEdge = 1600;
  const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  let width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
  let height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
  if (width * height > 2800000) {
    const shrink = Math.sqrt(2800000 / (width * height));
    width = Math.max(1, Math.round(width * shrink));
    height = Math.max(1, Math.round(height * shrink));
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理图片');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  let quality = 0.82;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 1450000 && quality > 0.48) {
    quality -= 0.09;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > 2200000) {
    const smallCanvas = document.createElement('canvas');
    const smallRatio = Math.sqrt(1800000 / result.length);
    smallCanvas.width = Math.max(1, Math.round(width * Math.min(1, smallRatio)));
    smallCanvas.height = Math.max(1, Math.round(height * Math.min(1, smallRatio)));
    const smallContext = smallCanvas.getContext('2d');
    if (smallContext) {
      smallContext.fillStyle = '#FFFFFF';
      smallContext.fillRect(0, 0, smallCanvas.width, smallCanvas.height);
      smallContext.imageSmoothingEnabled = true;
      smallContext.imageSmoothingQuality = 'high';
      smallContext.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
      result = smallCanvas.toDataURL('image/jpeg', 0.7);
    }
  }
  if (!result.startsWith('data:image/')) throw new Error('图片转换失败');
  return result;
}

function removeFormImage() {
  if (!ui.form) return;
  ui.form.image = '';
  ui.form.imagePath = '';
  ui.form.imageChanged = true;
  ui.form.lastOcrText = '';
  ui.form.ocr = { status: 'idle', progress: 0, message: '' };
  ui.ocrRun += 1;
  markFormDirty();
  refreshImageFieldContainer();
}

function paintOcrStatus(stateOverride) {
  if (!ui.form) return;
  if (stateOverride) ui.form.ocr = stateOverride;
  const container = document.getElementById('ocr-status');
  if (container) container.innerHTML = renderOcrStatus();
}

function setOcrProgress(message, progress) {
  const now = performance.now();
  if (now - lastOcrPaintAt < 110 && progress < 100) return;
  lastOcrPaintAt = now;
  if (!ui.form) return;
  ui.form.ocr = {
    status: 'processing',
    message,
    progress: Math.round(clampNumber(progress, 1, 99))
  };
  paintOcrStatus();
}

function ocrMessageForStatus(status) {
  const map = {
    'loading tesseract core': '加载 OCR 引擎核心',
    'initializing tesseract': '初始化 OCR 引擎',
    'loading language traineddata': '加载中英文识别模型',
    'initializing api': '准备识别',
    'recognizing text': '识别文字中'
  };
  return map[status] || '正在识别文字';
}

function reportOcrProgress(status, percent) {
  if (typeof ocrLogger === 'function') {
    ocrLogger({ status, progress: clampNumber(percent, 0, 100) / 100 });
  }
}

function overallOcrProgress(status, progress) {
  const value = clampNumber(progress, 0, 1);
  switch (status) {
    case 'loading tesseract core':
      return 4 + value * 24;
    case 'initializing tesseract':
      return 30 + value * 6;
    case 'loading language traineddata':
      return 38 + value * 24;
    case 'initializing api':
      return 64 + value * 8;
    case 'recognizing text':
      return 74 + value * 22;
    default:
      return 38 + value * 40;
  }
}

function createOcrWorkerWithGuard(Tesseract, langs, options, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let worker = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback(value);
    };
    const timer = window.setTimeout(() => {
      finish(reject, new Error('OCR 初始化超时，请检查网络后重试'));
    }, timeout);
    Tesseract.createWorker(langs, 1, {
      ...options,
      errorHandler: (error) => {
        finish(reject, new Error(String(error || 'OCR 初始化失败')));
      }
    })
      .then((createdWorker) => {
        worker = createdWorker;
        if (settled) {
          try { createdWorker.terminate(); } catch (error) { /* ignore */ }
          return;
        }
        finish(resolve, createdWorker);
      })
      .catch((error) => {
        finish(reject, error);
      });
  });
}

function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve();
  if (ocrScriptPromise) return ocrScriptPromise;
  ocrScriptPromise = new Promise((resolve, reject) => {
    let index = 0;
    const attempt = () => {
      if (index >= OCR_SCRIPT_URLS.length) {
        reject(new Error('OCR 引擎加载失败'));
        return;
      }
      const source = OCR_SCRIPT_URLS[index];
      index += 1;
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      const timer = window.setTimeout(() => {
        script.remove();
        attempt();
      }, 25000);
      script.onload = () => {
        window.clearTimeout(timer);
        if (window.Tesseract) resolve();
        else {
          script.remove();
          attempt();
        }
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        script.remove();
        attempt();
      };
      document.head.appendChild(script);
    };
    attempt();
  });
  ocrScriptPromise = ocrScriptPromise.catch((error) => {
    ocrScriptPromise = null;
    throw error;
  });
  return ocrScriptPromise;
}

function ensureOcrWorker() {
  if (ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise = (async () => {
    await loadTesseractScript();
    const Tesseract = window.Tesseract;
    if (!Tesseract || typeof Tesseract.createWorker !== 'function') {
      throw new Error('OCR 引擎不可用');
    }
    const logger = (message) => {
      if (typeof ocrLogger === 'function') ocrLogger(message);
    };

    // 中英文混合识别在浏览器端需要较大的模型。优先使用约 1.7 MB 的
    // 精简中文模型（Tesseract 的 chi_sim 可识别常见英文与数字），
    // 失败后再尝试完整的中英文模型。
    const configs = [
      {
        label: 'compact-chinese',
        langs: 'chi_sim',
        workerPath: OCR_WORKER_URLS[0],
        corePath: OCR_CORE_URLS[0],
        langPath: OCR_COMPACT_LANG_PATH,
        timeout: 90000
      },
      {
        label: 'full-bilingual',
        langs: 'chi_sim+eng',
        workerPath: OCR_WORKER_URLS[0],
        corePath: OCR_CORE_URLS[0],
        langPath: OCR_FULL_LANG_PATH,
        timeout: 150000
      },
      {
        label: 'full-bilingual-alt',
        langs: 'chi_sim+eng',
        workerPath: OCR_WORKER_URLS[1],
        corePath: OCR_CORE_URLS[1],
        langPath: OCR_FULL_LANG_PATH,
        timeout: 150000
      }
    ];

    let lastError = null;
    for (const config of configs) {
      try {
        reportOcrProgress('loading tesseract core', 8);
        const worker = await createOcrWorkerWithGuard(
          Tesseract,
          config.langs,
          {
            workerPath: config.workerPath,
            corePath: config.corePath,
            langPath: config.langPath,
            logger
          },
          config.timeout
        );
        return worker;
      } catch (error) {
        lastError = error;
        console.warn(`OCR worker failed (${config.label})`, error);
        reportOcrProgress('loading language traineddata', 18);
      }
    }
    throw lastError || new Error('OCR 引擎初始化失败');
  })().catch((error) => {
    ocrWorkerPromise = null;
    throw error;
  });
  return ocrWorkerPromise;
}

function startOcrForCurrentImage() {
  if (!ui.form || !ui.form.image) {
    showToast('请先添加题目图片。', 'warning');
    return;
  }
  if (ui.form.ocr && ui.form.ocr.status === 'processing') return;
  const form = ui.form;
  const runId = ++ui.ocrRun;
  const image = form.image;
  form.ocr = { status: 'processing', message: '正在准备 OCR 引擎…', progress: 1 };
  paintOcrStatus();
  const logger = (message) => {
    if (!ui.form || ui.form !== form || ui.ocrRun !== runId) return;
    const status = message && message.status;
    const label = ocrMessageForStatus(status);
    const progress = overallOcrProgress(status, message && message.progress);
    setOcrProgress(label, Math.max(2, Math.min(progress, 96)));
  };
  ocrTaskChain = ocrTaskChain.catch(() => {}).then(async () => {
    if (!ui.form || ui.form !== form || ui.ocrRun !== runId) return;
    ocrLogger = logger;
    try {
      const worker = await ensureOcrWorker();
      if (!ui.form || ui.form !== form || ui.ocrRun !== runId) return;
      setOcrProgress('识别题目文字中…', 72);
      const result = await worker.recognize(image);
      if (!ui.form || ui.form !== form || ui.ocrRun !== runId) return;
      const rawText = result && result.data && typeof result.data.text === 'string' ? result.data.text : '';
      const text = normalizeOcrOutput(rawText).slice(0, 30000);
      if (!text) {
        form.ocr = {
          status: 'error',
          message: '没有识别到清晰文字。请换一张光线更好、文字更正的图片，或手动输入题干。',
          progress: 0
        };
        paintOcrStatus();
        return;
      }
      applyOcrTextToStem(form, text);
      form.ocr = { status: 'done', message: '', progress: 100 };
      paintOcrStatus();
      showToast('OCR 完成，文字已填入题干。请校对公式和符号。', 'success', 4400);
    } catch (error) {
      console.error('OCR failed', error);
      if (!ui.form || ui.form !== form || ui.ocrRun !== runId) return;
      const message = error && /network|fetch|load|timeout/i.test(String(error.message))
        ? 'OCR 语言包未能加载。请检查网络连接，或直接手动输入题干。'
        : 'OCR 识别失败。可以重试，也可以手动输入题干。';
      form.ocr = { status: 'error', message, progress: 0 };
      paintOcrStatus();
      showToast('OCR 未能完成，已保留图片，你可以手动输入题干。', 'error', 5200);
    } finally {
      if (ui.form === form) ocrLogger = null;
    }
  });
}

function normalizeOcrOutput(rawText) {
  return String(rawText || '')
    .replace(/\f/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0\u3000]+/g, ' ')
    .replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/[ \t]+(?=[，。；：、！？）》」』])/g, '')
    .replace(/([，。；：、！？）》」』])[ \t]+/g, '$1')
    .replace(/([（《「『])[ \t]+/g, '$1')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyOcrTextToStem(form, text) {
  const stem = document.getElementById('question-stem');
  if (!(stem instanceof HTMLTextAreaElement)) return;
  const current = stem.value;
  let next = text;
  if (form.lastOcrText && current.includes(form.lastOcrText)) {
    next = current.replace(form.lastOcrText, text);
  } else if (current.trim()) {
    next = `${current.trimEnd()}\n\n${text}`;
  }
  next = next.slice(0, 30000);
  stem.value = next;
  form.stem = next;
  form.lastOcrText = text;
  form.dirty = true;
  clearFormError();
}


/* ============================================================
   Review flow
   ============================================================ */
function getCurrentReviewQuestion() {
  if (!ui.review || ui.review.phase !== 'active') return null;
  const id = ui.review.ids[ui.review.index];
  return id ? getQuestionById(id) : null;
}

function startReviewWithDue() {
  const ids = getDueQuestions().map((question) => question.id);
  if (!ids.length) {
    showToast('今天没有到期的错题。', 'info', 2800);
    return;
  }
  startReviewWithIds(ids);
}

function startReviewWithIds(ids, options = {}) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => getQuestionById(id)))];
  if (!uniqueIds.length) {
    showToast('没有可复习的错题。', 'warning');
    return;
  }
  ui.review = {
    phase: 'active',
    ids: uniqueIds,
    index: 0,
    revealed: false,
    results: [],
    skipped: 0,
    startedAt: new Date().toISOString(),
    single: Boolean(options.single)
  };
  if (currentRoute === 'review') {
    rerenderCurrentView({ scrollTop: true });
  } else {
    window.location.hash = '#/review';
  }
}

function revealReviewAnswer() {
  if (!ui.review || ui.review.phase !== 'active' || !getCurrentReviewQuestion()) return;
  ui.review.revealed = true;
  rerenderCurrentView({});
}

function calculateReviewOutcome(question, feedback) {
  let mastery = 'mastered';
  let stage = 0;
  let days = 2;
  if (feedback === 'again') {
    mastery = 'unmastered';
    stage = 0;
    days = 1;
  } else if (feedback === 'fuzzy') {
    mastery = 'normal';
    stage = Math.max(0, (question.reviewStage || 0) - 1);
    days = 2;
  } else {
    mastery = 'mastered';
    stage = Math.min((question.reviewStage || 0) + 1, EBBINGHAUS_DAYS.length - 1);
    days = EBBINGHAUS_DAYS[stage];
  }
  return {
    mastery,
    stage,
    days,
    nextReview: addDaysToKey(todayKey(), days)
  };
}

function submitReviewFeedback(feedback) {
  if (!ui.review || ui.review.phase !== 'active' || !ui.review.revealed) return;
  if (!['again', 'fuzzy', 'good'].includes(feedback)) return;
  const question = getCurrentReviewQuestion();
  if (!question) return;
  const outcome = calculateReviewOutcome(question, feedback);
  const nowIso = new Date().toISOString();
  let saved = false;
  saved = commitState((draft) => {
    const target = draft.questions.find((item) => item.id === question.id);
    if (!target) return;
    target.mastery = outcome.mastery;
    target.reviewStage = outcome.stage;
    target.nextReview = outcome.nextReview;
    target.lastReviewedAt = nowIso;
    target.updatedAt = nowIso;
    target.reviewHistory = Array.isArray(target.reviewHistory) ? target.reviewHistory : [];
    target.reviewHistory.unshift({
      at: nowIso,
      feedback,
      interval: outcome.days,
      nextReview: outcome.nextReview
    });
    target.reviewHistory = target.reviewHistory.slice(0, 60);
  });
  if (!saved) return;
  ui.review.results.push({ id: question.id, feedback });
  ui.review.index += 1;
  ui.review.revealed = false;
  if (ui.review.index >= ui.review.ids.length) {
    ui.review.phase = 'done';
  }
  rerenderCurrentView({ scrollTop: true, smooth: true });
  const feedbackText = { again: '还没掌握', fuzzy: '有点模糊', good: '掌握扎实' }[feedback];
  showToast(`${feedbackText} · 下次复习${formatRelativeDate(outcome.nextReview)}`, feedback === 'good' ? 'success' : 'default', 3000);
}

function skipCurrentReview() {
  if (!ui.review || ui.review.phase !== 'active') return;
  ui.review.skipped += 1;
  ui.review.index += 1;
  ui.review.revealed = false;
  if (ui.review.index >= ui.review.ids.length) ui.review.phase = 'done';
  rerenderCurrentView({ scrollTop: true, smooth: true });
  showToast('已跳过，这道题仍会保留在待复习队列。', 'info', 2800);
}

async function exitReviewSession() {
  if (!ui.review || ui.review.phase !== 'active') {
    ui.review = null;
    rerenderCurrentView({});
    return;
  }
  const confirmed = await askConfirm({
    title: '退出本轮复习？',
    message: '本轮已经提交的反馈会被保存；还没完成的题会继续留在待复习队列中。',
    confirmText: '退出',
    cancelText: '继续复习',
    tone: 'danger'
  });
  if (!confirmed) return;
  ui.review = null;
  rerenderCurrentView({ scrollTop: true });
}

/* ============================================================
   Quiz
   ============================================================ */
function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function setQuizTag(tag) {
  if (!tag || (tag !== 'all' && !state.tags.includes(tag))) return;
  ui.quizSetup.tag = tag;
  rerenderCurrentView({});
}

function setQuizCount(value) {
  if (value === 'all') {
    ui.quizSetup.count = 'all';
  } else {
    const count = Number(value);
    if (![5, 10, 20].includes(count)) return;
    ui.quizSetup.count = count;
  }
  rerenderCurrentView({});
}

function startQuiz() {
  const pool = getQuizPool();
  if (!pool.length) {
    showToast('当前范围内没有题目，先录入一些错题吧。', 'warning');
    return;
  }
  const requested = ui.quizSetup.count === 'all' ? pool.length : Number(ui.quizSetup.count) || 10;
  const questions = shuffleArray(pool).slice(0, Math.min(requested, pool.length));
  ui.quizSession = {
    phase: 'playing',
    ids: questions.map((question) => question.id),
    index: 0,
    revealed: false,
    results: [],
    startedAt: new Date().toISOString()
  };
  rerenderCurrentView({ scrollTop: true });
  if (questions.length < requested) {
    showToast(`题库中当前只有 ${pool.length} 道可用题，已全部抽取。`, 'info', 3200);
  }
}

function revealQuizAnswer() {
  if (!ui.quizSession || ui.quizSession.phase !== 'playing') return;
  ui.quizSession.revealed = true;
  rerenderCurrentView({});
}

function judgeQuizAnswer(correct) {
  if (!ui.quizSession || ui.quizSession.phase !== 'playing' || !ui.quizSession.revealed) return;
  const questionId = ui.quizSession.ids[ui.quizSession.index];
  if (!questionId) return;
  ui.quizSession.results.push({ id: questionId, correct: Boolean(correct) });
  ui.quizSession.index += 1;
  ui.quizSession.revealed = false;
  if (ui.quizSession.index >= ui.quizSession.ids.length) {
    ui.quizSession.phase = 'done';
  }
  rerenderCurrentView({ scrollTop: true, smooth: true });
}

async function exitQuiz() {
  if (!ui.quizSession) {
    rerenderCurrentView({});
    return;
  }
  const confirmed = await askConfirm({
    title: '退出本组刷题？',
    message: '当前这组练习的进度与成绩不会保留，但不会影响错题的复习计划。',
    confirmText: '退出练习',
    cancelText: '继续作答',
    tone: 'danger'
  });
  if (!confirmed) return;
  ui.quizSession = null;
  rerenderCurrentView({ scrollTop: true });
}

/* ============================================================
   Library filters
   ============================================================ */
function setLibraryTagFilter(tag) {
  if (!tag || (tag !== 'all' && !state.tags.includes(tag))) return;
  ui.library.tag = tag;
  refreshLibraryView();
}

function setLibraryMasteryFilter(mastery) {
  if (!mastery || (mastery !== 'all' && !MASTERY[mastery])) return;
  ui.library.mastery = mastery;
  refreshLibraryView();
}

function clearLibrarySearch() {
  ui.library.search = '';
  const input = document.getElementById('library-search');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    try { input.focus({ preventScroll: true }); } catch (error) { input.focus(); }
  }
  refreshLibraryView();
}

function clearLibraryFilters() {
  ui.library.search = '';
  ui.library.tag = 'all';
  ui.library.mastery = 'all';
  rerenderCurrentView({});
}

/* ============================================================
   Notifications
   ============================================================ */
function notificationsSupported() {
  return typeof window.Notification !== 'undefined';
}

async function toggleNotifications() {
  if (!notificationsSupported()) {
    showToast('当前浏览器不支持系统通知，页面内提醒仍然可用。', 'warning', 4200);
    return;
  }
  if (state.settings.notifications) {
    const saved = commitState((draft) => {
      draft.settings.notifications = false;
    });
    if (!saved) return;
    rerenderCurrentView({});
    showToast('系统通知提醒已关闭，页面内提醒仍然有效。', 'info', 3200);
    return;
  }
  if (Notification.permission === 'denied') {
    showToast('通知权限已被浏览器拒绝。请在地址栏的站点设置中重新允许通知。', 'warning', 5200);
    return;
  }
  let permission = Notification.permission;
  if (permission !== 'granted') {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      console.warn('请求通知权限失败', error);
      showToast('浏览器没有允许通知权限。页面内提醒仍然可用。', 'warning', 4600);
      return;
    }
  }
  if (permission !== 'granted') {
    showToast('未获得通知权限。你仍然会看到页面内的到期提醒。', 'info', 4400);
    rerenderCurrentView({});
    return;
  }
  const saved = commitState((draft) => {
    draft.settings.notifications = true;
    draft.settings.lastDueSignature = '';
  });
  if (!saved) return;
  rerenderCurrentView({});
  showToast('系统通知已开启：页面打开时，到期错题会自动提醒。', 'success', 4200);
}

function sendTestNotification() {
  if (!notificationsSupported() || Notification.permission !== 'granted') {
    showToast('需要先在浏览器中允许通知权限。', 'warning');
    return;
  }
  try {
    const notification = new Notification('知隙 · 通知测试', {
      body: '通知已生效。复习日打开知隙，我会提醒你该和错题重逢了。',
      tag: 'zhixi-test'
    });
    notification.onclick = () => {
      try { window.focus(); } catch (error) { /* ignore */ }
      notification.close();
    };
    showToast('测试通知已发送。', 'success', 3000);
  } catch (error) {
    console.warn('测试通知失败', error);
    showToast('当前浏览器在本地文件模式下限制了系统通知；页面内提醒仍然有效。', 'warning', 5200);
  }
}

/* ============================================================
   Tag management
   ============================================================ */
function addGlobalTag() {
  const input = document.getElementById('settings-new-tag');
  if (!(input instanceof HTMLInputElement)) return;
  const tag = normalizeTagName(input.value);
  if (!tag) {
    showToast('请输入标签名称。', 'warning');
    input.focus();
    return;
  }
  if (state.tags.includes(tag)) {
    showToast('这个标签已经存在。', 'info', 2600);
    input.value = '';
    input.focus();
    return;
  }
  if (state.tags.length >= 60) {
    showToast('标签数量已达到上限（60 个）。', 'warning');
    return;
  }
  const saved = commitState((draft) => {
    draft.tags = normalizeTags([...draft.tags, tag]);
  });
  if (!saved) return;
  rerenderCurrentView({});
  const nextInput = document.getElementById('settings-new-tag');
  if (nextInput) {
    try { nextInput.focus({ preventScroll: true }); } catch (error) { nextInput.focus(); }
  }
  showToast(`标签「${tag}」已添加。`, 'success', 2600);
}

async function deleteGlobalTag(tag) {
  if (!tag || !state.tags.includes(tag)) return;
  if (DEFAULT_TAGS.includes(tag)) {
    showToast('预设标签不能删除。', 'warning');
    return;
  }
  const usedCount = state.questions.filter((question) => question.tags.includes(tag)).length;
  const confirmed = await askConfirm({
    title: `删除标签「${tag}」？`,
    message: usedCount
      ? `当前有 ${usedCount} 道错题正在使用这个标签。删除后，这些题目会失去该标签，但题目本身不会删除。`
      : '这个标签目前没有关联任何错题。删除后仍可通过录入表单重新创建。',
    confirmText: '删除标签',
    cancelText: '取消',
    tone: 'danger'
  });
  if (!confirmed) return;
  const saved = commitState((draft) => {
    draft.tags = draft.tags.filter((item) => item !== tag);
    draft.questions.forEach((question) => {
      question.tags = question.tags.filter((item) => item !== tag);
    });
  });
  if (!saved) return;
  if (ui.library.tag === tag) ui.library.tag = 'all';
  if (ui.quizSetup.tag === tag) ui.quizSetup.tag = 'all';
  rerenderCurrentView({});
  showToast(`标签「${tag}」已删除。`, 'default', 2800);
}

/* ============================================================
   Backup & restore
   ============================================================ */
async function exportBackup() {
  let exportQuestions = state.questions;
  if (window.ZhixiCloud && typeof window.ZhixiCloud.prepareExportQuestions === 'function') {
    try {
      const prepared = await window.ZhixiCloud.prepareExportQuestions(state.questions);
      if (prepared && Array.isArray(prepared.questions)) {
        exportQuestions = prepared.questions;
        if (prepared.warning) showToast(prepared.warning, 'warning', 6000);
      }
    } catch (error) {
      console.warn('准备含图备份失败', error);
      showToast('云端图片拉取失败，备份仍会导出，但可能缺少部分图片。', 'warning', 6000);
    }
  }
  const payload = {
    app: APP_ID,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    questions: exportQuestions,
    tags: state.tags
  };
  let text = '';
  try {
    text = JSON.stringify(payload, null, 2);
  } catch (error) {
    console.error('导出失败', error);
    showToast('导出失败，请稍后重试。', 'error');
    return;
  }

  const nativeFilename = `zhixi-backup-${todayKey()}.json`;
  if (typeof window.ZhixiSaveBackup === 'function') {
    try {
      const nativeResult = await window.ZhixiSaveBackup({
        filename: nativeFilename,
        text,
        mime: 'application/json'
      });
      if (nativeResult && nativeResult.saved) {
        showToast(`已保存 ${exportQuestions.length} 道错题的 JSON 备份。`, 'success', 4200);
        return;
      }
      if (nativeResult && nativeResult.cancelled) {
        showToast('已取消导出。', 'info', 2600);
        return;
      }
    } catch (error) {
      console.warn('原生保存备份失败，回退到浏览器下载', error);
      showToast('原生保存失败，正在尝试浏览器下载…', 'warning', 4200);
    }
  }

  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const filename = `zhixi-backup-${todayKey()}.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  const size = text.length * 2 / 1024 / 1024;
  showToast(`已导出 ${exportQuestions.length} 道错题（约 ${size >= 1 ? `${size.toFixed(1)} MB` : `${Math.max(1, Math.round(size * 1024))} KB`}）。`, 'success', 4800);
}

function triggerImportPicker() {
  const input = document.getElementById('import-file');
  if (!(input instanceof HTMLInputElement)) return;
  input.value = '';
  input.click();
}

async function handleImportFile(file) {
  if (!(file instanceof File)) return;
  if (file.size > 30 * 1024 * 1024) {
    showToast('备份文件超过 30 MB，请确认文件是否完整。', 'warning', 5000);
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const rawQuestions = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.questions)
        ? payload.questions
        : payload && payload.data && Array.isArray(payload.data.questions)
          ? payload.data.questions
          : null;
    if (!rawQuestions) throw new Error('文件中没有找到错题列表');
    if (rawQuestions.length > 5000) throw new Error('备份中的错题数量超过 5000 道，无法导入');
    const usedIds = new Set();
    const questions = rawQuestions
      .map((question) => normalizeQuestion(question, { usedIds }))
      .filter(Boolean)
      .map((question) => ({ ...question, imagePath: '' }));
    if (!questions.length) throw new Error('没有解析到有效的错题');
    const rawTags = Array.isArray(payload && payload.tags)
      ? payload.tags
      : payload && payload.data && Array.isArray(payload.data.tags)
        ? payload.data.tags
        : [];
    const tags = normalizeTags([
      ...DEFAULT_TAGS,
      ...rawTags,
      ...questions.flatMap((question) => question.tags)
    ]);
    const exportedAt = payload && typeof payload.exportedAt === 'string' && !Number.isNaN(new Date(payload.exportedAt).getTime())
      ? payload.exportedAt
      : '';
    ui.pendingImport = {
      fileName: file.name,
      exportedAt,
      questions,
      tags,
      invalidCount: Math.max(0, rawQuestions.length - questions.length)
    };
    openImportPreviewModal();
  } catch (error) {
    console.error('解析备份失败', error);
    showToast(`无法导入：${error.message || 'JSON 格式不正确'}`, 'error', 5600);
  }
}

function openImportPreviewModal() {
  if (!ui.pendingImport) return;
  openMainModal({
    kind: 'import',
    eyebrow: 'Restore data',
    title: '导入备份',
    subtitle: '检查内容后，选择合并或覆盖',
    body: renderImportPreviewBody(),
    bodyClass: 'px-5 py-5 sm:px-7 sm:py-6',
    size: 'max-w-xl',
    onRequestClose: () => {
      ui.pendingImport = null;
      closeMainModal();
    },
    footer: `
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" data-action="request-close-modal" class="btn btn-ghost min-h-[42px]">取消</button>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" data-action="import-merge" class="btn btn-secondary min-h-[42px]">合并导入</button>
          <button type="button" data-action="import-overwrite" class="btn btn-danger-solid min-h-[42px]">覆盖导入</button>
        </div>
      </div>
    `
  });
}

async function completeImport(mode) {
  const pending = ui.pendingImport;
  if (!pending) return;
  if (mode === 'overwrite') {
    const confirmed = await askConfirm({
      title: '覆盖当前全部错题？',
      message: `将用备份中的 ${pending.questions.length} 道错题替换现有的 ${state.questions.length} 道错题。当前数据不会自动备份，建议先导出。`,
      confirmText: '覆盖导入',
      cancelText: '取消',
      tone: 'danger'
    });
    if (!confirmed) return;
    const saved = commitState((draft) => {
      draft.questions = pending.questions;
      draft.tags = normalizeTags([...DEFAULT_TAGS, ...pending.tags]);
      draft.settings.lastDueSignature = '';
      draft.settings.lastInAppReminder = '';
    });
    if (!saved) return;
    ui.pendingImport = null;
    ui.review = null;
    ui.quizSession = null;
    ui.library = { search: '', tag: 'all', mastery: 'all', sort: 'newest' };
    if (ui.modal) closeMainModal({ restoreFocus: false });
    rerenderCurrentView({ scrollTop: true });
    showToast(`已恢复 ${pending.questions.length} 道错题。`, 'success', 4200);
    return;
  }

  let added = 0;
  let skippedSameId = 0;
  let addedTags = 0;
  const saved = commitState((draft) => {
    const currentIds = new Set(draft.questions.map((question) => question.id));
    const currentTags = new Set(draft.tags);
    pending.questions.forEach((question) => {
      if (!currentIds.has(question.id)) {
        draft.questions.push(question);
        currentIds.add(question.id);
        added += 1;
      } else {
        skippedSameId += 1;
      }
    });
    pending.tags.forEach((tag) => {
      if (!currentTags.has(tag)) addedTags += 1;
    });
    draft.tags = normalizeTags([...draft.tags, ...pending.tags]);
  });
  if (!saved) return;
  ui.pendingImport = null;
  if (ui.modal) closeMainModal({ restoreFocus: false });
  rerenderCurrentView({});
  const skipMessage = skippedSameId ? `，跳过 ${skippedSameId} 道重复题` : '';
  showToast(`合并完成：新增 ${added} 道错题${skipMessage}${addedTags ? `，新增 ${addedTags} 个标签` : ''}。`, 'success', 5200);
}

async function clearAllData() {
  const confirmed = await askConfirm({
    title: '清空全部错题数据？',
    message: `将删除 ${state.questions.length} 道错题、全部复习记录与自定义标签。此操作无法撤销，建议先导出 JSON 备份。`,
    confirmText: '确认清空',
    cancelText: '取消',
    tone: 'danger'
  });
  if (!confirmed) return;
  const saved = commitState((draft) => {
    draft.questions = [];
    draft.tags = [...DEFAULT_TAGS];
    draft.settings.lastDueSignature = '';
    draft.settings.lastInAppReminder = '';
  });
  if (!saved) return;
  ui.review = null;
  ui.quizSession = null;
  ui.library = { search: '', tag: 'all', mastery: 'all', sort: 'newest' };
  ui.quizSetup = { tag: 'all', count: 10 };
  ui.dueBannerDismissed = '';
  rerenderCurrentView({ scrollTop: true });
  showToast('全部错题数据已清空，可以重新开始。', 'default', 3200);
}

/* ============================================================
   Demo content
   ============================================================ */
function buildDemoQuestions() {
  const now = new Date();
  const isoAt = (daysAgo, hours = 10) => {
    const date = new Date(now.getTime() - daysAgo * 86400000);
    date.setHours(hours, 15, 0, 0);
    return date.toISOString();
  };
  const rawQuestions = [
    {
      id: 'demo_micro',
      stem: String.raw`已知某消费者的效用函数为 $U(x,y)=x^{1/2}y^{1/2}$，收入为 $m=240$，商品价格分别为 $p_x=2$、$p_y=4$。求效用最大化时的消费组合与最大效用。`,
      answer: String.raw`构造拉格朗日函数：
$$\mathcal{L}=x^{1/2}y^{1/2}+\lambda(240-2x-4y)$$
一阶条件为：
$$\frac{1}{2}x^{-1/2}y^{1/2}=2\lambda,\qquad \frac{1}{2}x^{1/2}y^{-1/2}=4\lambda$$
两式相除得 $y/x=1/2$，即 $x=2y$。代入预算约束：
$$2(2y)+4y=240\Rightarrow y=30,\ x=60$$
最大效用为 $U(60,30)=60^{1/2}30^{1/2}=30\sqrt{2}$。`,
      analysis: '把一阶条件相除时漏掉了价格比，导致算成 $x=y$。本质上是拉格朗日乘子法的计算熟练度不够，不是思路不会。',
      tags: ['微观经济学', '数三'],
      mastery: 'normal',
      image: '',
      createdAt: isoAt(6),
      updatedAt: isoAt(6),
      nextReview: addDaysToKey(todayKey(), -1),
      reviewStage: 1,
      reviewHistory: [
        { at: isoAt(5, 20), feedback: 'fuzzy', interval: 2, nextReview: addDaysToKey(todayKey(), -1) }
      ],
      lastReviewedAt: isoAt(5, 20)
    },
    {
      id: 'demo_macro',
      stem: String.raw`在 Solow 增长模型中，生产函数为 $Y=K^{\alpha}(AL)^{1-\alpha}$，储蓄率为 $s$，人口增长率为 $n$，技术进步率为 $g$，资本折旧率为 $\delta$。求稳态有效劳动资本 $\tilde{k}^*$，并说明储蓄率上升的长期水平效应。`,
      answer: String.raw`有效劳动资本运动方程为：
$$\dot{\tilde{k}}=s\tilde{k}^{\alpha}-(n+g+\delta)\tilde{k}$$
稳态时 $\dot{\tilde{k}}=0$，因此：
$$\tilde{k}^*=\left(\frac{s}{n+g+\delta}\right)^{\frac{1}{1-\alpha}}$$
储蓄率上升会提高 $\tilde{k}^*$，从而提高稳态人均产出水平；但不会改变长期人均产出增长率，长期增长率仍由技术进步率 $g$ 决定。`,
      analysis: '把“水平效应”和“增长效应”混为一谈。储蓄率改变的是稳态水平，不是平衡增长路径上的增长率。',
      tags: ['宏观经济学', '数三'],
      mastery: 'unmastered',
      image: '',
      createdAt: isoAt(4),
      updatedAt: isoAt(4),
      nextReview: todayKey(),
      reviewStage: 0,
      reviewHistory: [],
      lastReviewedAt: ''
    },
    {
      id: 'demo_econometrics',
      stem: String.raw`计量经济学中，简述 Gauss–Markov 定理成立所需的经典假设，并说明若出现异方差，OLS 估计量会发生什么变化。`,
      answer: String.raw`Gauss–Markov 定理的经典假设包括：线性参数模型、随机抽样、无完全共线性、误差条件均值为零，以及同方差。在满足这些假设时，OLS 是最佳线性无偏估计量（BLUE）。

若出现异方差：
1. OLS 仍然是无偏的；
2. OLS 不再具有最小方差，通常不再是 BLUE；
3. 常规的 OLS 标准误估计不再可靠，需要改用稳健标准误或 GLS/WLS。`,
      analysis: '只记住了“异方差时 OLS 无偏”，没有继续说明有效性会失效。答题要写到估计性质与推断后果两个层面。',
      tags: ['计量经济学'],
      mastery: 'mastered',
      image: '',
      createdAt: isoAt(10),
      updatedAt: isoAt(10),
      nextReview: addDaysToKey(todayKey(), 1),
      reviewStage: 3,
      reviewHistory: [
        { at: isoAt(2, 19), feedback: 'good', interval: 4, nextReview: addDaysToKey(todayKey(), 1) },
        { at: isoAt(8, 9), feedback: 'good', interval: 2, nextReview: addDaysToKey(todayKey(), -3) }
      ],
      lastReviewedAt: isoAt(2, 19)
    },
    {
      id: 'demo_political',
      stem: String.raw`某企业雇佣工人 100 人，每人日工资为 200 元，每天生产的新价值为 30000 元。请计算该企业的剩余价值率。`,
      answer: String.raw`可变资本为：
$$V=100\times 200=20000\text{ 元}$$
剩余价值为：
$$M=30000-20000=10000\text{ 元}$$
剩余价值率为：
$$m'=\frac{M}{V}=\frac{10000}{20000}=50\%$$`,
      analysis: '把“新价值”直接当成了剩余价值。需要先扣除可变资本，再计算剩余价值率。',
      tags: ['政治经济学'],
      mastery: 'unmastered',
      image: '',
      createdAt: isoAt(2),
      updatedAt: isoAt(2),
      nextReview: todayKey(),
      reviewStage: 0,
      reviewHistory: [],
      lastReviewedAt: ''
    },
    {
      id: 'demo_english',
      stem: String.raw`Translate the following sentence and analyse its structure:

"The extent to which monetary policy can stabilize output depends not only on the size of the shock but also on the credibility of the central bank's commitment to its inflation target."`,
      answer: String.raw`参考译文：货币政策能够在多大程度上稳定产出，不仅取决于冲击的规模，也取决于中央银行对通胀目标的承诺是否可信。

结构分析：主干为 “The extent ... depends not only on ... but also on ...”。其中 “to which monetary policy can stabilize output” 是修饰 extent 的定语从句；“not only ... but also ...” 连接两个并列的介词宾语。`,
      analysis: '长难句里看到 not only 就急着找 but also，反而丢了主句谓语 depends。先找主干，再看修饰成分和并列结构。',
      tags: ['英语'],
      mastery: 'normal',
      image: '',
      createdAt: isoAt(1),
      updatedAt: isoAt(1),
      nextReview: addDaysToKey(todayKey(), 2),
      reviewStage: 1,
      reviewHistory: [],
      lastReviewedAt: ''
    }
  ];
  const usedIds = new Set(state.questions.map((question) => question.id));
  return rawQuestions
    .map((question) => normalizeQuestion(question, { usedIds }))
    .filter(Boolean);
}

function loadDemoData() {
  if (state.questions.length > 0) {
    showToast('当前错题本已经有内容，示例数据只用于空错题本。', 'info', 3200);
    return;
  }
  const demoQuestions = buildDemoQuestions();
  if (!demoQuestions.length) return;
  const saved = commitState((draft) => {
    draft.questions = demoQuestions;
    draft.tags = normalizeTags([...DEFAULT_TAGS, ...demoQuestions.flatMap((question) => question.tags)]);
  });
  if (!saved) return;
  rerenderCurrentView({});
  showToast('示例错题已载入，可以自由编辑、删除或开始复习。', 'success', 4600);
}

/* ============================================================
   Boot & cloud integration surface
   ============================================================ */
function readStateFromStorage(storageKey) {
  if (!storageAvailable) return defaultState();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('读取本地缓存失败', error);
    return defaultState();
  }
}

function bootApp(options = {}) {
  if (APP_BOOTED) return false;
  if (options.storageKey) STORAGE_KEY = options.storageKey;
  if (Array.isArray(options.notices)) bootNotices.push(...options.notices);
  if (!storageAvailable) {
    bootNotices.push({
      tone: 'warning',
      text: isCloudMode()
        ? '本地缓存不可用，但云端同步仍然可用。请保持网络连接。'
        : '本地缓存不可用，刷新或关闭页面可能丢失数据；请检查浏览器隐私设置。'
    });
  }
  const initial = options.initialState && typeof options.initialState === 'object'
    ? options.initialState
    : readStateFromStorage(STORAGE_KEY);
  state = normalizeState(initial);
  commitListener = typeof options.onCommit === 'function' ? options.onCommit : null;
  APP_BOOTED = true;
  try {
    if (storageAvailable) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('初始化本地缓存失败', error);
  }
  init();
  return true;
}

function getAppState() {
  return JSON.parse(JSON.stringify(state));
}

function applyCloudState(nextState, options = {}) {
  if (!APP_BOOTED) return false;
  state = normalizeState(nextState);
  try {
    if (storageAvailable) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('写入云端状态到本地缓存失败', error);
  }
  if (options.render !== false) {
    rerenderCurrentView({});
    updateReminderState({ initial: false });
  }
  return true;
}

function patchQuestionLocal(id, patch, options = {}) {
  const question = state.questions.find((item) => item.id === id);
  if (!question || !patch || typeof patch !== 'object') return false;
  Object.assign(question, patch);
  try {
    if (storageAvailable) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('更新本地题目缓存失败', error);
  }
  if (options.render) rerenderCurrentView({});
  return true;
}

function mergeLegacyState(rawLegacyState) {
  if (!rawLegacyState) return { ok: false, imported: 0, total: 0 };
  const legacy = normalizeState(rawLegacyState);
  let imported = 0;
  const success = commitState((draft) => {
    const map = new Map(draft.questions.map((question) => [question.id, question]));
    legacy.questions.forEach((question) => {
      const existing = map.get(question.id);
      if (!existing || new Date(question.updatedAt) > new Date(existing.updatedAt)) {
        if (!existing) imported += 1;
        map.set(question.id, { ...question, imagePath: '' });
      }
    });
    draft.questions = [...map.values()];
    draft.tags = normalizeTags([...draft.tags, ...legacy.tags]);
  });
  if (!success) return { ok: false, imported: 0, total: legacy.questions.length };
  rerenderCurrentView({});
  return { ok: true, imported, total: legacy.questions.length };
}

function getScopedStorageKey(userId) {
  return `${BASE_STORAGE_KEY}:${userId || 'local'}`;
}

function getLegacyStorageKey() {
  return BASE_STORAGE_KEY;
}

window.ZhixiApp = {
  boot: bootApp,
  isBooted: () => APP_BOOTED,
  getState: getAppState,
  getLocalRevision: () => localRevision,
  getStorageKey: () => STORAGE_KEY,
  getScopedStorageKey,
  getLegacyStorageKey,
  readStateFromStorage,
  applyCloudState,
  patchQuestionLocal,
  mergeLegacyState,
  showToast,
  confirm: askConfirm,
  navigate,
  normalizeState,
  getDefaultState: defaultState,
  getQuestionById,
  getDueQuestions,
  getReviewsToday,
  getReviewStreak,
  refreshUI: () => {
    if (!APP_BOOTED) return;
    renderShell();
    rerenderCurrentView({});
    updateReminderState({ initial: false });
  },
  getCurrentRoute: () => currentRoute
};

})();
