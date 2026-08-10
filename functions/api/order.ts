// POST /api/order  body: {"slug": "..."}
// 创建订单：写 ORDERS(pending)，返回 alipay.trade.page.pay 的 POST 表单 HTML
// （SDK pageExec POST 的等价物；契约要求浏览器渲染并提交表单，禁止前端 URL 直接跳转）。
import {
	DEFAULT_GATEWAY,
	alipayTimestamp,
	escapeHtml,
	importPrivateKey,
	json,
	rsaSign,
	signContent,
	type Env,
	type OrderRecord,
} from './_lib/alipay';

interface CatalogItem {
	title: string;
	price: number;
	wordCount: number;
}

// 构造 pageExec('alipay.trade.page.pay', 'POST') 的等价 HTML：
// <form action="网关?charset=utf-8" method="post"> + 全部签名后参数的 hidden input + 自动提交脚本
// 注意：SDK 生成的表单会把 charset 挂在 action URL 的查询串上，缺失时生产网关报 invalid-signature
function buildPaymentHtml(gateway: string, params: Record<string, string>, sign: string): string {
	const inputs = Object.keys(params)
		.sort()
		.map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k])}"/>`)
		.join('');
	const action = `${gateway}${gateway.includes('?') ? '&' : '?'}charset=utf-8`;
	return [
		'<!DOCTYPE html><html><head><meta charset="utf-8"/><title>正在跳转到支付宝</title></head><body>',
		`<form id="alipay-payment-form" action="${escapeHtml(action)}" method="post">`,
		inputs,
		`<input type="hidden" name="sign" value="${escapeHtml(sign)}"/>`,
		'</form>',
		'<p>正在跳转到支付宝收银台…</p>',
		`<script>document.getElementById('alipay-payment-form').submit();</script>`,
		'</body></html>',
	].join('');
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	let slug = '';
	try {
		const body = (await request.json()) as { slug?: unknown };
		slug = typeof body.slug === 'string' ? body.slug : '';
	} catch {
		return json({ error: '请求体必须是 JSON {slug}' }, 400);
	}
	if (!slug) return json({ error: '缺少 slug' }, 400);

	const catalogRaw = await env.CONTENT.get('catalog');
	const catalog: Record<string, CatalogItem> = catalogRaw ? JSON.parse(catalogRaw) : {};
	const item = catalog[slug];
	if (!item) return json({ error: '文章不存在或未定价' }, 404);

	const outTradeNo = `${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
	const amount = Number(item.price).toFixed(2);

	const order: OrderRecord = {
		slug,
		amount,
		status: 'pending',
		createdAt: Date.now(),
	};
	await env.ORDERS.put(outTradeNo, JSON.stringify(order));

	const origin = new URL(request.url).origin;
	const params: Record<string, string> = {
		app_id: env.ALIPAY_APP_ID,
		method: 'alipay.trade.page.pay',
		charset: 'utf-8',
		sign_type: 'RSA2',
		timestamp: alipayTimestamp(),
		version: '1.0',
		notify_url: `${origin}/api/notify`,
		return_url: `${origin}/blog/${slug}/?out_trade_no=${outTradeNo}`,
		biz_content: JSON.stringify({
			out_trade_no: outTradeNo,
			total_amount: amount,
			subject: `付费文章：${item.title}`,
			product_code: 'FAST_INSTANT_TRADE_PAY',
		}),
	};
	const privateKey = await importPrivateKey(env.ALIPAY_PRIVATE_KEY);
	const sign = await rsaSign(signContent(params), privateKey);

	const paymentHtml = buildPaymentHtml(
		env.ALIPAY_GATEWAY || DEFAULT_GATEWAY,
		params,
		sign,
	);
	return json({ paymentHtml });
}
