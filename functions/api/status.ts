// GET /api/status?out_trade_no=xxx
// 查询订单支付状态；pending 时回退调用 alipay.trade.query 主动查单。
// 已支付则签发访问令牌返回 { paid: true, token, slug }，否则 { paid: false }。
import {
	DEFAULT_GATEWAY,
	alipayTimestamp,
	buildSignedRequestUrl,
	importPrivateKey,
	json,
	mintToken,
	type Env,
	type OrderRecord,
} from './_lib/alipay';

async function queryAlipayTrade(env: Env, outTradeNo: string): Promise<string | null> {
	const privateKey = await importPrivateKey(env.ALIPAY_PRIVATE_KEY);
	const url = await buildSignedRequestUrl(
		env.ALIPAY_GATEWAY || DEFAULT_GATEWAY,
		{
			app_id: env.ALIPAY_APP_ID,
			method: 'alipay.trade.query',
			charset: 'utf-8',
			sign_type: 'RSA2',
			timestamp: alipayTimestamp(),
			version: '1.0',
			biz_content: JSON.stringify({ out_trade_no: outTradeNo }),
		},
		privateKey,
	);
	const resp = await fetch(url);
	const data = (await resp.json()) as {
		alipay_trade_query_response?: { trade_status?: string };
	};
	return data.alipay_trade_query_response?.trade_status ?? null;
}

export async function onRequestGet(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	const outTradeNo = new URL(request.url).searchParams.get('out_trade_no') || '';
	if (!outTradeNo) return json({ error: '缺少 out_trade_no' }, 400);

	const raw = await env.ORDERS.get(outTradeNo);
	if (!raw) return json({ paid: false, error: '订单不存在' }, 404);
	const order: OrderRecord = JSON.parse(raw);

	// pending：回退主动查单（异步通知可能延迟或丢失）
	if (order.status === 'pending') {
		try {
			const tradeStatus = await queryAlipayTrade(env, outTradeNo);
			if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
				order.status = 'paid';
				await env.ORDERS.put(outTradeNo, JSON.stringify(order));
			}
		} catch {
			// 查单失败不阻塞，前端会继续轮询
		}
	}

	if (order.status !== 'paid') return json({ paid: false });

	const token = await mintToken(order.slug, env.PAYWALL_TOKEN_SECRET);
	return json({ paid: true, token, slug: order.slug });
}
