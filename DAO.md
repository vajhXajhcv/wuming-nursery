# DAO 治理系统

本站用一条追加式 SHA-256 哈希链同时承载**财务收支**与**治理事件**：所有记录公开可读、任何人可独立验链，治理操作（提案/投票）用成员 ECDSA 签名，链头定期锚定到比特币。本文档是架构说明 + 运营 checklist。

## 架构速览

- 单条链：财务记录（`income`/`expense`）与治理事件共用同一条追加链，存 Cloudflare KV。
- 单源实现：`src/lib/dao-core.ts`（纯函数零依赖）同时被两端使用——`functions/api/**`（服务端校验与写链）和 `src/pages/**`（打包进浏览器，任何人可独立重放验证）。
- KV key 结构：
  - `ledger:head` → `{seq, hash}` 链头；
  - `ledger:rec:<seq 左补零至 12 位>` → 完整记录 JSON（补零保证 KV list 字典序即时间序）；
  - `dao:pending:<handle>` → 待审核的加入申请（不上链）。
- 公开读接口：`GET /api/ledger/list` 返回 `{records, head, chain}`，无鉴权，任何人可拉全链。
- 哈希规则：
  - `base = [prev, seq, ts, type, amount, category, note, source, ref || ''].join('|')`
  - 有 `data` 字段时：内容 = `base + '|' + stableStringify(data)`；否则内容 = `base`
  - `hash = sha256hex(内容)`，创世 `prev = 'GENESIS'`
  - `stableStringify` = 键序稳定的 JSON（对象键排序、`undefined` 丢弃、数组保持顺序、无空白）
- 治理规则（可被 `params` 事件修改，默认值如下）：
  - 投票权重 = **提案创建快照时**的贡献点（之后获得的点不影响该提案）；
  - 法定人数 quorum：参与权重 ≥ 快照总权重 × `quorumBps/10000`（默认 2000 = 20%）；
  - 通过条件：达到法定人数且赞成 > 反对；
  - 投票期 `votingPeriodMs` 默认 7 天；提案门槛 `proposeThreshold` 默认 50 贡献点；
  - 资金贡献折算参考率 `pointsPerYuan` 默认 1（¥1 = 1 点，仅供管理员核定时参考）。

## 事件类型

DAO 事件 `amount` 为空字符串、`source` 为 `dao`，负载在 `data` 字段（参与哈希）。财务记录无 `data` 字段。

| type | data 字段 | 写入方 |
| --- | --- | --- |
| `income` / `expense` | 无（金额在 `amount`，分类在 `category`） | 支付回调 / admin（`/api/ledger/add`）、DAO 执行支出 |
| `member` | `{action: add\|remove, handle, pubkey}` | admin（approve-member） |
| `contribution` | `{handle, kind, points, ref?, evidence?}`（kind=money 时 ref 填 `ledger#<seq>`） | admin（contribution） |
| `proposal` | `{ptype: spend\|text\|param, title, body, amount?, recipient?, paramPatch?, deadline, quorumBps, proposer, headHash, sig}` | 成员签名（propose） |
| `vote` | `{pid, handle, choice: for\|against\|abstain, weight, sig}` | 成员签名（vote） |
| `resolution` | `{pid, outcome: passed\|rejected, for, against, abstain, turnout, totalWeight, quorumReached}` | admin（close，计票由链重放算出） |
| `execution` | `{pid, ledgerSeq}`（对应 expense 记录的 seq） | admin（execute，同时写 expense 记录） |
| `params` | `{patch: {pointsPerYuan?, proposeThreshold?, votingPeriodMs?, quorumBps?}}` | admin（params） |
| `anchor` | `{anchoredSeq, anchoredHash, otsFile}` | admin（anchor，一般由 `scripts/anchor-ots.mjs` 调用） |

`pid` = 提案记录的 `seq`。`deadline`/`quorumBps` 是提案创建时的参数快照。

## API 端点

所有写接口都是 POST + JSON body。admin 接口要求请求头 `Authorization: Bearer ${ADMIN_TOKEN}`。成员接口用 ECDSA P-256 签名（WebCrypto，raw `r||s` 64 字节，base64url 编码）。

| 端点 | 鉴权 | body | 说明 |
| --- | --- | --- | --- |
| `/api/ledger/list` (GET) | 公开 | — | 返回 `{records, head, chain}` 全链 |
| `/api/dao/join` | 公开 | `{handle, pubkey:{kty:"EC",crv:"P-256",x,y}}` | 申请加入，写入待审核队列；同 handle+同公钥重复申请幂等 |
| `/api/dao/pending` | admin | 无 | 列出待审核申请 |
| `/api/dao/approve-member` | admin | `{handle, action:"approve"\|"reject"\|"remove"}` | 批准（写 member/add）/ 拒绝 / 移除（写 member/remove） |
| `/api/dao/contribution` | admin | `{handle, kind, points, ref?, evidence?}` | 贡献核定，0 < points ≤ 100000 |
| `/api/dao/propose` | 成员签名 | `{payload:{ptype,title,body,amount?,recipient?,paramPatch?}, proposer, headHash, sig}` | 发起提案，需贡献点 ≥ 提案门槛 |
| `/api/dao/vote` | 成员签名 | `{pid, handle, choice, headHash, sig}` | 投票，权重按提案快照服务端重算 |
| `/api/dao/close` | admin | `{pid}` | 投票期结束后关闭提案，写 resolution |
| `/api/dao/execute` | admin | `{pid, note?}` | 执行已通过的 spend 提案（写 expense + execution） |
| `/api/dao/params` | admin | `{patch:{...}}` | 改治理参数 |
| `/api/dao/anchor` | admin | `{anchoredSeq, anchoredHash, otsFile}` | 记录链头 OTS 锚定（seq/hash 必须与链上记录一致） |

签名消息格式（均含当前链头哈希，防重放、串行化写入）：

- 投票：`vote|<headHash>|<pid>|<choice>`
- 提案：`propose|<headHash>|<stableStringify(payload)>`（payload 可选字段为空时必须整个省略，两端才能重算一致）
- `headHash` 必须等于当前链头，否则服务端返回 409（链头已变化，需重新获取后重签）。

## 页面清单

| 页面 | 说明 |
| --- | --- |
| `/dao` | 治理总览（链状态、参数、提案摘要） |
| `/dao/charter` | 章程 |
| `/dao/members` | 成员与贡献点 |
| `/dao/join` | 申请加入（生成/提交 P-256 公钥） |
| `/dao/proposals` | 提案列表 |
| `/dao/proposal?pid=<seq>` | 提案详情与投票 |
| `/dao/propose` | 发起提案（浏览器内签名） |
| `/dao/admin` | 管理面板（draft） |

## 运营手册

Admin 接口 curl 示例（与 PAYMENT.md 相同鉴权方式）：

```bash
# 查看待审核加入申请
curl -X POST https://wumingmp.me/api/dao/pending \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 批准成员（公钥自动取待审核申请；拒绝用 "reject"，移除用 "remove"）
curl -X POST https://wumingmp.me/api/dao/approve-member \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"handle":"alice","action":"approve"}'

# 成员福利：批准后发放全站订阅令牌（免费读付费内容），把令牌私下发给本人
PAYWALL_TOKEN_SECRET=xxx node scripts/mint-token.mjs subscription 365

# 核定贡献（kind=money 时 ref 填 ledger#<seq>，交叉引用对应的收入记录）
curl -X POST https://wumingmp.me/api/dao/contribution \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"handle":"alice","kind":"money","points":30,"ref":"ledger#12","evidence":"付费文章收入"}'

# 关闭提案（投票期结束后；计票由链重放算出并写入 resolution）
curl -X POST https://wumingmp.me/api/dao/close \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"pid":5}'

# 执行已通过的支出提案（自动写 expense 记录 + execution 回执；实际转账仍需人工完成）
curl -X POST https://wumingmp.me/api/dao/execute \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"pid":5,"note":"已通过支付宝转给收款方"}'

# 改治理参数（只写要改的键）
curl -X POST https://wumingmp.me/api/dao/params \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"patch":{"proposeThreshold":100}}'
```

锚定链头到比特币（OpenTimestamps）：

```bash
# 锚定当前链头 + 升级历史待定证明（不写链）
node scripts/anchor-ots.mjs

# 同时把锚定结果写回链上（anchor 事件）
ADMIN_TOKEN=xxx node scripts/anchor-ots.mjs
```

证明文件写入 `public/dao/anchors/`（`<seq>-<hash前8位>.<日历名>.ots` + `index.json`），需 `npm run deploy` 后在 `/dao/anchors/` 下公开可下载。日历承诺到比特币区块确认通常需数小时，之后重跑脚本即可把待定证明升级为含区块 attestation 的完整证明。

**自动化**：`.github/workflows/anchor-ots.yml` 每周一自动执行上述流程并把证明文件提交回仓库（无需手动跑脚本）；在仓库 Settings → Secrets 配置 `ADMIN_TOKEN` 后，锚定事件也会自动写回链上。首次配置后可在 Actions 页手动触发一次验证。

链校验（任何镜像方可用，实现与站点代码完全独立）：

```bash
node scripts/verify-chain.mjs            # 从站点拉全链校验
node scripts/verify-chain.mjs --file chain.json   # 校验本地下载的全链
```

## 信任模型与已知限制

- 创始人掌握 `ADMIN_TOKEN` 与支付账户，是明确的中心化点。制衡方式：全链公开可读、成员操作有签名可验、链头定期 OTS 锚定到比特币（事后不可篡改）、任何人可导出全链自行验链并分叉。
- KV 无事务，极端并发下可能分叉；MVP 接受此限制，后续可迁 Durable Object。
- 投票权重（贡献点）公开，无隐私。
- 贡献点无法转让，不代表股权或任何财产权利。

## 合规说明

不发代币、不承诺任何回报；本系统是面向内容创作共同体的自愿捐赠与治理工具。
