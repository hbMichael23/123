import { supabase, requireSupabase, IMAGE_BUCKET } from '../lib/supabase.js';

// ============================================================
// 云端同步
//
// 设计取舍：
// - 以 question.updatedAt 做“每条错题 Last-Write-Wins”；
// - 删除用 Supabase 表的 deleted_at 软删除，避免多设备同步时复活；
// - review_history 采用并集合并，尽量不丢另一台设备刚产生的复习记录；
// - 本地图片上传后替换为 Storage 签名 URL，避免 localStorage 被图片撑爆；
//   签名 URL 24 小时有效，每次在线同步会刷新；
// - 所有写入都受 RLS 约束，user_id 永远取自当前 auth 用户。
// ============================================================

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
const SYNC_TIMEOUT_MS = 12000;
const OBJECT_DELETE_BATCH = 80;
const DEVICE_IMAGE_CONCURRENCY = 4;

function createEmptyMeta() {
  return {
    pendingDeletes: {},
    pendingObjectDeletes: [],
    settingsUpdatedAt: '',
    lastSyncAt: '',
    dirty: false
  };
}

let config = { user: null, app: null };
let meta = createEmptyMeta();
let status = {
  phase: 'idle',
  message: '等待登录',
  error: ''
};
let statusListeners = new Set();
let syncPromise = null;
let rerunRequested = false;
let attachInProgress = false;
let attached = false;
let debounceTimer = null;
let retryTimer = null;
let pollTimer = null;
let channel = null;
let suppressRealtimeUntil = 0;
let onlineHandler = null;
let offlineHandler = null;
let visibilityHandler = null;

function nowIso() {
  return new Date().toISOString();
}

function metaStorageKey(userId) {
  return `zhixi_cloud_meta_v1:${userId}`;
}

function loadMeta(userId) {
  const empty = createEmptyMeta();
  try {
    const raw = localStorage.getItem(metaStorageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      pendingDeletes: parsed.pendingDeletes && typeof parsed.pendingDeletes === 'object'
        ? parsed.pendingDeletes
        : {},
      pendingObjectDeletes: Array.isArray(parsed.pendingObjectDeletes)
        ? [...new Set(parsed.pendingObjectDeletes.filter((path) => typeof path === 'string'))]
        : [],
      settingsUpdatedAt: typeof parsed.settingsUpdatedAt === 'string' ? parsed.settingsUpdatedAt : '',
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : '',
      dirty: Boolean(parsed.dirty)
    };
  } catch (error) {
    console.warn('读取云端同步元数据失败', error);
    return empty;
  }
}

function saveMeta() {
  if (!config.user) return;
  try {
    localStorage.setItem(metaStorageKey(config.user.id), JSON.stringify(meta));
  } catch (error) {
    console.warn('保存云端同步元数据失败', error);
  }
}

function getStatus() {
  return {
    ...status,
    lastSyncAt: meta.lastSyncAt || '',
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false
  };
}

function emitStatus() {
  const snapshot = getStatus();
  statusListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('同步状态监听器失败', error);
    }
  });
}

function setStatus(phase, message = '', error = '') {
  status = { phase, message, error };
  emitStatus();
}

function onStatus(listener) {
  statusListeners.add(listener);
  try { listener(getStatus()); } catch { /* ignore */ }
  return () => statusListeners.delete(listener);
}

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function timeOf(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeForCloud(state) {
  return config.app ? config.app.normalizeState(state) : state;
}

function rowToQuestion(row) {
  return {
    id: row.id,
    stem: row.stem,
    answer: row.answer || '',
    analysis: row.analysis || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    mastery: row.mastery,
    image: '',
    imagePath: row.image_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextReview: row.next_review,
    reviewStage: row.review_stage,
    reviewHistory: Array.isArray(row.review_history) ? row.review_history : [],
    lastReviewedAt: row.last_reviewed_at || ''
  };
}

function questionToRow(question, userId) {
  return {
    user_id: userId,
    id: question.id,
    stem: String(question.stem || '').slice(0, 30000),
    answer: String(question.answer || '').slice(0, 30000),
    analysis: String(question.analysis || '').slice(0, 30000),
    image_path: question.imagePath || null,
    tags: Array.isArray(question.tags) ? question.tags.slice(0, 12) : [],
    mastery: question.mastery,
    next_review: question.nextReview,
    review_stage: Math.max(0, Math.min(7, Number(question.reviewStage) || 0)),
    review_history: Array.isArray(question.reviewHistory) ? question.reviewHistory.slice(0, 60) : [],
    last_reviewed_at: question.lastReviewedAt || null,
    created_at: question.createdAt,
    updated_at: question.updatedAt,
    deleted_at: null
  };
}

function mergeReviewHistories(a, b) {
  const list = [];
  const seen = new Set();
  [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const key = `${entry.at || ''}|${entry.feedback || ''}|${entry.nextReview || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(entry);
  });
  return list
    .sort((left, right) => timeOf(right.at) - timeOf(left.at))
    .slice(0, 60);
}

function mergeQuestionObjects(localQuestion, remoteQuestion) {
  const localNewer = timeOf(localQuestion.updatedAt) >= timeOf(remoteQuestion.updatedAt);
  const winner = localNewer ? localQuestion : remoteQuestion;
  return {
    ...winner,
    reviewHistory: mergeReviewHistories(localQuestion.reviewHistory, remoteQuestion.reviewHistory)
  };
}

function mergeStates(localRaw, remote) {
  const local = normalizeForCloud(localRaw);
  const resultMap = new Map(local.questions.map((question) => [question.id, question]));
  const remoteRows = Array.isArray(remote.questions) ? remote.questions : [];

  remoteRows.forEach((row) => {
    if (!row || !row.id) return;

    if (row.deleted_at) {
      const localQuestion = resultMap.get(row.id);
      if (localQuestion) {
        // 本地编辑时间严格晚于云端删除时，允许本地把题目重新推上去；
        // 否则云端墓碑生效，防止已删除题目被重新拉回。
        if (timeOf(localQuestion.updatedAt) > timeOf(row.deleted_at)) return;
        resultMap.delete(row.id);
      }
      return;
    }

    if (meta.pendingDeletes[row.id]) {
      resultMap.delete(row.id);
      return;
    }

    const remoteQuestion = rowToQuestion(row);
    const localQuestion = resultMap.get(row.id);
    if (!localQuestion) {
      resultMap.set(row.id, remoteQuestion);
      return;
    }
    resultMap.set(row.id, mergeQuestionObjects(localQuestion, remoteQuestion));
  });

  let tags = local.tags;
  let notifications = Boolean(local.settings?.notifications);
  let remoteSettings = remote.settings || null;
  if (remoteSettings) {
    const remoteAt = timeOf(remoteSettings.updated_at);
    const localAt = timeOf(meta.settingsUpdatedAt);
    if (remoteAt > localAt) {
      if (Array.isArray(remoteSettings.tags)) tags = remoteSettings.tags;
      notifications = Boolean(remoteSettings.notifications);
      meta.settingsUpdatedAt = remoteSettings.updated_at || nowIso();
    }
  }

  const merged = normalizeForCloud({
    ...local,
    questions: [...resultMap.values()],
    tags,
    settings: {
      ...local.settings,
      notifications
    }
  });
  return merged;
}

async function fetchRemoteState() {
  const client = requireSupabase();
  const userId = config.user.id;
  // PostgREST 默认最多返回 1000 行；必须分页，否则错题超过 1000 后会静默丢失。
  const pageSize = 500;
  const maxQuestions = 10000;
  const questions = [];

  const settingsResponse = await withTimeout(
    client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    SYNC_TIMEOUT_MS,
    '读取用户设置超时'
  );
  if (settingsResponse.error) throw settingsResponse.error;

  let from = 0;
  while (from < maxQuestions) {
    const to = from + pageSize - 1;
    const response = await withTimeout(
      client.from('questions')
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(from, to),
      SYNC_TIMEOUT_MS,
      '读取云端错题超时'
    );
    if (response.error) throw response.error;
    const batch = Array.isArray(response.data) ? response.data : [];
    if (!batch.length) break;
    questions.push(...batch);
    // 不要因为 batch.length < pageSize 就停止：Supabase 项目可以把
    // PostgREST 的 max rows 调到低于 pageSize。按实际返回条数推进更稳。
    from += batch.length;
  }

  return {
    questions,
    settings: settingsResponse.data || null
  };
}

function validStoragePath(path) {
  return typeof path === 'string'
    && path.startsWith(`${config.user?.id || ''}/`)
    && !path.includes('..');
}

async function signedUrlMapForPaths(paths) {
  const client = requireSupabase();
  const unique = [...new Set(paths.filter(validStoragePath))];
  const result = new Map();
  for (let index = 0; index < unique.length; index += 40) {
    const chunk = unique.slice(index, index + 40);
    const { data, error } = await client.storage
      .from(IMAGE_BUCKET)
      .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.warn('创建图片签名 URL 失败', error.message);
      continue;
    }
    (data || []).forEach((item) => {
      if (item?.path && item?.signedUrl) result.set(item.path, item.signedUrl);
    });
  }
  return result;
}

async function hydrateSignedUrls(state) {
  const questions = state.questions || [];
  const paths = questions
    .filter((question) => question.imagePath && !String(question.image || '').startsWith('data:image/'))
    .map((question) => question.imagePath);
  if (!paths.length) return state;
  const signed = await signedUrlMapForPaths(paths);
  if (!signed.size) return state;
  return {
    ...state,
    questions: questions.map((question) => {
      if (!question.imagePath) return question;
      if (String(question.image || '').startsWith('data:image/')) return question;
      const url = signed.get(question.imagePath);
      return url ? { ...question, image: url } : question;
    })
  };
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('图片格式不支持');
  const mime = match[1].toLowerCase();
  const binary = atob(match[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

function extensionForMime(mime) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

async function uploadQuestionImage(userId, question) {
  const client = requireSupabase();
  const { blob, mime } = dataUrlToBlob(question.image);
  const random = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 12);
  const path = `${userId}/${question.id}/${Date.now()}-${random}.${extensionForMime(mime)}`;
  const { error } = await client.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false
  });
  if (error) throw error;
  let signedUrl = '';
  try {
    const signed = await client.storage.from(IMAGE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (!signed.error) signedUrl = signed.data?.signedUrl || '';
  } catch {
    // 签名失败不影响上传；后续 bootstrap / 同步会重新签名。
  }
  return { path, signedUrl };
}

function queueObjectDelete(path) {
  if (!validStoragePath(path)) return;
  if (!meta.pendingObjectDeletes.includes(path)) meta.pendingObjectDeletes.push(path);
}

async function flushObjectDeletes() {
  if (!meta.pendingObjectDeletes.length) return;
  const client = requireSupabase();
  const paths = meta.pendingObjectDeletes.filter(validStoragePath);
  const failed = new Set();
  for (let index = 0; index < paths.length; index += OBJECT_DELETE_BATCH) {
    const chunk = paths.slice(index, index + OBJECT_DELETE_BATCH);
    const { error } = await client.storage.from(IMAGE_BUCKET).remove(chunk);
    if (error) {
      console.warn('删除旧图片失败', error.message);
      chunk.forEach((path) => failed.add(path));
    }
  }
  meta.pendingObjectDeletes = [...failed];
  saveMeta();
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

function markOwnWrites() {
  suppressRealtimeUntil = Date.now() + 3000;
}

async function upsertQuestions(rows) {
  if (!rows.length) return;
  const client = requireSupabase();
  markOwnWrites();
  const { error } = await client.from('questions').upsert(rows, {
    onConflict: 'user_id,id'
  });
  if (error) throw error;
}

async function pushSettings(settings) {
  const client = requireSupabase();
  markOwnWrites();
  const { error } = await client.from('user_settings').upsert(settings, {
    onConflict: 'user_id'
  });
  if (error) throw error;
}

async function softDeleteQuestions(ids, deletedAt) {
  if (!ids.length) return;
  const client = requireSupabase();
  markOwnWrites();
  const { error } = await client.from('questions')
    .update({
      deleted_at: deletedAt,
      image_path: null,
      updated_at: deletedAt
    })
    .eq('user_id', config.user.id)
    .in('id', ids);
  if (error) throw error;
}

/** 首次进入 App 时合成本地缓存与云端数据，不做阻塞式上传。 */
async function bootstrap({ user, app, localState }) {
  config = { user, app };
  attached = false;
  meta = loadMeta(user.id);

  let hadLocalCache = false;
  try {
    hadLocalCache = Boolean(localStorage.getItem(app.getScopedStorageKey(user.id)));
  } catch {
    hadLocalCache = false;
  }
  if (!meta.settingsUpdatedAt && hadLocalCache) {
    meta.settingsUpdatedAt = localState?.updatedAt || '';
  }
  if (!hadLocalCache) {
    meta.settingsUpdatedAt = '';
  }

  setStatus('syncing', '正在连接云端…');
  let mergedState = normalizeForCloud(localState);
  const notices = [];
  if (navigator.onLine === false) {
    setStatus('offline', '当前处于离线状态');
    notices.push({
      tone: 'warning',
      text: '当前网络不可用，已使用本机缓存；恢复网络后会自动同步。'
    });
    return { state: mergedState, notices, online: false };
  }
  try {
    const remote = await fetchRemoteState();
    const merged = mergeStates(mergedState, remote);
    mergedState = await hydrateSignedUrls(merged);
    saveMeta();
    setStatus('idle', '已连接云端');
    return { state: mergedState, notices, online: true };
  } catch (error) {
    console.warn('云端初始化失败', error);
    const offline = navigator.onLine === false;
    setStatus(offline ? 'offline' : 'error', offline ? '当前处于离线状态' : '云端连接失败', error.message || '');
    notices.push({
      tone: 'warning',
      text: offline
        ? '当前网络不可用，已使用本机缓存；恢复网络后会自动同步。'
        : '暂时无法连接云端，已使用本机缓存；稍后会自动重试同步。'
    });
    return { state: mergedState, notices, online: false };
  }
}

function scheduleSync(delay = 500) {
  if (!config.user || !config.app) return;
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void syncNow({ reason: 'scheduled' });
  }, delay);
}

function scheduleRetry(delay = 15000) {
  if (retryTimer) window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void syncNow({ reason: 'retry' });
  }, delay);
}

async function runSync() {
  if (!config.user || !config.app || !config.app.isBooted()) return getStatus();
  if (navigator.onLine === false) {
    setStatus('offline', '当前离线');
    return getStatus();
  }

  const app = config.app;
  const userId = config.user.id;
  const startRevision = app.getLocalRevision();
  setStatus('syncing', '正在同步云端…');

  try {
    const remoteBefore = await fetchRemoteState();
    const localState = normalizeForCloud(app.getState());
    const remoteById = new Map((remoteBefore.questions || []).map((row) => [row.id, row]));

    // ---------- 1. 计算需要推送的题目 ----------
    const questionsToPush = [];
    localState.questions.forEach((question) => {
      const remoteRow = remoteById.get(question.id);
      if (!remoteRow) {
        questionsToPush.push(question);
        return;
      }
      if (remoteRow.deleted_at) {
        if (timeOf(question.updatedAt) > timeOf(remoteRow.deleted_at)) questionsToPush.push(question);
        return;
      }
      const localIsNewer = timeOf(question.updatedAt) > timeOf(remoteRow.updated_at);
      const sameOrNewer = timeOf(question.updatedAt) >= timeOf(remoteRow.updated_at);
      const hasUnuploadedImage = String(question.image || '').startsWith('data:image/')
        && !question.imagePath;
      const needsImageRetry = hasUnuploadedImage && !remoteRow.image_path && sameOrNewer;
      // 不因“本地有 imagePath”就无条件覆盖云端较新的文本；否则一次
      // 图片上传后的数据库失败，会把另一台设备较新的编辑顶掉。
      const pathChanged = Boolean(question.imagePath)
        && question.imagePath !== (remoteRow.image_path || '')
        && sameOrNewer;
      if (localIsNewer || needsImageRetry || pathChanged) questionsToPush.push(question);
    });

    // ---------- 2. 计算需要软删除的题目 ----------
    const pendingDeleteIds = Object.keys(meta.pendingDeletes);
    const deleteIds = [];
    pendingDeleteIds.forEach((id) => {
      const pending = meta.pendingDeletes[id] || {};
      const remoteRow = remoteById.get(id);
      if (!remoteRow) {
        delete meta.pendingDeletes[id];
        if (pending.imagePath) queueObjectDelete(pending.imagePath);
        return;
      }
      if (remoteRow.deleted_at) {
        delete meta.pendingDeletes[id];
        if (remoteRow.image_path) queueObjectDelete(remoteRow.image_path);
        return;
      }
      // 另一台设备在本地删除之后又编辑了：以云端较新的编辑为准。
      if (timeOf(remoteRow.updated_at) > timeOf(pending.deletedAt)) {
        delete meta.pendingDeletes[id];
        return;
      }
      deleteIds.push(id);
      if (remoteRow.image_path) queueObjectDelete(remoteRow.image_path);
      if (pending.imagePath) queueObjectDelete(pending.imagePath);
    });

    // ---------- 3. 计算设置/标签是否需要推送 ----------
    const localSettingsTimestamp = meta.settingsUpdatedAt || '';
    const remoteSettings = remoteBefore.settings;
    const shouldPushSettings = !remoteSettings
      || timeOf(localSettingsTimestamp) > timeOf(remoteSettings.updated_at);

    // ---------- 4. 上传图片并 upsert 题目 ----------
    const rows = [];
    const localPatches = [];
    const oldPathsAfterWrite = new Set();
    let imageFailures = 0;
    for (const question of questionsToPush) {
      const remoteRow = remoteById.get(question.id);
      const previousRemotePath = remoteRow?.image_path || '';
      let finalPath = question.imagePath || '';

      try {
        if (String(question.image || '').startsWith('data:image/') && !question.imagePath) {
          const uploaded = await uploadQuestionImage(userId, question);
          finalPath = uploaded.path;
          if (previousRemotePath && previousRemotePath !== finalPath) {
            oldPathsAfterWrite.add(previousRemotePath);
          }
          localPatches.push({
            id: question.id,
            originalImage: question.image,
            imagePath: uploaded.path,
            image: uploaded.signedUrl || question.image
          });
        } else if (!finalPath) {
          if (previousRemotePath) oldPathsAfterWrite.add(previousRemotePath);
        } else if (previousRemotePath && previousRemotePath !== finalPath) {
          oldPathsAfterWrite.add(previousRemotePath);
        }
      } catch (error) {
        imageFailures += 1;
        console.warn('上传错题图片失败', question.id, error);
        // 图片上传失败也让文字先同步；本轮 image_path 写 null，下一轮
        // 本地仍有 base64 且云端无路径，needsImageRetry 会重新上传。
        finalPath = '';
        if (previousRemotePath) oldPathsAfterWrite.add(previousRemotePath);
      }

      rows.push(questionToRow({ ...question, imagePath: finalPath }, userId));
    }

    if (rows.length) await upsertQuestions(rows);

    // 先释放本地 base64，再做设置/删除/二次拉取；即使后续步骤失败，
    // 图片已上传且本地已换成签名 URL，不会一直卡在大 base64。
    const patchSnapshot = localPatches.length ? app.getState() : null;
    localPatches.forEach((patch) => {
      const current = patchSnapshot?.questions.find((question) => question.id === patch.id);
      if (current && current.image === patch.originalImage) {
        app.patchQuestionLocal(patch.id, {
          imagePath: patch.imagePath,
          image: patch.image
        });
      }
    });

    oldPathsAfterWrite.forEach(queueObjectDelete);
    if (shouldPushSettings) {
      const settingsUpdatedAt = new Date().toISOString();
      await pushSettings({
        user_id: userId,
        tags: localState.tags,
        notifications: Boolean(localState.settings?.notifications),
        updated_at: settingsUpdatedAt
      });
      meta.settingsUpdatedAt = settingsUpdatedAt;
    }
    if (deleteIds.length) {
      await softDeleteQuestions(deleteIds, new Date().toISOString());
      deleteIds.forEach((id) => {
        const remoteRow = remoteById.get(id);
        if (remoteRow?.image_path) queueObjectDelete(remoteRow.image_path);
        const pending = meta.pendingDeletes[id];
        if (pending?.imagePath) queueObjectDelete(pending.imagePath);
      });
      // 先保留 pendingDeletes，直到第二次拉取确认墓碑已生效，避免短暂重新拉回已删除题。
    }

    // ---------- 5. 清理 Storage 旧对象 ----------
    await flushObjectDeletes();

    // ---------- 6. 再拉一次服务器状态并合并 ----------
    const remoteAfter = await fetchRemoteState();
    deleteIds.forEach((id) => {
      const row = (remoteAfter.questions || []).find((item) => item.id === id);
      if (!row || row.deleted_at) delete meta.pendingDeletes[id];
    });
    const localAfter = normalizeForCloud(app.getState());
    let merged = mergeStates(localAfter, remoteAfter);
    merged = await hydrateSignedUrls(merged);

    const localChangedDuringSync = app.getLocalRevision() !== startRevision;
    if (!localChangedDuringSync) {
      app.applyCloudState(merged);
    } else {
      rerunRequested = true;
    }

    meta.lastSyncAt = new Date().toISOString();
    meta.dirty = imageFailures > 0
      || Object.keys(meta.pendingDeletes).length > 0
      || meta.pendingObjectDeletes.length > 0
      || localChangedDuringSync;
    saveMeta();

    if (imageFailures > 0) {
      setStatus('error', `部分图片上传失败（${imageFailures} 张），文字已同步，图片将自动重试。`, '图片上传失败');
      scheduleRetry(30000);
    } else if (meta.dirty) {
      setStatus('pending', '有部分内容等待同步');
      scheduleRetry(20000);
    } else {
      setStatus('synced', '云端已同步');
    }
  } catch (error) {
    console.error('云同步失败', error);
    meta.dirty = true;
    saveMeta();
    const offline = navigator.onLine === false;
    setStatus(
      offline ? 'offline' : 'error',
      offline ? '当前离线，改动将在联网后同步' : '同步失败，将自动重试',
      error?.message || 'Unknown sync error'
    );
    scheduleRetry(15000);
  }
  return getStatus();
}

async function syncNow(options = {}) {
  if (!config.user || !config.app) return getStatus();
  if (syncPromise) {
    rerunRequested = true;
    return syncPromise;
  }
  syncPromise = runSync()
    .finally(() => {
      syncPromise = null;
      if (rerunRequested) {
        rerunRequested = false;
        scheduleSync(400);
      }
    });
  await syncPromise;
  if (options.manual) {
    const current = getStatus();
    if (current.phase === 'error' || current.phase === 'offline') {
      config.app.showToast(current.error || current.message || '同步没有完成，请稍后重试。', 'error', 5000);
    } else {
      config.app.showToast('云端已同步。', 'success', 2800);
    }
  }
  return getStatus();
}

function handleLocalCommit(previousState, nextState) {
  if (!config.user) return;
  const prevQuestions = new Map((previousState.questions || []).map((question) => [question.id, question]));
  const nextQuestions = new Map((nextState.questions || []).map((question) => [question.id, question]));

  prevQuestions.forEach((question, id) => {
    if (!nextQuestions.has(id)) {
      const existing = meta.pendingDeletes[id];
      if (!existing) {
        meta.pendingDeletes[id] = {
          deletedAt: new Date().toISOString(),
          imagePath: question.imagePath || ''
        };
      }
      if (question.imagePath) queueObjectDelete(question.imagePath);
    }
  });

  nextQuestions.forEach((question, id) => {
    if (meta.pendingDeletes[id]) delete meta.pendingDeletes[id];
    // 旧图片路径不在本地提交时删除。等新图片上传 / 数据库 upsert 成功后再删，
    // 否则替换图片失败时会让另一台设备看到失效图片。
  });

  const tagsChanged = JSON.stringify(previousState.tags || []) !== JSON.stringify(nextState.tags || []);
  const notificationsChanged = Boolean(previousState.settings?.notifications) !== Boolean(nextState.settings?.notifications);
  if (tagsChanged || notificationsChanged) {
    meta.settingsUpdatedAt = new Date().toISOString();
  }

  meta.dirty = true;
  saveMeta();
  setStatus('pending', '有改动待同步');
  scheduleSync(650);
}

function setupRealtime() {
  if (!supabase || !config.user || channel) return;
  const userId = config.user.id;
  channel = supabase.channel(`zhixi-cloud-${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'questions',
      filter: `user_id=eq.${userId}`
    }, () => handleRemoteChange())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_settings',
      filter: `user_id=eq.${userId}`
    }, () => handleRemoteChange())
    .subscribe((subscriptionStatus) => {
      if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
        console.warn('Realtime 订阅异常，将使用前台同步兜底', subscriptionStatus);
      }
    });
}

function handleRemoteChange() {
  if (!config.app || !config.app.isBooted()) return;
  if (Date.now() < suppressRealtimeUntil) return;
  if (syncPromise) {
    rerunRequested = true;
    return;
  }
  scheduleSync(900);
}

function attach() {
  if (attached || attachInProgress || !config.user || !config.app) return;
  attachInProgress = true;
  attached = true;
  setupRealtime();

  onlineHandler = () => {
    if (!attached) return;
    setStatus('pending', '网络已恢复，准备同步');
    scheduleSync(150);
  };
  offlineHandler = () => {
    if (!attached) return;
    setStatus('offline', '当前离线');
  };
  visibilityHandler = () => {
    if (!attached || document.visibilityState !== 'visible') return;
    if (syncPromise) return;
    if (!meta.lastSyncAt || Date.now() - timeOf(meta.lastSyncAt) > 15000) {
      scheduleSync(300);
    }
  };
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  document.addEventListener('visibilitychange', visibilityHandler);

  // Realtime 在部分企业网络/移动网络下会静默断开；前台每 60 秒做一次轻量兜底。
  pollTimer = window.setInterval(() => {
    if (!attached || document.visibilityState !== 'visible' || syncPromise) return;
    if (navigator.onLine === false) return;
    if (!meta.lastSyncAt || Date.now() - timeOf(meta.lastSyncAt) > 30000) {
      scheduleSync(0);
    }
  }, 60000);

  setStatus('idle', '准备同步');
  scheduleSync(200);
  attachInProgress = false;
}

function detach() {
  attached = false;
  if (debounceTimer) window.clearTimeout(debounceTimer);
  if (retryTimer) window.clearTimeout(retryTimer);
  if (pollTimer) window.clearInterval(pollTimer);
  debounceTimer = null;
  retryTimer = null;
  pollTimer = null;
  if (onlineHandler) window.removeEventListener('online', onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
  onlineHandler = offlineHandler = visibilityHandler = null;
  if (channel) {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
    channel = null;
  }
  statusListeners.clear();
  config = { user: null, app: null };
  syncPromise = null;
  rerunRequested = false;
}

async function prepareExportQuestions(questions) {
  if (!Array.isArray(questions)) return { questions: [], warning: '' };
  const client = requireSupabase();
  const copies = questions.map((question) => ({ ...question }));
  const indexes = copies
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.imagePath && !String(question.image || '').startsWith('data:image/'));
  let failures = 0;

  for (let start = 0; start < indexes.length; start += DEVICE_IMAGE_CONCURRENCY) {
    const chunk = indexes.slice(start, start + DEVICE_IMAGE_CONCURRENCY);
    await Promise.all(chunk.map(async ({ question, index }) => {
      try {
        const { data, error } = await client.storage.from(IMAGE_BUCKET).download(question.imagePath);
        if (error) throw error;
        copies[index].image = await blobToDataUrl(data);
      } catch (error) {
        failures += 1;
        console.warn('备份时下载图片失败', question.imagePath, error);
      }
    }));
  }

  return {
    questions: copies,
    warning: failures ? `${failures} 张云端图片拉取失败，备份可能缺少这些图片。` : ''
  };
}

export const CloudSync = {
  bootstrap,
  attach,
  detach,
  handleLocalCommit,
  syncNow,
  prepareExportQuestions,
  getStatus,
  onStatus
};
