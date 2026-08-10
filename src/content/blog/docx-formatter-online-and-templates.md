---
title: "docx-formatter-cn 更新：在线 Markdown 转 Word 与期刊模板"
description: "docx-formatter-cn 推出浏览器在线版 /tools/md2docx，并新增 arXiv、Nature、Science、IEEE、APA 等期刊/预印本近似格式模板。"
pubDate: 2026-07-20
heroImage: ../../assets/blog-covers/docx-formatter-online-and-templates.png
tags: ["docx-formatter-cn", "工具", "Markdown", "论文排版"]
---

# docx-formatter-cn 更新：在线 Markdown 转 Word 与期刊模板

docx-formatter-cn 最近完成了两个重要更新：

1. **浏览器在线版** `/tools/md2docx` 上线，无需安装任何软件即可转换。
2. **期刊 / 预印本模板**扩容，覆盖中英文常见投稿格式。

## 一、在线版：浏览器里跑 Python

在线工具基于 [Pyodide](https://pyodide.org/) 实现。它把 CPython 编译成 WebAssembly，让 Python 代码直接在浏览器里执行。好处很明显：

- **不上传服务器**：你的 Markdown 内容不会离开本机。
- **无需安装**：打开网页就能用，Windows / macOS / Linux 通吃。
- **自动加载依赖**：第一次使用时下载 Python 运行时和必要 wheel，后续可缓存。

实现上，我们把运行时指向了 jsDelivr CDN：

```js
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/';
```

仓库里只保留了自己构建的几个 wheel（`python-docx`、`latex2mathml`、`docx_formatter_cn`），每个只有几十到两百 KB，不存在 Cloudflare Pages 25 MiB 单文件上限的问题。

## 二、新增模板

除了原来的「毕业论文」「课程论文」「数学建模」「公文」等中文模板，又增加了：

| 模板 | 适用场景 |
|------|----------|
| arXiv Preprint | arXiv 投稿预印本 |
| Nature | Nature 系列近似格式 |
| Science | Science 系列近似格式 |
| IEEE Transactions（单栏近似） | IEEE 期刊/会议论文 |
| APA Manuscript | 心理学/社会科学 APA 格式 |
| 武汉理工毕业设计 | 中文学位论文具体学校模板 |

这些模板是各平台公开排版惯例的**近似实现**，投稿前请务必对照官方最新模板微调。

## 三、在线版 vs Pro 桌面版

| 功能 | 在线版 | Pro 桌面版 |
|------|--------|------------|
| Markdown 转 Word | ✅ | ✅ |
| LaTeX 公式转 OMML | ✅ | ✅ |
| 三线表 | ✅ | ✅ |
| 期刊 / 学位模板 | ✅ | ✅ |
| 本地图片路径解析 | ❌ | ✅ |
| 批量转换 | ❌ | ✅ |
| 自定义学校模板 | ❌ | ✅ |
| 离线使用 | ❌ | ✅ |

在线版适合快速体验和小文件转换；有图片、批量或自定义模板需求时，建议升级到 Pro 桌面版。

## 四、技术细节

模板以 JSON 文件形式放在 `public/tools/md2docx/templates/`，前端根据用户选择动态拉取：

```js
const tplUrl = '/tools/md2docx/templates/' + templateName + '.json';
```

这样新增模板时，只需要往目录里放一个 JSON 文件并更新下拉选项，不需要重新打包整个站点。

## 五、下一步

- 接入更多国内高校模板（清华、北大、中科大等）
- 增加引用管理（BibTeX / CSL）
- 在线版支持图片拖拽上传并内嵌到 Word

如果你需要某个特定期刊或学校的模板，欢迎在 [GitHub](https://github.com/vajhXajhcv/wuming-nursery) 开 Issue 告诉我。
