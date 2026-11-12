#!/usr/bin/env node
/**
 * 在 `npx cap add android` 生成 Android 工程后，补齐：
 *   1. INTERNET 权限（若缺失）
 *   2. MainActivity 的 singleTask 启动模式（deep link 复用当前任务）
 *   3. zhixi://auth/callback 的 intent-filter
 *
 * 用法：pnpm android:patch
 * 也可重复执行，脚本是幂等的。
 */
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.error('[zhixi] 未找到 android/app/src/main/AndroidManifest.xml');
  console.error('[zhixi] 请先执行：pnpm cap:add:android');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');
let changed = false;

if (!xml.includes('android.permission.INTERNET')) {
  xml = xml.replace(
    /<uses-permission\s+android:name="android\.permission\.[^"]+"\s*\/>/,
    (match) => `${match}\n    <uses-permission android:name="android.permission.INTERNET" />`
  );
  if (!xml.includes('android.permission.INTERNET')) {
    xml = xml.replace(/<application\b/, '    <uses-permission android:name="android.permission.INTERNET" />\n\n    <application');
  }
  changed = true;
}

const activityRegex = /(<activity\b[^>]*android:name="\.MainActivity"[^>]*>)([\s\S]*?)(<\/activity>)/;
const activityMatch = activityRegex.exec(xml);
if (!activityMatch) {
  console.error('[zhixi] 未找到 .MainActivity，无法自动补 deep link。请按 docs/CAPACITOR.md 手动添加。');
  process.exit(2);
}

let openingTag = activityMatch[1];
if (!/android:launchMode=/.test(openingTag)) {
  openingTag = openingTag.replace(/>$/, ' android:launchMode="singleTask">');
}

let body = activityMatch[2];
if (!body.includes('android:scheme="zhixi"')) {
  const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="zhixi" android:host="auth" android:pathPrefix="/callback" />
            </intent-filter>
`;
  body = `${body.trimEnd()}\n${intentFilter}        `;
}

xml = xml.replace(activityMatch[0], `${openingTag}${body}${activityMatch[3]}`);
if (!changed && !xml.includes('android:launchMode="singleTask"')) changed = true;
fs.writeFileSync(manifestPath, xml, 'utf8');
console.log('[zhixi] AndroidManifest.xml 已配置 zhixi:// deep link 与 singleTask。');
console.log('[zhixi] 下一步：pnpm cap:sync && 在 Android Studio 中构建签名 APK/AAB。');
