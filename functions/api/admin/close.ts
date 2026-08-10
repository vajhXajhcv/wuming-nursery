// POST /api/admin/close  body: {out_trade_no}
// 关闭未付款交易（alipay.trade.close，exec 类，JSON 响应）。
// 需要请求头 Authorization: Bearer ${ADMIN_TOKEN}。
// 关闭成功后该交易不可继续支付；仅用于未付款订单，已付款订单请走退款。
import { checkAdminAuth, execAlipay, json, type Env } from '../_lib/alipay';

interface CloseResponse {
	code?: string;
	msg?: string;
	sub_code?: string;
	sub_msg?: string;
	trade_no?: string;
	out_trade_no?: string;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { out_trade_no?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}
	if (!body.out_trade_no) return json({ error: '缺少 out_trade_no' }, 400);

	let r: CloseResponse;
	try {
		r = await execAlipay<CloseResponse>(env, 'alipay.trade.close', {
			out_trade_no: body.out_trade_no,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
	}

	if (r.code !== '10000') {
		return json({ ok: false, code: r.code, msg: r.msg, sub_code: r.sub_code, sub_msg: r.sub_msg }, 502);
	}
	return json({ ok: true, trade_no: r.trade_no, out_trade_no: r.out_trade_no, note: '交易已关闭' });
}
