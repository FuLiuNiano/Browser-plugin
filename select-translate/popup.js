// 划词翻译 v2 - 弹窗菜单:三模式切换 + 本页翻译控制 + 手动翻译 + 设置
'use strict';

const DEFAULTS = { enabled: true, mode: 'selection', trigger: 'button', engine: 'auto', target: 'zh-CN', excluded: [], auto: true };
const LANGS = [
  ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', '英语'], ['ja', '日语'], ['ko', '韩语'],
  ['fr', '法语'], ['de', '德语'], ['ru', '俄语'], ['es', '西班牙语'], ['pt', '葡萄牙语'],
  ['it', '意大利语'], ['vi', '越南语'], ['th', '泰语']
];
let S = { ...DEFAULTS };
let lastResult = null;
let lastState = null;

const $ = (id) => document.getElementById(id);

function fixup(s) {
  if (s && (s.mode === 'button' || s.mode === 'auto')) {
    s.trigger = s.mode;
    s.mode = 'selection';
  }
  return s;
}

async function load() {
  const d = await chrome.storage.sync.get({ stSettings: DEFAULTS });
  S = fixup({ ...DEFAULTS, ...(d.stSettings || {}) });
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  $('enabled').checked = S.enabled;
  $('auto').checked = S.auto !== false;
  $('trigger').value = S.trigger;
  $('engine').value = S.engine;
  $('target').innerHTML = LANGS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('target').value = S.target;
  renderModes();
  renderEx();
  pollState();
  setInterval(pollState, 800);
}

function save() { chrome.storage.sync.set({ stSettings: S }); }

function renderModes() {
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
}

// ---------- 本页翻译状态 ----------
function pollState() {
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab || !tab.id) return;
    // 只问顶层框架:广播会被任意 iframe 抢答,还原按钮曾被误判成"未翻译"而禁用
    chrome.tabs.sendMessage(tab.id, { type: 'page-get-state' }, { frameId: 0 }).then(st => {
      lastState = st;
      renderPageCard();
    }).catch(() => { lastState = null; renderPageCard(); });
  }).catch(() => {});
}

function renderPageCard() {
  const card = $('pageCard');
  const st = lastState;
  const show = S.mode !== 'selection' || (st && (st.translated || st.running));
  card.style.display = show ? 'block' : 'none';
  if (!show) return;
  const go = $('pageGo'), rst = $('pageRestore'), status = $('pageStatus');
  if (!st) {
    go.disabled = true; go.textContent = '翻译本页'; rst.disabled = true;
    status.textContent = '此页面不支持(浏览器内置页 / 商店页)';
    return;
  }
  if (!S.enabled) { go.disabled = true; go.textContent = '翻译本页'; rst.disabled = true; status.textContent = '插件已停用'; return; }
  if (st.running) { go.disabled = true; rst.disabled = true; status.textContent = `翻译中 ${st.done}/${st.total}…`; return; }
  if (st.translated) {
    go.disabled = false; go.textContent = '补翻遗漏'; rst.disabled = false;
    status.textContent = st.failed ? `已翻译本页(失败 ${st.failed} 处,可补翻)` : '已翻译本页;切换「全文/对照」会自动重排';
    return;
  }
  go.disabled = false; go.textContent = '翻译本页'; rst.disabled = true;
  status.textContent = S.mode === 'bilingual' ? '将保留原文、在其旁插入译文' : '将替换原文(不保留);表单与代码块不翻译';
}

$('pageGo').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    const type = (lastState && lastState.translated) ? 'page-fill' : 'page-translate';
    try { await chrome.tabs.sendMessage(tab.id, { type }); } catch (e) {}
  }
  setTimeout(pollState, 300);
});

$('pageRestore').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'page-restore' }); } catch (e) {}
  }
  setTimeout(pollState, 300);
});

// ---------- 模式切换 ----------
document.querySelectorAll('.mode').forEach(b => {
  b.addEventListener('click', async () => {
    const prev = S.mode;
    S.mode = b.dataset.mode;
    save();
    renderModes();
    renderPageCard();
    // 已翻译状态下在全文↔对照间切换:按新模式自动重排整页(无需手动还原)
    if (lastState && lastState.translated && prev !== S.mode &&
        (prev === 'page' || prev === 'bilingual') && (S.mode === 'page' || S.mode === 'bilingual')) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        try { await chrome.tabs.sendMessage(tab.id, { type: 'page-restyle' }); } catch (e) {}
      }
      setTimeout(pollState, 400);
    }
  });
});

// ---------- 手动翻译 ----------
async function doTranslate() {
  const text = $('input').value.trim();
  if (!text) return;
  $('result').textContent = '翻译中…';
  $('meta').textContent = '';
  $('copy').disabled = true;
  lastResult = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'translate', text: text.slice(0, 5000) });
    if (!res || !res.ok) throw new Error((res && res.error) || '翻译失败');
    lastResult = res;
    $('result').textContent = res.text;
    $('meta').textContent = (res.engine === 'mymemory' ? 'MyMemory' : 'Google') + ' · 检测: ' + (res.from || 'auto');
    $('copy').disabled = false;
  } catch (err) {
    $('result').textContent = '失败:' + (err && err.message ? err.message : String(err));
  }
}

$('go').addEventListener('click', doTranslate);
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doTranslate();
});

$('copy').addEventListener('click', async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(lastResult.text);
    $('copy').textContent = '已复制';
    setTimeout(() => { $('copy').textContent = '复制'; }, 900);
  } catch (e) { /* 剪贴板被拒时静默 */ }
});

// ---------- 设置 ----------
function renderEx() {
  const ul = $('exList');
  ul.innerHTML = '';
  (S.excluded || []).forEach((d, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = d;
    const x = document.createElement('button');
    x.textContent = '✕';
    x.title = '移除';
    x.addEventListener('click', () => { S.excluded.splice(i, 1); save(); renderEx(); });
    li.appendChild(span);
    li.appendChild(x);
    ul.appendChild(li);
  });
}

$('enabled').addEventListener('change', (e) => { S.enabled = e.target.checked; save(); renderPageCard(); });
$('auto').addEventListener('change', (e) => { S.auto = e.target.checked; save(); });
$('trigger').addEventListener('change', (e) => { S.trigger = e.target.value; save(); });
$('engine').addEventListener('change', (e) => { S.engine = e.target.value; save(); });
$('target').addEventListener('change', (e) => { S.target = e.target.value; save(); });

$('exCur').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (e) {}
  if (!host) { $('hint').textContent = '当前页不可排除(仅支持 http/https)'; return; }
  if ((S.excluded || []).includes(host)) { $('hint').textContent = host + ' 已在列表中'; return; }
  S.excluded = [...(S.excluded || []), host];
  save();
  renderEx();
  $('hint').textContent = '已排除 ' + host;
});

load();
