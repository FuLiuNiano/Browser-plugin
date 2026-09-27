# 浏览器扩展合集 (Browser Extensions)

自用本地加载的 Chrome / Edge 扩展合集(MV3)。两个插件均**零后端、零统计、零账号**,代码全部在本仓库,加载即运行你审过的代码。

| 插件 | 版本 | 功能 | 下载 |
|---|---|---|---|
| [划词翻译](select-translate/) | v1.2.2 | 划词翻译 + 一键全文/对照翻译,Google 双端点自动兜底 MyMemory | [dist/select-translate-v1.2.2.zip](dist/select-translate-v1.2.2.zip) |
| [本地 Cookie 编辑器](local-cookie-editor/) | v1.0.0 | 纯本地 Cookie 查看/导出 JSON/导入,零联网,按站点授权 | [dist/local-cookie-editor-v1.0.0.zip](dist/local-cookie-editor-v1.0.0.zip) |

## 安装(Edge,Chrome 同理)

1. 下载 `dist/` 里的 ZIP 并解压(或直接用仓库里的源码目录)
2. 打开 `edge://extensions` → 左下角开启「开发人员模式」
3. 点「加载解压缩的扩展」,选择对应目录
4. 建议在工具栏拼图菜单里固定图标

## 划词翻译 v1.2.2

- 三种模式:🔍 划词(选中出译文面板)/ 🌐 全文(替换原文)/ 📑 对照(原文不动,译文插在旁边)
- 打开页面自动实时翻译(可关);无限滚动、SPA 换字自动跟进
- `Alt+P` 翻译/还原本页,`Alt+T` 划词翻译,右键菜单入口
- 隐私设计:表单/密码框/账号输入框/contenteditable/代码块一律不碰;图标字体连字、约定免译(`notranslate`)自动跳过
- 排版:替换模式按字号分组回填保内联结构,对照模式完全继承原文样式
- 翻译接口:Google `translate_a/single` → Google `dict-chrome-ex` → MyMemory 三级兜底(接口均实测),无任何密钥
- 详见 [select-translate/README.md](select-translate/README.md)

## 本地 Cookie 编辑器 v1.0.0

- 纯本地:零联网代码、无后台进程,数据只去屏幕、剪贴板和本地文件
- 按站点授权(`optional_host_permissions`),你亲手点、可撤销
- 查看 / 搜索(支持打码状态过滤)/ 导出 JSON(与 [Cookie-Editor](https://cookie-editor.com) 格式兼容)/ 导入
- 详见 [local-cookie-editor/README.md](local-cookie-editor/README.md)

## 隐私说明

- 两个扩展均不包含任何遥测、上报或第三方脚本;发布前经审计:无个人标识、无密钥、无测试数据残留
- 划词翻译仅访问三个公共翻译接口(见上),Cookie 编辑器完全离线
- 图标均为仓库内脚本本地生成,无外部素材

## 目录结构

```
├── README.md                  本文件
├── LICENSE                    MIT
├── dist/                      打包好的发布 ZIP
│   ├── select-translate-v1.2.2.zip
│   └── local-cookie-editor-v1.0.0.zip
├── select-translate/          划词翻译源码
└── local-cookie-editor/       本地 Cookie 编辑器源码
```

## 本地开发

- 图标重新生成:`python select-translate/tools/make_icons.py`(需 Pillow)/ `powershell -File local-cookie-editor/scripts/make-icons.ps1`
- 翻译分句映射自测:`node select-translate/tools/test-mapping.js`
- 改完代码后在 `edge://extensions` 点「重新加载」即可生效

## License

[MIT](LICENSE)
