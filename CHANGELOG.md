# 更新日志

## 2026-07-20（修复 Cloudflare Pages 构建失败）

### 修复

- **构建脚本容错**：`scripts/build-kaoyan.js` 与 `scripts/build-triworld.js` 在本地子项目目录不存在时改为警告并跳过，不再导致 CI 构建失败；同时支持通过 `KAOYAN_APP_PATH` / `TRIWORLD_APP_PATH` 环境变量覆盖路径。
- **Cloudflare Pages 部署**：修复后重新推送，`wumingmp.me` 可正常部署商业化新版。

## 2026-07-20（网站商业化升级）

### 新增

- **产品工具总览页**：新建 `/tools`，以 docx-formatter-cn 为主打产品，聚合在线工具、文档、定价与实验项目入口。
- **自留区概念**：在 `/blog`、`/notes`、`/about` 页面顶部增加「🌱 自留区」标识，明确区分个人创作空间与商业主线。

### 调整

- **导航重构**：Header 与 Footer 改为「产品 / 服务 / 自留区」三分结构，主导航从 10 项压缩为 6 项，产品区支持下拉菜单。
- **首页改造**：Hero 区增加产品 CTA，新增「主打产品」section，服务与自留区入口更清晰。
- **CTA 链路打通**：docx-formatter-cn 项目页、定价页、服务页的按钮与链接统一指向「在线试用 / 产品主页 / 文档 / 定价」。

## 2026-07-20

### 新增

### 新增

- **在线 Markdown 转 Word 工具**：`/tools/md2docx` 支持在浏览器内直接转换，基于 Pyodide 本地运行，文档内容不上传服务器。
- **期刊 / 预印本模板**：新增 arXiv Preprint、Nature、Science、IEEE Transactions（单栏近似）、APA Manuscript 近似格式。
- **中文学位论文模板**：新增「武汉理工毕业设计」预设模板。
- **使用文档更新**：`docx-formatter-docs` 新增在线工具、期刊模板、自定义模板字段说明等章节。

### 说明

- 期刊 / 预印本模板为各平台公开排版惯例的近似实现，投稿前请对照官方模板微调。
- 在线版暂不支持本地图片路径解析；批量转换、自定义学校模板、图片处理请使用桌面 Pro 版。

## 2026-05-25

### 新增

- docx-formatter-cn 项目主页、定价页与论文排版服务页上线。
- 基于 Astro 构建项目文档与落地页。
