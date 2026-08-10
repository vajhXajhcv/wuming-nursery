// POST /api/admin/refund-query  body: {out_trade_no, out_request_no}
// 退款查询（alipay.trade.fastpay.refund.query，exec 类，JSON 响应）。
// 需要请求头 Authorization: Bearer ${ADMIN_TOKEN}。
// 注意：只有 refund_status=REFUND_SUCCESS 才表示退款成功；
// 查询发起时间不能离退款请求太短，建议至少间隔 10 秒。
import { checkAdminAuth, execAlipay, json, type Env } from '../_lib/alipay';

interface RefundQueryResponse {
	code?: string;
	msg?: string;
	sub_code?: string;
	sub_msg?: string;
	trade_no?: string;
	out_trade_no?: string;
	out_request_no?: string;
	refund_status?: string;
	refund_amount?: string;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { out_trade_no?: string; out_request_no?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}
	if (!body.out_trade_no || !body.out_request_no) {
		return json({ error: '缺少 out_trade_no 或 out_request_no' }, 400);
	}

	let r: RefundQueryResponse;
	try {
		r = await execAlipay<RefundQueryResponse>(env, 'alipay.trade.fastpay.refund.query', {
		out_trade_no: body.out_trade_no,
		out_request_no: body.out_request_no,
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
	}

	if (r.code !== '10000') {
		return json({ ok: false, code: r.code, msg: r.msg, sub_code: r.sub_code, sub_msg: r.sub_msg }, 502);
	}
	return json({
		ok: r.refund_status === 'REFUND_SUCCESS',
		refund_status: r.refund_status,
		refund_amount: r.refund_amount,
		trade_no: r.trade_no,
		out_trade_no: r.out_trade_no,
		out_request_no: r.out_request_no,
		note:
			r.refund_status === 'REFUND_SUCCESS'
				? '退款成功'
				: '退款未成功（无 refund_status 表示该笔退款不存在或处理中）',
	});
}
