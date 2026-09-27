# 本地 Cookie 编辑器（Local Cookie Editor）

一个**纯本地**的 Cookie 查看 / 导出 JSON / 导入浏览器扩展（Chrome / Edge，Manifest V3）。
设计目标只有一个：**你可以亲手验证它不会把任何数据发到任何地方。**

---

## 为什么你可以信任它

### 1. 运行的就是你眼前的文件
本扩展**不从商店安装**，而是用“加载已解压的扩展程序”方式从本目录加载。
浏览器运行的就是目录里这几个文件本身——不存在“商店里重新打包、夹带私货”的环节。
随时可以改动文件后在 `chrome://extensions` 点“重新加载”验证行为变化。

### 2. 全项目没有任何联网代码
没有 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、`EventSource`，
也没有任何外部资源（连字体、图标都是本地文件）。

自己验证（在本目录执行）：

```bash
# Git Bash —— 命中的只会是 popup.js 顶部“隐私约束”注释本身（它在罗列这些 API 名），
# 代码里没有任何一处实际调用。
grep -rniE "fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource" --include="*.js" --include="*.html" --include="*.css" .
```

```powershell
# PowerShell —— 同上
Get-ChildItem -Recurse -Include *.js,*.html,*.css | Select-String -Pattern "fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource"
```

再查一遍所有出现的网址字面量：

```bash
grep -rniE "https?://" --include="*.js" --include="*.html" --include="*.css" .
```

这条**只会命中 `popup.js` 的 3 行**：1 行是顶部注释的说明文字，另外 2 行是
`setCookie` 和 `cookieUrl`——那是拼给 Chrome `cookies` API 看的 URL 参数
（告诉浏览器“这个 Cookie 属于哪个域”），字符串本身哪里也不会去，不是网络请求。

### 3. 权限最小、按站点授权、随时可撤
- 内置权限只有两个：`cookies`（Cookie API 的开关）和 `activeTab`（让你点图标时能读到当前标签页的网址）。
- 对具体网站的访问权是**可选权限**：你点“授权本站访问”后，浏览器才会授予
  **该站点及其子域名**，其他任何站点扩展都读不到。
- 弹窗里有“移除本站权限”按钮；也可以在 `chrome://extensions` → 本扩展 → 详情 → 权限里管理。
- 扩展**永远不会**申请“所有网站”的一揽子权限。

### 4. 数据只去三个地方
弹窗屏幕、你点“复制 JSON”时的系统剪贴板、你点“导出文件”时浏览器生成的本地 `.json` 文件。
没有存储权限（连 `storage` 都没申请），没有后台进程（没有 service worker，
弹窗一关扩展就完全不运行），没有内容脚本。

### 5. 代码量足够小，10 分钟能读完
| 文件 | 说明 |
|---|---|
| `manifest.json` | 权限与入口声明，先看这里 |
| `popup.js` | **唯一逻辑文件**，约 400 行，顶部注释标明了所有隐私约束 |
| `popup.html` / `popup.css` | 界面结构/样式，无外部资源 |
| `scripts/make-icons.ps1` | 图标是本地生成的，可重新运行验证 |
| `icons/*.png` | 上述脚本生成的图片 |

---

## 安装（Chrome / Edge）

1. 地址栏打开 `chrome://extensions`（Edge 是 `edge://extensions`）
2. 打开右上角（Edge 在左侧）的**开发者模式**
3. 点**加载已解压的扩展程序**，选择本目录（`manifest.json` 所在的文件夹）
4. 点浏览器工具栏的拼图图标，把“本地 Cookie 编辑器”**固定**到工具栏

## 使用

- 打开任意网站 → 点工具栏图标
- 第一次使用点 **授权本站访问**（浏览器会再确认一次；一次授权 = 该站点及其子域名）
- 列表默认**打码显示 Cookie 值**，点右上角 👁 显示；点某条可展开完整属性
- **复制 JSON / 导出文件**：导出当前站点的全部 Cookie
- **导入**：粘贴单个对象或数组；“合并导入”叠加，“清空后导入”先删本站全部 Cookie
- **删除全部**：需连点两次确认；单条 Cookie 在展开详情里删
- 搜索框按名称/值过滤（打码状态下值过滤仍然生效）

## 导出格式

与 [Cookie-Editor](https://cookie-editor.com) 的 JSON 互相兼容：

```json
[
  {
    "domain": ".example.com",
    "expirationDate": 1790000000.123,
    "hostOnly": false,
    "httpOnly": true,
    "name": "session",
    "path": "/",
    "sameSite": "lax",
    "secure": true,
    "session": false,
    "storeId": "0",
    "value": "…"
  }
]
```

## 已知边界（如实说明）

- **已授权站点的 Cookie 对扩展可见**——这是这类工具工作的前提；正因如此才做成了
  “你亲手点、按站点、可撤销”的模型，而不是一揽子全站权限。
- 不列出**分区 Cookie（CHIPS / Partitioned）**——那是第三方嵌入内容的 Cookie，
  本来也不属于当前站点的一方数据。
- 在 `chrome://`、应用商店等浏览器内部页面上不可用（这些页面没有网站 Cookie）。
- 隐身窗口默认不生效，需在扩展详情里手动勾选“允许在隐身模式下使用”。
- Firefox：本包面向 Chrome/Edge。Firefox 需在 `manifest.json` 加
  `browser_specific_settings.gecko.id` 后用 `about:debugging` 临时加载，核心 API 相同。

## 一句话总结

**从本目录加载 = 你运行你审过的代码；全项目零联网；权限按站点、可撤销；数据只落在你手里。**
