import { defineConfig, loadEnv } from 'vite';

function looksLikeServiceRoleKey(key) {
  if (!key) return false;
  if (String(key).startsWith('sb_secret_')) return true;
  const parts = String(key).split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const anonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (looksLikeServiceRoleKey(anonKey)) {
    throw new Error(
      '[知隙] 检测到 VITE_SUPABASE_ANON_KEY 是 service_role / secret key。'
      + '浏览器构建绝不能包含该密钥，请立即在 Supabase 轮换并改用 anon public key。'
    );
  }

  return {
    // 相对路径便于静态托管、Tauri 和 Capacitor 同时复用同一份 dist。
    base: './',
    server: {
      port: 5173,
      strictPort: true
    },
    preview: {
      port: 4173,
      strictPort: true
    },
    build: {
      outDir: 'dist',
      target: 'es2020',
      cssCodeSplit: false,
      sourcemap: false
    }
  };
});
