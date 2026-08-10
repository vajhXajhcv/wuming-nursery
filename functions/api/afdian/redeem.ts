// POST /api/afdian/redeem  body: {"slug": "...", "orderNo": "..."}
// 爱发电订单号兑换：调爱发电 query-order API 核实订单（已支付、金额达标、未兑换过），
// 通过则签发对应文章的访问令牌。兑换记录存 ORDERS KV（key: afdian:<orderNo>），重复请求返回原令牌。
import { json, mintToken, type Env } from '../_lib/alipay';
import { appendLedger } from '../_lib/ledger';
import { md5 } from '../_lib/md5';

interface CatalogItem {
	title: string;
	price: number;
	wordCount: number;
}

interface AfdianOrder {
	out_trade_no: string;
	total_amount: string;
	show_amount: string;
	status: number;
	redeem_id?: string;
}

interface RedeemRecord {
	slug: string;
	token: string;
	redeemedAt: number;
}

// 爱发电 API 签名：md5(token + "params" + params + "ts" + ts + "user_id" + user_id)
function afdianSign(apiToken: string, paramsJson: string, ts: number, userId: string): string {
	return md5(`${apiToken}params${paramsJson}ts${ts}user_id${userId}`);
}

async function queryAfdianOrder(env: Env, orderNo: string): Promise<AfdianOrder | null> {
	const userId = (env as unknown as { AFDIAN_USER_ID?: string }).AFDIAN_USER_ID;
	const apiToken = (env as unknown as { AFDIAN_API_TOKEN?: string }).AFDIAN_API_TOKEN;
	if (!userId || !apiToken) throw new Error('爱发电 API 未配置（缺少 AFDIAN_USER_ID / AFDIAN_API_TOKEN）');

	const paramsJson = JSON.stringify({ out_trade_no: orderNo });
	const ts = Math.floor(Date.now() / 1000);
	const resp = await fetch('https://afdian.net/api/open/query-order', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			user_id: userId,
			params: paramsJson,
			ts,
			sign: afdianSign(apiToken, paramsJson, ts, userId),
		}),
	});
	const data = (await resp.json()) as {
		ec: number;
		em?: string;
		data?: { list?: AfdianOrder[] };
	};
	if (data.ec !== 200) {
		throw new Error(`爱发电 API 错误（ec=${data.ec} ${data.em || ''}）`);
	}
	const order = (data.data?.list || []).find((o) => o.out_trade_no === orderNo);
	return order || null;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	let slug = '';
	let orderNo = '';
	try {
		const body = (await request.json()) as { slug?: unknown; orderNo?: unknown };
		slug = typeof body.slug === 'string' ? body.slug.trim() : '';
		orderNo = typeof body.orderNo === 'string' ? body.orderNo.trim() : '';
	} catch {
		return json({ error: '请求体必须是 JSON {slug, orderNo}' }, 400);
	}
	if (!slug || !orderNo) return json({ error: '缺少 slug 或 orderNo' }, 400);
	if (!/^\d{6,64}$/.test(orderNo)) return json({ error: '订单号格式不正确' }, 400);

	// 已兑换过：直接返回原令牌（幂等，买家丢失令牌可重复取）
	const kvKey = `afdian:${orderNo}`;
	const existing = await env.ORDERS.get(kvKey);
	if (existing) {
		const record = JSON.parse(existing) as RedeemRecord;
		if (record.slug === slug) {
			return json({ ok: true, token: record.token, slug, already: true });
		}
		return json({ error: `该订单已用于兑换其他内容（${record.slug}），一个订单只能兑换一次。` }, 409);
	}

	// 文章定价
	const catalogRaw = await env.CONTENT.get('catalog');
	const catalog: Record<string, CatalogItem> = catalogRaw ? JSON.parse(catalogRaw) : {};
	const item = catalog[slug];
	if (!item) return json({ error: '文章不存在或未定价' }, 404);

	// 核实订单
	let order: AfdianOrder | null;
	try {
		order = await queryAfdianOrder(env, orderNo);
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, 502);
	}
	if (!order) return json({ error: '未查询到该订单号，请核对后再试。' }, 404);
	if (order.status !== 2) return json({ error: '该订单尚未支付成功。' }, 402);

	const paid = parseFloat(order.total_amount || order.show_amount || '0');
	if (!(paid >= item.price)) {
		return json(
			{ error: `该订单实付 ¥${paid.toFixed(2)}，不足本文价格 ¥${item.price.toFixed(2)}。` },
			402,
		);
	}

	// 签发令牌并记录兑换
	const token = await mintToken(slug, env.PAYWALL_TOKEN_SECRET, 365);
	const record: RedeemRecord = { slug, token, redeemedAt: Date.now() };
	await env.ORDERS.put(kvKey, JSON.stringify(record));

	// 自动渠道记账（账本失败不影响兑换主链路）
	try {
		await appendLedger(env, {
			type: 'income',
			amount: paid.toFixed(2),
			category: '付费阅读',
			note: `付费文章收入（${slug}，爱发电）`,
			source: 'afdian',
			ref: orderNo,
		});
	} catch {}

	return json({ ok: true, token, slug });
}
