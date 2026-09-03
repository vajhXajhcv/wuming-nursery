# 付费墙 + 支付宝自动收款上线指南

本站付费文章正文不进入公开 HTML：构建时抽取到 Cloudflare KV，读者通过支付宝付款后由 Pages Function 验单并下发正文。本文档是上线 checklist。

## 架构速览

- `src/pages/paid-src/[...slug].astro`：构建期为付费文章生成裸 HTML（不带布局）。
- `scripts/pack-paid-content.mjs`：`astro build` 后抽取 `<div id="paid-body">` 正文到 `dist-paid-content/`，生成 `catalog.json`（标题/价格/字数），并删除 `dist/paid-src/`。
- `functions/api/order.ts`：创建订单，返回 `alipay.trade.page.pay` 的 POST 表单 HTML（SDK pageExec POST 等价物），前端渲染表单并自动提交跳转支付宝收银台。
- `functions/api/notify.ts`：支付宝异步通知，验签 + 业务归属校验（app_id/订单/金额/seller_id）后置订单为 paid；自动排除退款/关单事件；成功回 `success`，失败回 `fail`。
- `functions/api/status.ts`：前端轮询查单（pending 时回退 `alipay.trade.query` 主动查），已支付则签发访问令牌。
- `functions/api/content.ts`：校验令牌，从 KV 返回正文 HTML。
- `functions/api/admin/{refund,refund-query,close}.ts`：商户自用退款 / 退款查询 / 关单接口（需 `Authorization: Bearer ${ADMIN_TOKEN}`）。
- `functions/api/track.ts`：匿名转化漏斗统计（`paywall_view`/`alipay_click`/`afdian_click`/`redeem_click`，按天计数存 ORDERS KV，不收集任何身份信息）；数据在 `/dao/admin`「转化漏斗」面板查看。
- `scripts/upload-paid-content.mjs`：把 `dist-paid-content/` 上传到 KV（`CONTENT` binding）。
- `scripts/mint-token.mjs`：本地手动签发令牌（人工赠送 / 老读者）。

价格规则：每 2000 字 1 元，不足按 1 元计（`max(1, round(wordCount/2000))`）。

## 上线 Checklist

### ① 开通支付宝收款

1. 到 [aipay.alipay.com](https://aipay.alipay.com) 报名并开通"AI 网页应用收款"（个人开发者可签约）。
2. 到[支付宝开放平台](https://open.alipay.com)创建"网页应用"，用密钥工具生成 RSA2 密钥对，把**应用公钥**上传到平台，换取**支付宝公钥**。
3. 为应用签约 `alipay.trade.page.pay`（电脑网站支付）能力并提交上线。

### ② 创建 KV 命名空间

```bash
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create CONTENT
```

把输出的两个 `id` 填进 `wrangler.jsonc` 的 `kv_namespaces`（替换 `REPLACE_WITH_..._KV_NAMESPACE_ID`）。

### ③ 设置密钥

```bash
npx wrangler pages secret put ALIPAY_APP_ID        # 开放平台应用的 app_id
npx wrangler pages secret put ALIPAY_PRIVATE_KEY   # 应用私钥（见下方格式说明）
npx wrangler pages secret put ALIPAY_PUBLIC_KEY    # 支付宝公钥（SPKI）
npx wrangler pages secret put PAYWALL_TOKEN_SECRET # 随机长字符串，用于签发访问令牌
npx wrangler pages secret put ADMIN_TOKEN          # 随机长字符串，admin 管理接口鉴权
```

可选：`npx wrangler pages secret put ALIPAY_SELLER_ID`（你的支付宝 PID，2088 开头）。配置后异步通知会强制校验 `seller_id`，多一层防伪造保障。

**私钥格式说明（重要）**：

- 本项目是 Node.js/WebCrypto 项目，属于"非 Java 语言"：使用支付宝给的 **`appPrivatePkcsKey`（PKCS#1）字段原值**，不要转换格式、不要加 PEM 头尾、不要做 base64 重编码。服务端导入时会自动识别并把 PKCS#1 包装成 PKCS#8 供 WebCrypto 使用。
- 若你手上是 PKCS#8（`BEGIN PRIVATE KEY` 或对应无头 base64），同样直接粘贴原值即可，两种格式都支持。
- 沙箱配置页会同时返回 `appPrivateKey`（PKCS#8，Java 用）和 `appPrivatePkcsKey`（PKCS#1，非 Java 用），本项目取后者。

`ALIPAY_GATEWAY` 是普通变量，已在 `wrangler.jsonc` 的 `vars` 中配置为生产网关 `https://openapi.alipay.com/gateway.do`。

### ④ 沙箱测试

1. 把 `wrangler.jsonc` 的 `ALIPAY_GATEWAY` 改为沙箱网关 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；`ALIPAY_APP_ID` / `ALIPAY_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY` 换成沙箱应用的值（私钥用沙箱配置页的 `appPrivatePkcsKey` 字段原值）。
2. 沙箱买家/卖家账号在[沙箱控制台](https://open.alipay.com/develop/sandbox/app)获取。
3. `npm run deploy` 部署后，在付费文章页点"支付宝购买"，确认页面渲染支付表单并自动跳转到沙箱收银台，用沙箱买家账号付款。
4. 确认回跳后页面先显示"正在确认支付结果…"，轮询后自动解锁正文；再到 KV `ORDERS` 里确认订单状态为 `paid`。
5. 顺手用 admin 接口各跑一次（见下节），验证退款/关单链路。
6. 测试完成后把网关和密钥切回生产配置。**生产密钥必须与生产应用是同一套（app_id、应用公钥、应用私钥出自同一个生产应用），禁止混入沙箱密钥或其他应用的密钥。**

### ⑤ 部署流程

```bash
npm run deploy
```

该命令依次执行：`build`（含正文抽取）→ `upload:content`（正文上传 KV）→ `wrangler pages deploy`。
若只想重新上传正文（内容没变、不重新部署站点），单独跑 `npm run upload:content` 即可。

> 注意：上传正文必须在 KV namespace ID 填好之后进行；改了文章内容后要重新 `npm run deploy`。

### ⑥ 人工赠送令牌（可选）

```bash
# 单篇（30 天有效）
PAYWALL_TOKEN_SECRET=xxx node scripts/mint-token.mjs <文章slug> 30
# 全站订阅（365 天有效）
PAYWALL_TOKEN_SECRET=xxx node scripts/mint-token.mjs subscription 365
```

把输出的令牌发给读者，在文章页"已有访问令牌？"处粘贴即可解锁。

## Admin 管理接口（退款 / 退款查询 / 关单）

三个接口都要求请求头 `Authorization: Bearer ${ADMIN_TOKEN}`，body 为 JSON。

```bash
# 退款（refund_amount 必填；部分退款或重试必须带同一个 out_request_no 防重复退款）
curl -X POST https://wumingmp.me/api/admin/refund \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"out_trade_no":"1730000000000123456","refund_amount":"3.00","out_request_no":"R1730000000000123456"}'
# 返回 fund_change=Y 才表示资金已退回；为 N 或缺失时请间隔至少 10 秒后用退款查询确认

# 退款查询（只有 refund_status=REFUND_SUCCESS 才是成功）
curl -X POST https://wumingmp.me/api/admin/refund-query \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"out_trade_no":"1730000000000123456","out_request_no":"R1730000000000123456"}'

# 关闭未付款交易（关闭后不可再支付；已付款订单请走退款）
curl -X POST https://wumingmp.me/api/admin/close \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"out_trade_no":"1730000000000123456"}'
```

## 安全说明

- 私钥、`PAYWALL_TOKEN_SECRET`、`ADMIN_TOKEN` 只存在于 Cloudflare 服务端，绝不提交到仓库，也不要输出到日志或对话中。
- 支付结果只认验签通过的异步通知或服务端主动查单；前端回跳 URL 参数不作为已支付依据。
- 访问令牌有效期 30 天（服务端签发），过期后读者需重新联系你获取。
- 令牌校验在服务端进行，泄露单个令牌只影响对应文章（订阅令牌影响全站，请谨慎分发）。

---

## 爱发电渠道（订单号兑换）

买家流程：付费墙点"爱发电购买" → 在爱发电付任意金额 ≥ 文章价格 → 复制订单号 → 回文章页粘贴兑换 → 服务端调爱发电 query-order API 核实（已支付、金额达标、未兑换过）→ 签发令牌解锁。

- 兑换接口：`functions/api/afdian/redeem.ts`（幂等：同一订单重复兑换返回原令牌；一个订单只能兑换一篇）
- 需要配置（从 https://afdian.net/dashboard/dev 获取）：
  - `npx wrangler pages secret put AFDIAN_USER_ID --project-name wuming-nursery`
  - `npx wrangler pages secret put AFDIAN_API_TOKEN --project-name wuming-nursery`
- 新文章零配置：价格从 KV catalog 自动读取
