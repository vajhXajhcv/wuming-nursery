# 更新日志

## 2026-09-03（服务定价融合 + 转化漏斗 + 锚定自动化）

### 新增

- **付费转化漏斗**：`functions/api/track.ts` 匿名事件统计（白名单事件按天计数存 ORDERS KV，不收集 IP/UA）；Paywall 组件埋点（`paywall_view` / `alipay_click` / `afdian_click` / `redeem_click`，sendBeacon 上报、失败静默）；`/dao/admin` 新增「转化漏斗」面板（累计数、view→click 转化率、近 7 天趋势）。
- **锚定自动化**：`.github/workflows/anchor-ots.yml`，每周一 03:17 UTC 自动执行 `scripts/anchor-ots.mjs`（锚定新链头 + 升级待定证明），变更由 github-actions[bot] 提交回仓库；配置 `ADMIN_TOKEN` secret 后同时把锚定事件写回链上。
- **首次链头锚定**：seq 2 已通过 OpenTimestamps 提交至 alice 日历（finney 日历本地网络不可达，交由 CI 补齐），证明文件在 `/dao/anchors/`。
- **博客文章**：《网站阶段总结：支付、账本与组织》。
- **DAO 招募区**：`/dao` 新增「为什么加入」板块（决策权 / 贡献留痕 / 成员免费读 / 假名制 + 诚实声明 + CTA），`/dao/join` 页头补充成员权益说明；运营手册补充成员批准后发放订阅令牌的流程。

### 调整

- **服务与定价页面融合**：`/services` 合并原定价页内容（`#pricing` 锚点），三语言同步；`/pricing`（zh/en/ja）改为 301/重定向页；导航合并为单一「服务与定价」入口；全站 `/pricing` 内部引用清理完毕。
- 账本页锚定说明从「后续计划」更新为已锚定（指向 /dao 锚定历史）。

### 移除（暂时）

- **评论区前端下线**：`BlogPost.astro` 中评论组件改为注释（后端 `/api/comments` 尚未部署生效，避免读者看到无法提交的留言框）；后端代码与组件保留，重新开放时取消注释并部署即可。

## 2026-08-28（前端设计系统收敛 + DAO 页面重构 + 自建评论系统）

### 新增

- **设计令牌扩展**：`src/styles/global.css` 新增语义色 `--c-ok/--c-err/--c-warn`、字号阶梯 `--text-*`、间距阶梯 `--space-*`。
- **全局 UI 类库** `src/styles/ui.css`：`.card`、`.btn`/`.btn-primary`/`.btn-outline`、`.badge`、`.stat-card`、`.empty`、`.input`/`.textarea`、`.table`，由 BaseHead 全站引入。
- **DAO 前端共享层** `src/lib/dao-ui.ts`：`loadChain()`（拉链 + 验链 + 重放 + 页面级缓存）、`apiPost()`、格式化助手、成员密钥签名助手；`src/components/dao/` 共享组件：StatCards、ChainStatus、VoteBar、ProposalCards、MemberGate。

### 调整

- **DAO 与账本页面重构**：8 个 DAO 页面 + 2 个 ledger 页面换用共享层，删除每页重复的语义色块与助手函数（净减约 1200 行），统一补齐加载/错误/空三态；链格式、签名消息、localStorage key、URL 参数全部不变。
- **营销页收敛**：首页/定价/服务/工具/联系/Paywall 等 9 个页面组件删除重复的按钮/卡片/表单样式，改引全局类（净减约 500 行），视觉保持不变。
- **视觉刷新**：Header 下拉菜单统一面板样式并加出现动画；首页 hero 间距节奏 token 化；可点击卡片统一 hover 微动效。
- 暗色下 `.btn-primary` 改为深色文字，修复浅紫底白字对比度不足。

### 修复

- DAO 页面 JS 动态渲染的内容（提案卡、投票条、贡献榜、锚定行）此前因 Astro 样式作用域不带 `data-astro-cid` 属性而整体无样式，本次改用全局样式后修复。

### 新增（自建评论系统，替换 giscus）

- **评论功能**：博客/笔记文章页评论区改为自建（`functions/api/comments.ts` + `src/components/Comments.astro`），先审后发——游客评论经 Cloudflare Turnstile 人机验证后进入待审核队列，批准后才公开。
- **DAO 身份联动**：DAO 成员可用本地私钥对评论签名（`comment|<slug>|<name>|<content>|<cts>`，±10 分钟防重放），验签通过即免审公开并带「成员」标记。
- **防护**：纯文本存储（HTML 标签服务端剥离）、昵称 ≤20 字 / 正文 ≤1000 字、按 IP 限流（游客 5 条/小时、成员 30 条/小时）、不存 IP/邮箱；`TURNSTILE_HOSTNAMES` 可配域名白名单。
- **审核**：`/dao/admin` 新增评论审核面板（通过/拒绝/删除）；管理接口 `functions/api/admin/comments.ts`。
- **CSP**：`public/_headers` 移除 giscus 白名单，放行 `challenges.cloudflare.com`。

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
