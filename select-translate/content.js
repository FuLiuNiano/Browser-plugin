// 划词翻译 v2 - 页面脚本
// A. 划词翻译:选区检测、悬浮按钮、结果面板(Shadow DOM)
// B. 页面翻译:全文替换 / 对照插入,跳过表单/密码/代码块/隐藏文本,保排版
(() => {
  'use strict';
  if (window.__stInjected) return;
  window.__stInjected = true;

  const ROOT_ID = '__st_root__';
  if (document.getElementById(ROOT_ID)) return;

  const DEFAULTS = { enabled: true, mode: 'selection', trigger: 'button', engine: 'auto', target: 'zh-CN', excluded: [], auto: true };
  let S = { ...DEFAULTS };

  function fixup(s) {
    if (s && (s.mode === 'button' || s.mode === 'auto')) {
      s.trigger = s.mode;
      s.mode = 'selection';
    }
    return s;
  }

  function loadSettings() {
    chrome.storage.sync.get({ stSettings: DEFAULTS }, (d) => {
      S = fixup({ ...DEFAULTS, ...(d.stSettings || {}) });
      if (!S.enabled) { hideBtn(); hidePanel(); }
      // 首次加载:全文/对照模式下自动实时翻译(打开页面即翻,新增内容由观察器跟进)
      if (!ST.settingsLoaded) {
        ST.settingsLoaded = true;
        let skipAuto = false, forceAuto = false;
        try {
          skipAuto = sessionStorage.getItem('__stt_skip_auto__') === '1';
          forceAuto = sessionStorage.getItem('__stt_force_auto__') === '1';
          if (skipAuto) sessionStorage.removeItem('__stt_skip_auto__');
          if (forceAuto) sessionStorage.removeItem('__stt_force_auto__');
        } catch (e) {}
        const wantAuto = S.enabled && (S.mode === 'page' || S.mode === 'bilingual') && !siteExcluded() &&
          (forceAuto || (!skipAuto && S.auto));
        if (wantAuto) autoStart();
      }
    });
  }

  function autoStart() {
    const go = () => setTimeout(() => { if (!ST.translated && !ST.running) startPage(); }, 400);
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }
  loadSettings();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'sync' && ch.stSettings) loadSettings();
  });

  const LANGS = {
    'zh-CN': '简体中文', 'zh-TW': '繁體中文', 'en': '英语', 'ja': '日语', 'ko': '韩语',
    'fr': '法语', 'de': '德语', 'ru': '俄语', 'es': '西班牙语', 'pt': '葡萄牙语',
    'it': '意大利语', 'vi': '越南语', 'th': '泰语'
  };
  const shortName = (c) => LANGS[c] || (c || '?').toUpperCase();

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .btn { position: fixed; z-index: 2147483647; width: 30px; height: 30px; border-radius: 50%;
      border: none; cursor: pointer; display: none; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #4f7cff, #8b5cf6); color: #fff; font-size: 14px; font-weight: 700;
      box-shadow: 0 2px 10px rgba(0,0,0,.3); }
    .btn:hover { filter: brightness(1.12); }
    .panel { position: fixed; z-index: 2147483647; display: none; min-width: 240px; max-width: 480px;
      background: #ffffff; color: #1f2328; border: 1px solid rgba(0,0,0,.1); border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.24); overflow: hidden; user-select: none; }
    .head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 10px;
      background: rgba(0,0,0,.035); cursor: move; }
    .badge { font-size: 11px; line-height: 1; padding: 3px 7px; border-radius: 999px; color: #fff;
      background: linear-gradient(135deg, #4f7cff, #8b5cf6); white-space: nowrap; }
    .langs { font-size: 12px; opacity: .6; white-space: nowrap; }
    .sp { flex: 1; }
    .ib { width: 24px; height: 24px; border: none; border-radius: 6px; background: transparent; cursor: pointer;
      font-size: 13px; line-height: 1; color: inherit; opacity: .75; display: flex; align-items: center; justify-content: center; }
    .ib:hover { opacity: 1; background: rgba(0,0,0,.08); }
    .ib.on { opacity: 1; background: rgba(79,124,255,.22); }
    .body { padding: 10px 12px; font-size: 14px; line-height: 1.6; max-height: 340px; overflow: auto;
      white-space: pre-wrap; word-break: break-word; user-select: text; }
    .err { color: #d1242f; margin-bottom: 8px; }
    .retry { border: 1px solid rgba(0,0,0,.15); background: transparent; color: inherit; border-radius: 6px;
      padding: 3px 12px; font-size: 12px; cursor: pointer; }
    .retry:hover { background: rgba(0,0,0,.05); }
    @media (prefers-color-scheme: dark) {
      .panel { background: #202124; color: #e8eaed; border-color: rgba(255,255,255,.12); }
      .head { background: rgba(255,255,255,.06); }
      .ib:hover { background: rgba(255,255,255,.1); }
      .retry { border-color: rgba(255,255,255,.2); }
      .retry:hover { background: rgba(255,255,255,.08); }
    }
  `;

  const host = document.createElement('div');
  host.id = ROOT_ID;
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483646;';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch (e) {
    const st = document.createElement('style');
    st.textContent = CSS;
    root.appendChild(st);
  }

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = '译';
  btn.title = '翻译';
  root.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML =
    '<div class="head">' +
      '<span class="badge">…</span>' +
      '<span class="langs"></span>' +
      '<span class="sp"></span>' +
      '<button class="ib" data-act="copy" title="复制译文">⧉</button>' +
      '<button class="ib" data-act="speak" title="朗读/停止">🔊</button>' +
      '<button class="ib" data-act="pin" title="固定面板(滚动/点击外部不关闭)">📌</button>' +
      '<button class="ib" data-act="close" title="关闭(Esc)">✕</button>' +
    '</div>' +
    '<div class="body"></div>';
  root.appendChild(panel);
  const head = panel.querySelector('.head');
  const badge = panel.querySelector('.badge');
  const langsEl = panel.querySelector('.langs');
  const body = panel.querySelector('.body');
  const speakBtn = panel.querySelector('[data-act="speak"]');
  const pinBtn = panel.querySelector('[data-act="pin"]');

  let curSel = null;      // { text, range }
  let pinned = false;
  let manualPos = false;
  let lastResult = null;  // { text, from, engine }

  function siteExcluded() {
    const h = location.hostname;
    return (S.excluded || []).some(d => d && (h === d || h.endsWith('.' + d)));
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > 5000) return null;
    const range = sel.getRangeAt(0);
    let rect;
    try { rect = range.getBoundingClientRect(); } catch (e) { return null; }
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text, range };
  }

  function inUI(e) { return e.composedPath().includes(host); }

  function anchorRect() {
    if (!curSel) return null;
    try { return curSel.range.getBoundingClientRect(); } catch (e) { return null; }
  }

  function showBtn() {
    const r = anchorRect();
    if (!r) return hideBtn();
    const size = 30, m = 6;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let x = r.right + m, y = r.top;
    if (x + size > vw - 8) x = r.left - size - m;
    x = Math.max(8, Math.min(x, vw - size - 8));
    y = Math.max(8, Math.min(y, vh - size - 8));
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.style.display = 'flex';
  }
  function hideBtn() { btn.style.display = 'none'; }

  function showPanel() {
    manualPos = false;
    panel.style.display = 'block';
    placePanel();
  }
  function hidePanel() {
    panel.style.display = 'none';
    pinned = false;
    pinBtn.classList.remove('on');
  }

  function placePanel() {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    if (manualPos) {
      let x = parseInt(panel.style.left || '0', 10), y = parseInt(panel.style.top || '0', 10);
      x = Math.max(0, Math.min(x, vw - panel.offsetWidth));
      y = Math.max(0, Math.min(y, vh - panel.offsetHeight));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      return;
    }
    const r = anchorRect();
    const w = panel.offsetWidth, h = panel.offsetHeight, m = 8;
    let x = r ? r.left + r.width / 2 - w / 2 : (vw - w) / 2;
    let y = r ? r.bottom + m : 100;
    if (y + h > vh - 8 && (!r || r.top - h - m > 8)) y = r ? r.top - h - m : 100;
    x = Math.max(8, Math.min(x, vw - w - 8));
    y = Math.max(8, Math.min(y, vh - h - 8));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  async function translate() {
    if (!curSel) return;
    pinned = false;
    pinBtn.classList.remove('on');
    lastResult = null;
    showPanel();
    badge.textContent = '…';
    langsEl.textContent = shortName('auto') + ' → ' + shortName(S.target);
    body.textContent = '翻译中…';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'translate', text: curSel.text });
      if (!res) throw new Error('后台无响应');
      if (!res.ok) throw new Error(res.error || '翻译失败');
      lastResult = res;
      body.textContent = res.text;
      badge.textContent = res.engine === 'mymemory' ? 'MyMemory' : 'Google';
      langsEl.textContent = shortName(res.from) + ' → ' + shortName(S.target);
      placePanel();
    } catch (err) {
      body.textContent = '';
      const e1 = document.createElement('div');
      e1.className = 'err';
      e1.textContent = '翻译失败:' + (err && err.message ? err.message : String(err));
      const rb = document.createElement('button');
      rb.className = 'retry';
      rb.textContent = '重试';
      rb.addEventListener('click', (ev) => { ev.stopPropagation(); translate(); });
      body.appendChild(e1);
      body.appendChild(rb);
    }
  }

  // ---------- 划词事件 ----------
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBtn();
    translate();
  });

  document.addEventListener('mouseup', (e) => {
    if (inUI(e)) return;
    if (!S.enabled || siteExcluded()) { hideBtn(); if (!pinned) hidePanel(); return; }
    const info = getSelectionInfo();
    if (info) {
      curSel = info;
      if (S.trigger === 'auto') { hideBtn(); translate(); }
      else showBtn();
    } else {
      hideBtn();
      if (!pinned) hidePanel();
    }
  }, true);

  document.addEventListener('keyup', (e) => {
    if (!S.enabled || siteExcluded()) return;
    const selKey = e.key === 'Shift' || ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A'));
    if (!selKey) return;
    const info = getSelectionInfo();
    if (info) {
      curSel = info;
      if (S.trigger === 'auto') translate();
      else showBtn();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideBtn(); hidePanel(); }
  }, true);

  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const sl = panel.offsetLeft, stp = panel.offsetTop;
    const move = (ev) => {
      manualPos = true;
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      panel.style.left = Math.max(0, Math.min(sl + ev.clientX - sx, vw - panel.offsetWidth)) + 'px';
      panel.style.top = Math.max(0, Math.min(stp + ev.clientY - sy, vh - panel.offsetHeight)) + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  });

  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('.ib');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') hidePanel();
    else if (act === 'pin') { pinned = !pinned; pinBtn.classList.toggle('on', pinned); }
    else if (act === 'copy' && lastResult) {
      try { await navigator.clipboard.writeText(lastResult.text); }
      catch (err) { fallbackCopy(lastResult.text); }
      flash(b, '✓');
    } else if (act === 'speak' && lastResult) {
      toggleSpeak();
    }
  });

  function flash(b, txt) {
    const orig = b.textContent;
    b.textContent = txt;
    setTimeout(() => { b.textContent = orig; }, 800);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function toggleSpeak() {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      speakBtn.textContent = '🔊';
      return;
    }
    const u = new SpeechSynthesisUtterance(lastResult.text);
    u.lang = S.target;
    u.onend = () => { speakBtn.textContent = '🔊'; };
    window.speechSynthesis.speak(u);
    speakBtn.textContent = '⏹';
  }

  function reanchor() {
    if (panel.style.display === 'block' && !pinned) {
      const r = anchorRect();
      if (r && (r.width || r.height)) placePanel();
      else hidePanel();
    }
    if (btn.style.display === 'flex') {
      const r = anchorRect();
      if (r && (r.width || r.height)) showBtn();
      else hideBtn();
    }
  }
  window.addEventListener('scroll', reanchor, { capture: true, passive: true });
  window.addEventListener('resize', reanchor);

  // ================================================================
  // B. 页面翻译(全文替换 / 对照插入)
  // ================================================================
  const ST = {
    running: false, translated: false, settingsLoaded: false,
    origNodes: new Map(),   // TextNode -> 原文
    inserted: new Set(),    // 对照模式插入的 div
    doneEls: new Set(),     // 标记过的单元元素(含 shadow DOM 内,querySelectorAll 够不到)
    obs: null, obsTimer: null, obsQueue: new Set(),
    done: 0, total: 0, applied: 0, failCount: 0
  };

  // 不翻译:表单(密码/账号/输入框)、代码、扩展自身、约定免译标记、图标字体
  // 注:aria-hidden 不再整块跳过(营销页装饰区常带 aria-hidden 但内容可见),仅在 unitOf 里跳过其中的短文本(图标字形)
  const SKIP_SEL = [
    'script', 'style', 'noscript', 'template', 'iframe', 'frame', 'object', 'embed',
    'canvas', 'svg', 'math', 'code', 'kbd', 'samp', 'var', 'pre', 'plaintext', 'listing', 'xmp',
    'input', 'textarea', 'select', 'option', 'optgroup', 'datalist', 'meter', 'progress',
    '[contenteditable]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
    '[translate="no"]', '.notranslate', '[role="textbox"]',
    '.material-icons', '.material-symbols-outlined', '.material-symbols', '.fa', '.fas', '.far', '.fab', '.fal',
    '.glyphicon', '.iconfont', '.mi', '.icons',
    '#__st_root__', '.stt-bi', '.stt-toast'
  ].join(',');

  const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CENTER', 'DETAILS', 'DIALOG', 'DIR',
    'DIV', 'DL', 'DD', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN', 'MENU', 'NAV', 'OL', 'P', 'PRE',
    'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TD', 'TH', 'TR', 'UL']);

  const isBlockEl = (el) => BLOCK.has(el.tagName);

  function skipEl(el) {
    try { return el.closest(SKIP_SEL) !== null; } catch (e) { return true; }
  }

  function visible(el) {
    try {
      if (el.getClientRects().length > 0) return true;
      // display:contents 等容器自身无盒,用内容范围判断
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getClientRects().length > 0;
    } catch (e) { return false; }
  }

  function shouldSkipText(text) {
    const t = text.trim();
    if (!t || t.length > 3000) return true;
    if (!/[\p{L}]/u.test(t)) return true;                                  // 无字母
    if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return true;                  // 纯链接
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return true;                 // 邮箱
    const target = (S.target || '').toLowerCase();
    if (target.startsWith('zh')) {
      // 含假名/谚文 → 日文/韩文,照翻(不能当"已是中文"跳过)
      if (/[\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u1100-\u11ff]/.test(t)) return false;
      // 仅当几乎全是汉字(无假名)时视为已中文跳过
      const han = (t.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
      const letters = t.replace(/[\s\d\p{P}\p{S}]/gu, '').length || 1;
      if (han >= letters * 0.3) return true;
    } else if (target === 'en' && !/[^\x00-\x7F]/.test(t)) {
      return true;   // 目标英语且纯 ASCII,无需翻
    }
    return false;
  }

  // 单元 = 一个"文本容器":子树全内联则整体一个单元(保句子完整);
  // 否则直挂文本单独成单元,再递归子元素。对照/替换都以单元为粒度。
  function collectUnits(rootEl) {
    const units = [];
    function unitOf(el, nodes) {
      const list = nodes.map(n => ({ node: n, text: n.textContent }));
      const combined = list.map(x => x.text).join('');
      if (!combined.trim() || shouldSkipText(combined)) return;
      // aria-hidden 里"标识符样"文本多为图标字体连字(如 arrow_forward),跳过;带空格/标点的真实文案照翻
      try {
        if (el.closest('[aria-hidden="true"]') && /^[A-Za-z0-9_-]+$/.test(combined.trim())) return;
      } catch (e) {}
      if (list.some(x => ST.origNodes.has(x.node))) return;   // 已翻译过
      units.push({ el, list, combined });
    }
    function hasOwnText(el) {
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
      return false;
    }
    function allInlineDeep(el) {
      for (const c of el.getElementsByTagName('*')) {
        if (isBlockEl(c) || /^(CODE|KBD|SAMP|VAR|PRE|TEXTAREA|INPUT|SELECT|SVG|MATH|IFRAME|CANVAS|BUTTON)$/.test(c.tagName)) return false;
      }
      return true;
    }
    (function walk(el) {
      if (el.nodeType === 11) {   // ShadowRoot:无 closest,直接遍历子元素
        for (const c of [...el.children]) walk(c);
        return;
      }
      if (skipEl(el)) return;
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-stt-done')) return;
      if (visible(el)) {
        if (allInlineDeep(el)) {
          const nodes = [];
          const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = tw.nextNode())) nodes.push(n);
          if (nodes.some(x => x.textContent.trim())) unitOf(el, nodes);
          return;
        }
        if (hasOwnText(el)) unitOf(el, [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()));
      }
      for (const c of [...el.children]) walk(c);
      // 穿透 open shadow DOM(自定义组件内的文本默认走不到)
      if (el.shadowRoot) walk(el.shadowRoot);
    })(rootEl);
    return units;
  }

  function estUrlLen(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) < 128 ? 1 : 9;   // CJK 经 encodeURIComponent 约 9 字符
    return n;
  }

  function chunkUnits(units) {
    const out = [];
    let cur = [], raw = 0, enc = 0;
    for (const u of units) {
      const t = u.combined.replace(/\s+/g, ' ').trim();
      const r = t.length, e = estUrlLen(t);
      if (r > 1500) {
        if (cur.length) { out.push(cur); cur = []; raw = 0; enc = 0; }
        out.push([u]);
        continue;
      }
      if (cur.length && (raw + r > 1200 || enc + e > 4800 || cur.length >= 40)) {
        out.push(cur); cur = []; raw = 0; enc = 0;
      }
      cur.push(u); raw += r; enc += e;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  // 译文按字符比例分配回各文本节点,链接/加粗等内联结构原样保留;
  // 字号统一:字号明显偏小的节点(角标/小字注)保留原文不参与分配,避免译文"有大有小"
  const fontSizeCache = new WeakMap();
  function fontSizeOf(el) {
    let v = fontSizeCache.get(el);
    if (v === undefined) {
      try { v = parseFloat(getComputedStyle(el).fontSize) || 16; } catch (e) { v = 16; }
      fontSizeCache.set(el, v);
    }
    return v;
  }

  function applyReplace(unit, trans) {
    if (unit.list.some(x => ST.origNodes.has(x.node))) return;   // 已处理过(二分重试会重复到达)
    const contents = unit.list.filter(x => x.text.trim());
    if (!contents.length || !trans || !trans.trim()) return;
    for (const x of unit.list) ST.origNodes.set(x.node, x.text);   // 空白节点保持原样
    let maxSize = 0;
    const sizes = contents.map(x => fontSizeOf(x.node.parentElement || unit.el));
    sizes.forEach(s => { if (s > maxSize) maxSize = s; });
    const normal = [], weights = [];
    contents.forEach((x, i) => {
      if (sizes[i] >= maxSize * 0.7) { normal.push(x); weights.push(Math.max(x.text.trim().length, 1)); }
    });
    const targets = normal.length ? normal : contents;
    const w = normal.length ? weights : contents.map(x => Math.max(x.text.trim().length, 1));
    const total = w.reduce((a, b) => a + b, 0);
    let idx = 0;
    targets.forEach((x, i) => {
      let part;
      if (i === targets.length - 1) part = trans.slice(idx);
      else {
        const n = Math.round(trans.length * w[i] / total);
        part = trans.slice(idx, idx + n);
        idx += n;
      }
      try { x.node.textContent = part; } catch (e) {}
    });
    unit.el.setAttribute('data-stt-done', '1');
    ST.doneEls.add(unit.el);
    ST.applied++;
  }

  // 对照模式:原文不动,译文块插在旁边(继承字体/行高/对齐,保排版)
  function applyBilingual(unit, trans) {
    if (unit.list.some(x => ST.origNodes.has(x.node))) return;
    if (!trans || !trans.trim()) return;
    const el = unit.el;
    const div = document.createElement('div');
    div.className = 'stt-bi';
    div.textContent = trans;
    const tag = el.tagName;
    const orphan = [...el.children].some(c => isBlockEl(c));
    if (tag === 'TD' || tag === 'TH' || tag === 'LI' || tag === 'DD' || tag === 'DT' || orphan) el.appendChild(div);
    else el.after(div);
    ST.inserted.add(div);
    el.setAttribute('data-stt-done', '1');
    ST.doneEls.add(el);
    ST.applied++;
  }

  function ensurePageStyle() {
    if (document.getElementById('stt-page-style')) return;
    const st = document.createElement('style');
    st.id = 'stt-page-style';
    st.textContent =
      '.stt-bi{display:block;margin:.3em 0 .55em;padding-left:.6em;border-left:3px solid rgba(79,124,255,.45);' +
      'font-size:inherit;line-height:inherit;color:inherit;opacity:.92;white-space:pre-wrap;word-break:break-word;}' +
      '.stt-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(20,22,26,.85);' +
      'color:#fff;padding:8px 14px;border-radius:8px;font:13px/1.4 system-ui,"Microsoft YaHei",sans-serif;' +
      'z-index:2147483647;pointer-events:none;}';
    (document.head || document.documentElement).appendChild(st);
  }

  function showToast(text) {
    ensurePageStyle();
    const t = document.createElement('div');
    t.className = 'stt-toast';
    t.textContent = text;
    (document.body || document.documentElement).appendChild(t);
    setTimeout(() => { try { t.remove(); } catch (e) {} }, 2600);
  }

  function report(phase, done, total) {
    if (window.top !== window) return;
    try { chrome.runtime.sendMessage({ type: 'page-progress', phase, done, total }).catch(() => {}); } catch (e) {}
  }

  // 整批失败时二分拆半重试,直到单条,最大化成功率
  async function translateSplit(units) {
    if (!units.length) return;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'translate-batch',
        texts: units.map(u => u.combined.replace(/\s+/g, ' ').trim())
      });
      if (!res || !res.ok) throw new Error(res && res.error || '批量翻译失败');
      for (let i = 0; i < units.length; i++) {
        const t = (res.items && res.items[i] && res.items[i].text || '').trim();
        if (!t) throw new Error('第 ' + (i + 1) + ' 行译文为空');
        const u = units[i];
        if (S.mode === 'bilingual') applyBilingual(u, t);
        else applyReplace(u, t);
      }
    } catch (e) {
      if (units.length === 1) { ST.failCount = (ST.failCount || 0) + 1; return; }
      const mid = units.length >> 1;
      await translateSplit(units.slice(0, mid));
      await translateSplit(units.slice(mid));
    }
  }

  async function translateUnits(units) {
    for (const b of chunkUnits(units)) await translateSplit(b);
  }

  async function startPage() {
    if (!S.enabled || siteExcluded()) return;
    if (ST.running || ST.translated) return;
    if (S.mode === 'selection') {
      showToast('当前是划词模式;点工具栏图标切换为「全文」或「对照」模式');
      return;
    }
    ensurePageStyle();
    const rootEl = document.body || document.documentElement;
    let units = collectUnits(rootEl).filter(u => visible(u.el)).slice(0, 3000);
    if (!units.length) { showToast('未发现可翻译的文本'); report('error'); return; }
    ST.running = true;
    ST.done = 0; ST.total = units.length; ST.applied = 0; ST.failCount = 0;
    report('start', 0, ST.total);
    await translateUnits(units);
    ST.done = ST.total;
    ST.running = false;
    ST.translated = true;
    if (ST.applied === 0) {
      showToast('翻译失败:' + ST.failCount + ' 处全部失败,检查网络后重试');
      report('error');
    } else {
      showToast(ST.failCount ? `翻译完成:${ST.applied} 处成功,${ST.failCount} 处失败` : `已翻译 ${ST.applied} 处`);
      report('done', ST.done, ST.total);
    }
    startObserver();
  }

  // silent:不弹 toast;reloadAuto:'skip' 还原后不自动翻 / 'force' 重排后强制自动翻
  function restorePage(silent, reloadAuto) {
    if (ST.obs) { ST.obs.disconnect(); ST.obs = null; }
    clearTimeout(ST.obsTimer);
    ST.obsQueue.clear();
    // 先统计引用存活:SPA 重渲染会让旧文本节点全部失效,原地还原无从谈起,改用刷新恢复原文
    let totalN = 0, attachedN = 0;
    for (const n of ST.origNodes.keys()) {
      totalN++;
      try { if (n.isConnected) attachedN++; } catch (e) {}
    }
    if (totalN > 0 && attachedN < totalN * 0.3) {
      try { sessionStorage.setItem(reloadAuto === 'force' ? '__stt_force_auto__' : '__stt_skip_auto__', '1'); } catch (e) {}
      location.reload();
      return;
    }
    for (const [n, txt] of ST.origNodes) {
      try { n.textContent = txt; } catch (e) {}
    }
    ST.origNodes.clear();
    for (const d of ST.inserted) { try { d.remove(); } catch (e) {} }
    ST.inserted.clear();
    for (const el of ST.doneEls) { try { el.removeAttribute('data-stt-done'); } catch (e) {} }
    ST.doneEls.clear();
    document.querySelectorAll('[data-stt-done]').forEach(el => el.removeAttribute('data-stt-done'));
    ST.translated = false;
    ST.running = false;
    ST.done = 0; ST.total = 0; ST.applied = 0; ST.failCount = 0;
    if (!silent) showToast('已还原本页');
    report('idle');
  }

  // 新增内容(无限滚动/翻页/SPA 换字)自动跟进翻译
  function startObserver() {
    if (ST.obs) return;
    ST.obs = new MutationObserver((muts) => {
      if (!ST.translated || ST.running) return;
      for (const m of muts) {
        if (m.type === 'characterData') {
          if (m.target && m.target.parentElement) ST.obsQueue.add(m.target.parentElement);
          continue;
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) {   // SPA 常用整节点换文本,别漏
            if (n.parentElement) ST.obsQueue.add(n.parentElement);
            continue;
          }
          if (n.nodeType !== 1) continue;
          if (n.id === ROOT_ID || (n.classList && (n.classList.contains('stt-bi') || n.classList.contains('stt-toast')))) continue;
          ST.obsQueue.add(n);
        }
      }
      clearTimeout(ST.obsTimer);
      ST.obsTimer = setTimeout(processQueue, 600);
    });
    ST.obs.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  let processing = false;
  async function processQueue() {
    if (processing || !ST.translated || ST.running) return;
    const nodes = [...ST.obsQueue].slice(0, 100);
    ST.obsQueue.clear();
    if (!nodes.length) return;
    processing = true;
    ST.failCount = ST.failCount || 0;
    try {
      const units = [];
      for (const n of nodes) {
        if (!n.isConnected || (n.closest && n.closest('#__st_root__,.stt-bi'))) continue;
        units.push(...collectUnits(n));
      }
      const usable = units.filter(u => visible(u.el)).slice(0, 200);
      if (usable.length) {
        const before = ST.applied;
        await translateUnits(usable);
        if (window.top === window && ST.applied > before) report('step', 0, 0);
      }
    } finally {
      processing = false;
      if (ST.obsQueue.size) setTimeout(processQueue, 100);
    }
  }

  // 补翻遗漏:重新收集未翻译单元(已翻的自动跳过),一键补齐晚渲染/漏网内容
  async function fillMissing() {
    if (!ST.translated || ST.running) return;
    ST.running = true;
    try {
      const rootEl = document.body || document.documentElement;
      const units = collectUnits(rootEl).filter(u => visible(u.el)).slice(0, 3000);
      if (!units.length) { showToast('没有发现遗漏,已全部翻译'); return; }
      const before = ST.applied;
      ST.failCount = 0;
      await translateUnits(units);
      showToast(ST.applied > before
        ? `补翻 ${ST.applied - before} 处` + (ST.failCount ? `,仍失败 ${ST.failCount} 处` : '')
        : '本轮没有可补翻的内容,稍后页面更新会自动翻');
    } finally {
      ST.running = false;
    }
  }

  // ---------- 页面翻译消息 ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'translate-selection') {
      if (!S.enabled || siteExcluded()) return;
      const info = getSelectionInfo();
      if (info) { curSel = info; translate(); }
    } else if (msg && msg.type === 'page-get-state') {
      sendResponse({ supported: true, translated: ST.translated, running: ST.running, done: ST.done, total: ST.total, failed: ST.failCount || 0 });
    } else if (msg && msg.type === 'page-translate') {
      if (ST.translated || ST.running) { sendResponse({ ok: true, state: 'translated' }); return; }
      startPage().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true;
    } else if (msg && msg.type === 'page-fill') {
      fillMissing().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true;
    } else if (msg && msg.type === 'page-restore') {
      restorePage();
      sendResponse({ ok: true });
    } else if (msg && msg.type === 'page-restyle') {
      // 已翻译状态下切换全文↔对照:静默还原后立刻按新模式重翻整页
      (async () => {
        const wasTranslated = ST.translated;
        if (wasTranslated || ST.running) restorePage(true, 'force');
        if (wasTranslated && !ST.running) await startPage();
        sendResponse({ ok: true });
      })();
      return true;
    } else if (msg && msg.type === 'page-toggle') {
      (ST.translated || ST.running) ? restorePage() : startPage();
      sendResponse({ ok: true });
    }
  });
})();
