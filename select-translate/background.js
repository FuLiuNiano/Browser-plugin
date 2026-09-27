// 划词翻译 v2 - 后台:单条/批量翻译、三级引擎链、快捷键/右键转发、角标进度
// 引擎链(全部经 curl 实测):Google single(信息全) → Google dict-chrome-ex(风控宽松) → MyMemory(国内直连)
'use strict';

const DEFAULTS = { enabled: true, mode: 'selection', trigger: 'button', engine: 'auto', target: 'zh-CN', excluded: [] };

function fixup(s) {
  // v1 曾用 mode 存划词触发方式,迁移到 trigger
  if (s && (s.mode === 'button' || s.mode === 'auto')) {
    s.trigger = s.mode;
    s.mode = 'selection';
  }
  return s;
}

function getSettings() {
  return chrome.storage.sync.get({ stSettings: DEFAULTS }).then(d => fixup({ ...DEFAULTS, ...(d.stSettings || {}) }));
}

async function fetchT(url, options = {}, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function errMsg(e) {
  const m = (e && e.message) || String(e);
  if (/abort/i.test(m)) return '请求超时(网络不通?)';
  return m;
}

// ============ 原始请求 ============
async function googleSingleRaw(text, target) {
  const qs = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', dj: '1' });
  const res = await fetchT('https://translate.googleapis.com/translate_a/single?' + qs.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q: text }).toString()
  });
  if (!res.ok) throw new Error('Google HTTP ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.sentences)) throw new Error('Google 响应异常');
  return { sentences: data.sentences, src: data.src || 'auto' };
}

async function googleDictRaw(text, target) {
  const qs = new URLSearchParams({ client: 'dict-chrome-ex', sl: 'auto', tl: target, q: text });
  const res = await fetchT('https://clients5.google.com/translate_a/t?' + qs.toString(), {}, 9000);
  if (!res.ok) throw new Error('Google备用 HTTP ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('Google备用 空结果');
  return data;
}

async function myMemoryRaw(text, target) {
  const qs = new URLSearchParams({ q: text, langpair: 'Autodetect|' + target });
  const res = await fetchT('https://api.mymemory.translated.net/get?' + qs.toString(), {}, 12000);
  if (!res.ok) throw new Error('MyMemory HTTP ' + res.status);
  const d = await res.json();
  if (d.quotaFinished) throw new Error('MyMemory 当日免费额度已用完');
  if (d.responseStatus !== 200 || !d.responseData || !d.responseData.translatedText) {
    throw new Error(d.responseDetails || 'MyMemory 空结果');
  }
  return d;
}

// ============ 工具 ============
// 按权重把字符串切成 n 段
function charSplit(s, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => '');
  const out = [];
  let pos = 0;
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) { out.push(s.slice(pos)); break; }
    let n = Math.round(s.length * weights[i] / total);
    n = Math.max(0, Math.min(n, s.length - pos));
    out.push(s.slice(pos, pos + n));
    pos += n;
  }
  return out;
}

// dj=1 分句结果 → 按输入行回填(译文丢换行时按字符权重拆)
function mapLinesFromSentences(sentences, texts) {
  const joined = texts.join('\n');
  const lineOf = new Array(joined.length);
  let li = 0;
  for (let i = 0; i < joined.length; i++) {
    lineOf[i] = li;
    if (joined[i] === '\n') li++;
  }
  const out = texts.map(() => '');
  let cursor = 0;
  for (const s of sentences) {
    const orig = s.orig || '', trans = s.trans || '';
    const start = cursor;
    cursor += orig.length;
    if (cursor > joined.length) throw new Error('Google 分句对齐失败');
    const end = cursor;
    const nls = (orig.match(/\n/g) || []).length;
    if (nls === 0) {
      out[lineOf[start]] += trans;
      continue;
    }
    // orig 含换行:按换行切分 orig 段,各段归属对应输入行
    const segs = [];
    let p = start;
    for (let i = 0; i < nls; i++) {
      const nl = joined.indexOf('\n', p);
      if (nl < 0 || nl >= end) throw new Error('Google 分句对齐失败');
      segs.push({ line: lineOf[p], len: Math.max(nl - p, 1) });
      p = nl + 1;
    }
    segs.push({ line: lineOf[Math.min(p, joined.length - 1)], len: Math.max(end - p, 1) });
    const tParts = trans.split('\n');
    if (tParts.length === segs.length) {
      segs.forEach((sg, i) => { out[sg.line] += tParts[i] || ''; });
    } else {
      charSplit(trans, segs.map(sg => sg.len)).forEach((part, i) => { out[segs[i].line] += part; });
    }
  }
  if (cursor !== joined.length) throw new Error('Google 分句对齐失败');
  if (out.some(t => !t.trim())) throw new Error('Google 分句缺行');
  return out;
}

// ============ 批量翻译(多行合并发送,逐行映射回) ============
async function batchGoogleSingle(texts, target) {
  const { sentences, src } = await googleSingleRaw(texts.join('\n'), target);
  const out = mapLinesFromSentences(sentences, texts);
  return out.map(t => ({ text: t, from: src, engine: 'google' }));
}

async function batchGoogleDict(texts, target) {
  const data = await googleDictRaw(texts.join('\n'), target);
  let arr = null;
  if (data.length === texts.length && data.every(x => Array.isArray(x))) {
    arr = data.map(x => x[0] || '');
  } else if (data.length >= 1 && Array.isArray(data[0]) && typeof data[0][0] === 'string') {
    const parts = data.map(x => x[0] || '').join('\n').split('\n');
    if (parts.length === texts.length) arr = parts;
  }
  if (!arr || arr.some(t => !t.trim())) throw new Error('Google备用 行映射失败');
  return arr.map(t => ({ text: t, from: 'auto', engine: 'google' }));
}

async function batchMyMemory(texts, target) {
  const d = await myMemoryRaw(texts.join('\n'), target);
  const raw = d.responseData.translatedText;
  const parts = raw.split('\n');
  if (parts.length !== texts.length) {
    if (texts.length === 1) return [{ text: raw, from: 'auto', engine: 'mymemory' }];
    return charSplit(raw, texts.map(t => Math.max(t.length, 1)))
      .map(t => ({ text: t, from: 'auto', engine: 'mymemory' }));
  }
  return parts.map(t => ({ text: t, from: 'auto', engine: 'mymemory' }));
}

function batchEngines(engine) {
  if (engine === 'mymemory') return ['mymemory'];
  if (engine === 'google') return ['google-single', 'google-dict'];
  return ['google-single', 'google-dict', 'mymemory'];
}

async function translateBatch(texts, target, engine) {
  let lastErr;
  for (const eng of batchEngines(engine)) {
    try {
      const items = await (eng === 'google-single' ? batchGoogleSingle(texts, target)
        : eng === 'google-dict' ? batchGoogleDict(texts, target)
          : batchMyMemory(texts, target));
      if (items.every(it => it.text && it.text.trim())) return items;
      lastErr = new Error('空结果');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('所有引擎失败');
}

// ============ 消息入口 ============
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'translate' && msg.text) {
    (async () => {
      try {
        const s = await getSettings();
        const target = msg.target || s.target || 'zh-CN';
        const engine = msg.engine || s.engine || 'auto';
        const items = await translateBatch([String(msg.text).slice(0, 5000)], target, engine);
        sendResponse({ ok: true, text: items[0].text, from: items[0].from, engine: items[0].engine });
      } catch (e) {
        sendResponse({ ok: false, error: errMsg(e) });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'translate-batch' && Array.isArray(msg.texts) && msg.texts.length) {
    (async () => {
      try {
        const s = await getSettings();
        const target = msg.target || s.target || 'zh-CN';
        const engine = msg.engine || s.engine || 'auto';
        const items = await translateBatch(msg.texts.slice(0, 60).map(t => String(t).slice(0, 3000)), target, engine);
        sendResponse({ ok: true, items });
      } catch (e) {
        sendResponse({ ok: false, error: errMsg(e) });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'page-progress' && sender.tab) {
    const tabId = sender.tab.id;
    if (msg.phase === 'start') setBadge(tabId, '…', '#4f7cff');
    else if (msg.phase === 'step') setBadge(tabId, msg.total ? Math.round((msg.done / msg.total) * 100) + '%' : '…', '#4f7cff');
    else if (msg.phase === 'done') {
      setBadge(tabId, '✓', '#1a9c62');
      setTimeout(() => setBadge(tabId, ''), 2000);
    } else if (msg.phase === 'error') {
      setBadge(tabId, '!', '#d1242f');
      setTimeout(() => setBadge(tabId, ''), 3000);
    } else setBadge(tabId, '');
    sendResponse({ ok: true });
  }
});

function setBadge(tabId, text, color) {
  if (!tabId) return;
  try {
    if (color) chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
    chrome.action.setBadgeText({ tabId, text: text || '' }).catch(() => {});
  } catch (e) { /* SW 生命周期竞态,忽略 */ }
}

async function forwardToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    try { await chrome.tabs.sendMessage(tab.id, payload); } catch (e) { /* 页面无内容脚本时忽略 */ }
  }
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'translate-selection') forwardToActiveTab({ type: 'translate-selection' });
  else if (cmd === 'translate-page') forwardToActiveTab({ type: 'page-toggle' });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'st-translate', title: '翻译选中文字', contexts: ['selection'] }, () => void chrome.runtime.lastError);
  chrome.contextMenus.create({ id: 'st-page', title: '全文翻译 / 还原本页', contexts: ['all'] }, () => void chrome.runtime.lastError);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'st-translate') {
    try { chrome.tabs.sendMessage(tab.id, { type: 'translate-selection' }); } catch (e) {}
  } else if (info.menuItemId === 'st-page') {
    try { chrome.tabs.sendMessage(tab.id, { type: 'page-toggle' }); } catch (e) {}
  }
});
