/* 本地 Cookie 编辑器 —— 唯一的逻辑文件，全部代码就在这里。
 *
 * 隐私约束（审计时先看这里）：
 * 1. 本文件不存在任何联网代码：没有 fetch / XMLHttpRequest / WebSocket /
 *    sendBeacon / EventSource，也不加载任何远程资源。
 * 2. Cookie 数据只会流向三个地方：
 *    - 弹窗界面本身；
 *    - 你点击“复制 JSON / 复制值”时写入的系统剪贴板；
 *    - 你点击“导出文件”时生成的本地下载文件。
 * 3. 对网站的 Cookie 访问权是“可选权限”：只有你点“授权本站访问”，
 *    浏览器才会授予该站点（及其子域名）的权限，且随时可撤销。
 *    本扩展永远不会主动申请“所有网站”的权限。
 * 4. 文件中出现的 "https://" / "http://" 字符串仅用于给 chrome.cookies
 *    API 拼接 URL 参数（cookieUrl / setCookie），不是网络请求。
 */

"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const $ = (id) => document.getElementById(id);

const state = {
  url: null,         // 目标页面 URL（通常是当前标签页）
  hostname: null,
  patterns: [],      // 该站点对应的主机权限模式
  cookies: [],
  filter: "",
  showValues: false,
  expandedKey: null,
  granted: false,
};

init().catch((e) => showNotice("初始化失败：" + ((e && e.message) || e)));

async function init() {
  bindEvents();

  state.url = await resolveTargetUrl();
  if (!state.url) {
    showNotice("读不到目标网页地址。请通过工具栏图标打开本扩展；调试时可在 popup.html 后加 ?url=<网页地址>。");
    return;
  }

  let u;
  try {
    u = new URL(state.url);
  } catch {
    showNotice("目标网址无法解析：" + state.url);
    return;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    showNotice("当前页面（" + u.protocol.replace(":", "") + "://…）没有可管理的网站 Cookie，请在普通网页上使用。");
    return;
  }

  state.hostname = u.hostname;
  state.patterns = hostPatternsFor(u.hostname);
  $("site-host").textContent = state.hostname;
  $("perm-scope").textContent = state.hostname;
  await refreshPermission();
}

/* ---------------- 目标与权限 ---------------- */

async function resolveTargetUrl() {
  // 调试/测试入口：popup.html?url=…，优先于当前标签页。
  const q = new URLSearchParams(location.search).get("url");
  if (q && /^https?:\/\//i.test(q)) return q;

  // activeTab：点击工具栏图标的那一刻，浏览器临时授予读取当前标签页地址的能力。
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const url = tabs && tabs[0] && tabs[0].url;
    if (url && /^https?:\/\//i.test(url)) return url;
  } catch (_) {
    /* 没有权限读取标签页地址时忽略 */
  }
  return null;
}

// 权限模式：本域 + 所有子域；主机名多于两段时附加上一级域，
// 这样本站设置的父域 Cookie（如 .example.com）在导出/导入时才拿得到。
function hostPatternsFor(hostname) {
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isIPv6 = hostname.startsWith("[");
  const bare = isIPv4 || isIPv6 || !hostname.includes(".");
  const pats = new Set();
  pats.add(bare ? "*://" + hostname + "/*" : "*://*." + hostname + "/*");
  if (!bare && hostname.split(".").length > 2) {
    pats.add("*://*." + hostname.split(".").slice(1).join(".") + "/*");
  }
  return [...pats];
}

async function refreshPermission() {
  const granted = await api.permissions.contains({ origins: state.patterns });
  updatePermRow(granted);
  if (granted) {
    await loadCookies();
  } else {
    state.cookies = [];
    renderList();
  }
}

function updatePermRow(granted) {
  state.granted = granted;
  $("perm-status").textContent = granted ? "已授权" : "未授权";
  $("perm-status").className = "chip " + (granted ? "ok" : "warn");
  $("perm-ask").classList.toggle("hidden", granted);
  $("manage").classList.toggle("hidden", !granted);
  $("btn-revoke").classList.toggle("hidden", !granted);
}

async function onGrant() {
  // permissions.request 必须发生在用户点击里；浏览器会弹出确认框，由你最终决定。
  try {
    const ok = await api.permissions.request({ origins: state.patterns });
    if (ok) {
      await refreshPermission();
      toast("已授权：" + state.hostname);
      return;
    }
    toast("未授权，无法读取该站 Cookie");
  } catch (e) {
    toast("授权失败：" + ((e && e.message) || e));
  }
}

async function onRevoke() {
  await api.permissions.remove({ origins: state.patterns });
  await refreshPermission();
  toast("已移除本站权限");
}

/* ---------------- Cookie 读取 ---------------- */

async function loadCookies() {
  try {
    // getAll({url})：取“访问该页面时会带上的 Cookie”，与浏览器实际行为一致。
    const all = await api.cookies.getAll({ url: state.url });
    all.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
    state.cookies = all;
  } catch (e) {
    showNotice("读取 Cookie 失败：" + ((e && e.message) || e));
    state.cookies = [];
  }
  renderList();
}

/* ---------------- 渲染 ---------------- */

function renderList() {
  const list = $("cookie-list");
  list.textContent = "";

  const f = state.filter.trim().toLowerCase();
  const shown = state.cookies.filter((c) =>
    !f || c.name.toLowerCase().includes(f) || String(c.value).toLowerCase().includes(f));

  $("count").textContent = f
    ? shown.length + " / " + state.cookies.length + " 条"
    : state.cookies.length + " 条";

  const emptyEl = $("empty");
  emptyEl.classList.toggle("hidden", shown.length > 0);
  emptyEl.textContent = f ? "没有匹配的 Cookie。" : "该站点没有 Cookie。";

  for (const c of shown) list.appendChild(renderRow(c));
}

function renderRow(c) {
  // 注意：所有内容一律用 textContent 写入，避免 Cookie 值被当作 HTML 注入界面。
  const key = c.name + "|" + c.path + "|" + c.domain;

  const li = document.createElement("li");
  li.className = "cookie";

  const main = document.createElement("div");
  main.className = "row-main";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = c.name;

  const val = document.createElement("span");
  val.className = "value";
  val.textContent = state.showValues ? String(c.value) : "••••••";
  val.title = state.showValues ? "" : "值已打码，点右上角眼睛按钮显示";

  main.append(name, val);
  main.addEventListener("click", () => {
    state.expandedKey = state.expandedKey === key ? null : key;
    renderList();
  });
  li.appendChild(main);

  if (state.expandedKey === key) li.appendChild(renderDetails(c));
  return li;
}

function renderDetails(c) {
  const box = document.createElement("div");
  box.className = "details";

  const attrs = [
    c.secure && "Secure",
    c.httpOnly && "HttpOnly",
    c.hostOnly && "HostOnly",
    c.partitionKey && "Partitioned",
  ].filter(Boolean).join("、");

  const rows = [
    ["值", String(c.value)],
    ["域", c.domain],
    ["路径", c.path],
    ["有效期", c.session || !c.expirationDate
      ? "会话（关浏览器即失效）"
      : new Date(c.expirationDate * 1000).toLocaleString()],
    ["SameSite", c.sameSite || "unspecified"],
    ["属性", attrs || "—"],
  ];
  for (const [k, v] of rows) {
    const r = document.createElement("div");
    r.className = "kv";
    const kk = document.createElement("span");
    kk.className = "k";
    kk.textContent = k;
    const vv = document.createElement("span");
    vv.className = "v";
    vv.textContent = v;
    r.append(kk, vv);
    box.appendChild(r);
  }

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn mini";
  copyBtn.textContent = "复制值";
  copyBtn.addEventListener("click", () => copyText(c.value, "已复制值"));

  const delBtn = document.createElement("button");
  delBtn.className = "btn mini danger";
  delBtn.textContent = "删除";
  delBtn.addEventListener("click", async () => {
    await api.cookies.remove(removeParams(c));
    await loadCookies();
    toast("已删除 " + c.name);
  });

  actions.append(copyBtn, delBtn);
  box.appendChild(actions);
  return box;
}

/* ---------------- 导出 ---------------- */

// Cookie-Editor 兼容的 JSON 格式，键名与键序与其导出一致，可互相导入。
function exportOne(c) {
  const base = { domain: c.domain };
  if (c.expirationDate != null) base.expirationDate = c.expirationDate;
  return {
    ...base,
    hostOnly: !!c.hostOnly,
    httpOnly: !!c.httpOnly,
    name: c.name,
    path: c.path,
    sameSite: c.sameSite || "unspecified",
    secure: !!c.secure,
    session: !!c.session,
    storeId: c.storeId ?? null,
    value: c.value,
  };
}

function exportData() {
  return state.cookies.map(exportOne);
}

async function onCopyJson() {
  if (!state.cookies.length) {
    toast("没有可导出的 Cookie");
    return;
  }
  await copyText(JSON.stringify(exportData(), null, 2), "已复制 " + state.cookies.length + " 条 JSON");
}

async function onExportFile() {
  if (!state.cookies.length) {
    toast("没有可导出的 Cookie");
    return;
  }
  const json = JSON.stringify(exportData(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.hostname + "-cookies-" + timestamp() + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("已导出文件");
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}

/* ---------------- 导入 ---------------- */

function openImport() {
  $("dialog").classList.remove("hidden");
  $("import-text").value = "";
  $("import-text").focus();
}

function closeDialog() {
  $("dialog").classList.add("hidden");
}

function parseImport(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  const out = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("条目必须是对象");
    }
    if (typeof raw.name !== "string" || !raw.name) {
      throw new Error("条目缺少 name 字段");
    }
    out.push({
      name: raw.name,
      value: typeof raw.value === "string" ? raw.value : "",
      domain: typeof raw.domain === "string" ? raw.domain : undefined,
      path: typeof raw.path === "string" ? raw.path : undefined,
      secure: !!raw.secure,
      httpOnly: !!raw.httpOnly,
      hostOnly: !!raw.hostOnly,
      session: !!raw.session,
      expirationDate: typeof raw.expirationDate === "number" ? raw.expirationDate : undefined,
      sameSite: normSameSite(raw.sameSite),
    });
  }
  return out;
}

function normSameSite(v) {
  const s = String(v == null ? "" : v).toLowerCase();
  if (s === "none" || s === "no_restriction") return "no_restriction";
  if (s === "lax") return "lax";
  if (s === "strict") return "strict";
  return "unspecified";
}

async function runImport(replaceFirst) {
  let items;
  try {
    items = parseImport($("import-text").value);
  } catch (e) {
    toast("JSON 解析失败：" + ((e && e.message) || e));
    return;
  }
  if (!items.length) {
    toast("没有可导入的条目");
    return;
  }

  if (replaceFirst) {
    const all = await api.cookies.getAll({ url: state.url });
    for (const c of all) await api.cookies.remove(removeParams(c));
  }

  let ok = 0;
  let fail = 0;
  for (const item of items) {
    try {
      await setCookie(item);
      ok++;
    } catch (_) {
      fail++; // 常见原因：目标域名未授权、SameSite=None 未开 Secure、过期时间已过
    }
  }
  closeDialog();
  await loadCookies();
  toast("导入成功 " + ok + " 条" + (fail ? "，失败 " + fail + " 条（域名未授权或参数不合法）" : ""));
}

async function setCookie(c) {
  const host = (c.domain || state.hostname).replace(/^\./, "");
  const details = {
    url: (c.secure ? "https://" : "http://") + host + (c.path || "/"),
    name: c.name,
    value: c.value,
    path: c.path || "/",
    secure: c.secure,
    httpOnly: c.httpOnly,
    // SameSite=None 必须搭配 Secure，否则浏览器会拒绝；这里退回 Lax 并计入结果。
    sameSite: c.sameSite === "no_restriction" && !c.secure ? "lax" : c.sameSite,
  };
  if (!c.hostOnly && c.domain) details.domain = c.domain;
  if (!c.session && typeof c.expirationDate === "number") details.expirationDate = c.expirationDate;

  const res = await api.cookies.set(details);
  if (!res) throw new Error("写入被浏览器拒绝");
  return res;
}

/* ---------------- 删除 ---------------- */

// cookies.remove / set 都需要 URL 参数；用 Cookie 自身的域和路径来拼。
// 注意这仍是拼给 cookies API 的参数字符串，不是网络请求。
function cookieUrl(c) {
  return (c.secure ? "https://" : "http://") + c.domain.replace(/^\./, "") + (c.path || "/");
}

function removeParams(c) {
  const p = { url: cookieUrl(c), name: c.name };
  if (c.partitionKey) p.partitionKey = c.partitionKey;
  return p;
}

let delAllArmed = false;
async function onDeleteAll() {
  if (!delAllArmed) {
    delAllArmed = true;
    $("btn-delall").textContent = "再点一次确认删除";
    setTimeout(() => {
      delAllArmed = false;
      $("btn-delall").textContent = "删除全部";
    }, 3000);
    return;
  }
  delAllArmed = false;
  $("btn-delall").textContent = "删除全部";

  const all = await api.cookies.getAll({ url: state.url });
  for (const c of all) await api.cookies.remove(removeParams(c));
  await loadCookies();
  toast("已删除 " + all.length + " 条");
}

/* ---------------- 通用 ---------------- */

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(okMsg || "已复制");
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function showNotice(msg) {
  const n = $("notice");
  n.textContent = msg;
  n.classList.remove("hidden");
}

function bindEvents() {
  $("search").addEventListener("input", (e) => {
    state.filter = e.target.value;
    renderList();
  });

  $("btn-eye").addEventListener("click", () => {
    state.showValues = !state.showValues;
    $("btn-eye").textContent = state.showValues ? "🙈" : "👁";
    renderList();
  });

  $("btn-refresh").addEventListener("click", async () => {
    await loadCookies();
    toast("已刷新");
  });

  $("btn-grant").addEventListener("click", onGrant);
  $("btn-revoke").addEventListener("click", onRevoke);
  $("btn-copy").addEventListener("click", onCopyJson);
  $("btn-file").addEventListener("click", onExportFile);
  $("btn-import").addEventListener("click", openImport);
  $("btn-dialog-close").addEventListener("click", closeDialog);
  $("btn-import-add").addEventListener("click", () => runImport(false));
  $("btn-import-replace").addEventListener("click", () => runImport(true));
  $("btn-delall").addEventListener("click", onDeleteAll);

  $("dialog").addEventListener("click", (e) => {
    if (e.target.id === "dialog") closeDialog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDialog();
  });
}
