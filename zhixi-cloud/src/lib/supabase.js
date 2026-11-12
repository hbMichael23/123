import { createClient } from '@supabase/supabase-js';

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const rawAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const IMAGE_BUCKET = 'question-images';
export const SUPABASE_URL = rawUrl;
export const SUPABASE_ANON_KEY = rawAnonKey;

function looksLikeServiceRoleKey(key) {
  if (!key) return false;
  // Supabase 新版 secret key 有固定前缀。
  if (key.startsWith('sb_secret_')) return true;
  // 旧版 service_role 是 JWT；只解析 payload，不验证签名（这里只做误配防护）。
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export const configError = (() => {
  if (!rawUrl || !rawAnonKey) {
    return '缺少 Supabase 环境变量。请复制 .env.example 为 .env，并填写 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。';
  }
  if (rawUrl.includes('YOUR_PROJECT') || rawAnonKey.includes('YOUR_SUPABASE')) {
    return 'Supabase 环境变量仍是示例占位值，请填写真实的 Project URL 与 anon key。';
  }
  if (looksLikeServiceRoleKey(rawAnonKey)) {
    return '检测到 service_role / secret key！浏览器端只能使用 anon public key（或 publishable key）。请立即在 Supabase 轮换该密钥，并重新构建。';
  }
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'VITE_SUPABASE_URL 必须是合法的 http(s) 地址。';
    }
  } catch {
    return 'VITE_SUPABASE_URL 不是合法的 URL。';
  }
  return '';
})();

export const isSupabaseConfigured = !configError;

export const supabase = isSupabaseConfigured
  ? createClient(rawUrl, rawAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 5
        }
      },
      global: {
        headers: {
          'x-application-name': 'zhixi-cloud'
        }
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error(configError || 'Supabase 尚未配置');
  return supabase;
}
