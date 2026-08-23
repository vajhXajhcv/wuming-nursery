# 更新日志

## 2026-08-23（DAO 可验证治理系统上线）

### 新增

- **DAO 治理闭环**：哈希链账本升级为「无名苗圃共同体」治理链，成员、贡献、提案、投票、决议、执行、参数变更全部上链，任何人可整链重放验证。
- **成员体系**：假名制 + ECDSA P-256 密钥对身份（`/dao/join` 浏览器生成），公钥上链，投票签名任何人可独立验签。
- **贡献双轨**：资金（`ledger#<seq>` 交叉引用收入记录）与劳动贡献核定上链，折算贡献点作为投票权重。
- **提案治理**：spend/text/param 三类提案，50 点提案门槛、7 天投票期、20% 法定人数、简单多数、权重按提案高度快照。
- **页面**：`/dao` 总览、`/dao/charter` 章程、`/dao/members` 成员、`/dao/join` 加入、`/dao/proposals` 提案列表、`/dao/proposal` 详情与投票、`/dao/propose` 发起、`/dao/admin` 创始人控制台。
- **脚本**：`scripts/anchor-ots.mjs`（链头锚定比特币 OpenTimestamps）、`scripts/verify-chain.mjs`（独立整链校验）。
- **文档**：`DAO.md` 治理架构与运营手册。

### 调整

- 链记录格式扩展可选 `data` 负载参与哈希（旧 income/expense 记录哈希不变）；`src/lib/dao-core.ts` 成为浏览器与服务端共用的单源校验核心。
- 主导航新增 DAO 下拉；`/ledger` 页验链改用共享核心，说明文案补充治理事件类型。

### 新增

- **博客文章**：
  - 《从博客到产品站：我的网站商业化重构记录》
  - 《docx-formatter-cn 更新：在线 Markdown 转 Word 与期刊模板》
- **笔记文章**：
  - 《Cloudflare Pages 构建失败排查：本地路径如何搞砸线上部署》

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
