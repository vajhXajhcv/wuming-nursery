// POST /api/admin/refund  body: {out_trade_no, refund_amount, refund_reason?, out_request_no?}
// 商户自用退款接口（alipay.trade.refund，exec 类，JSON 响应）。
// 需要请求头 Authorization: Bearer ${ADMIN_TOKEN}。
// 注意：code=10000 只代表退款请求受理成功；fund_change=Y 才表示发生资金变化，
// fund_change=N 或缺失时必须再用 /api/admin/refund-query 确认（建议间隔至少 10 秒）。
import { checkAdminAuth, execAlipay, json, type Env } from '../_lib/alipay';

interface RefundResponse {
	code?: string;
	msg?: string;
	sub_code?: string;
	sub_msg?: string;
	trade_no?: string;
	out_trade_no?: string;
	fund_change?: string;
	refund_fee?: string;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: {
		out_trade_no?: string;
		refund_amount?: string;
		refund_reason?: string;
		out_request_no?: string;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}
	if (!body.out_trade_no || !body.refund_amount) {
		return json({ error: '缺少 out_trade_no 或 refund_amount' }, 400);
	}

	const biz: Record<string, unknown> = {
		out_trade_no: body.out_trade_no,
		refund_amount: body.refund_amount,
	};
	if (body.refund_reason) biz.refund_reason = body.refund_reason;
	// 部分退款或异常重试必须保持同一 out_request_no，防止重复退款
	if (body.out_request_no) biz.out_request_no = body.out_request_no;

	let r: RefundResponse;
	try {
		r = await execAlipay<RefundResponse>(env, 'alipay.trade.refund', biz);
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
	}

	if (r.code !== '10000') {
		return json({ ok: false, code: r.code, msg: r.msg, sub_code: r.sub_code, sub_msg: r.sub_msg }, 502);
	}
	return json({
		ok: r.fund_change === 'Y',
		fund_change: r.fund_change,
		trade_no: r.trade_no,
		out_trade_no: r.out_trade_no,
		refund_fee: r.refund_fee,
		// fund_change=N 或缺失不代表失败，必须再查
		note:
			r.fund_change === 'Y'
				? '退款资金已变化'
				: 'fund_change 非 Y，请间隔至少 10 秒后调用 /api/admin/refund-query 确认（需 out_request_no）',
	});
}
