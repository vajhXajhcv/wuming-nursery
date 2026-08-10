// POST /api/notify（application/x-www-form-urlencoded）
// 支付宝异步通知：验签 -> 业务校验 -> 置为 paid。
// 成功返回纯文本 success，失败返回 fail（支付宝对非 success 会按策略重推）。
import {
	importPublicKey,
	rsaVerify,
	signContent,
	type Env,
	type OrderRecord,
} from './_lib/alipay';
import { appendLedger } from './_lib/ledger';

const OK = () => new Response('success', { headers: { 'content-type': 'text/plain' } });
const FAIL = () => new Response('fail', { headers: { 'content-type': 'text/plain' } });

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	// 1. 接收 POST 表单，收集完整参数 map（验签前不得丢字段/改字段）
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) {
		if (typeof v === 'string') params[k] = v;
	}

	// 2. 验签：去掉 sign、sign_type，其余按 key 排序拼接，用支付宝公钥验 RSA2
	const signature = params.sign;
	if (!signature) return FAIL();
	try {
		const publicKey = await importPublicKey(env.ALIPAY_PUBLIC_KEY);
		const valid = await rsaVerify(signContent(params, true), signature, publicKey);
		if (!valid) return FAIL();
	} catch {
		return FAIL();
	}

	// 3. 业务归属校验：app_id / 订单存在 / 金额一致 / seller_id（若配置）
	if (params.app_id !== env.ALIPAY_APP_ID) return FAIL();
	const outTradeNo = params.out_trade_no;
	if (!outTradeNo) return FAIL();
	const raw = await env.ORDERS.get(outTradeNo);
	if (!raw) return FAIL();
	const order: OrderRecord = JSON.parse(raw);
	if (params.total_amount !== order.amount) return FAIL();
	if (env.ALIPAY_SELLER_ID && params.seller_id !== env.ALIPAY_SELLER_ID) return FAIL();

	// 4. 排除退款/关单等事件：含 out_biz_no、gmt_refund 或 refund_fee 的通知
	//    不得标记为已支付；验签与归属校验已通过，返回 success 停止重推，订单状态不动
	if (params.out_biz_no || params.gmt_refund || params.refund_fee) return OK();

	// 5. 幂等：已 paid 直接成功
	if (order.status === 'paid') return OK();

	// 6. 仅 TRADE_SUCCESS / TRADE_FINISHED 认定为付款成功
	if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') {
		order.status = 'paid';
		order.tradeNo = params.trade_no;
		await env.ORDERS.put(outTradeNo, JSON.stringify(order));
		// 自动渠道记账（账本失败不影响支付主链路）
		try {
			await appendLedger(env, {
				type: 'income',
				amount: order.amount,
				category: '付费阅读',
				note: `付费文章收入（${order.slug}）`,
				source: 'alipay',
				ref: outTradeNo,
			});
		} catch {}
		return OK();
	}

	// WAIT_BUYER_PAY / TRADE_CLOSED 等：不认定付款成功；返回 success 避免无意义重推，
	// 实际到账由后续 TRADE_SUCCESS 通知或 /api/status 主动查单兜底
	return OK();
}
