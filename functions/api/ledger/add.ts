// POST /api/ledger/add —— 手动录入渠道（ADMIN_TOKEN 保护）
// body: {type: "income"|"expense", amount: "12.50", category: "...", note: "...", ref?: "..."}
import { checkAdminAuth, json, type Env } from '../_lib/alipay';
import { appendLedger } from '../_lib/ledger';

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: {
		type?: string;
		amount?: string;
		category?: string;
		note?: string;
		ref?: string;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	if (body.type !== 'income' && body.type !== 'expense') {
		return json({ error: 'type 必须是 income 或 expense' }, 400);
	}
	const amount = Number(body.amount);
	if (!Number.isFinite(amount) || amount <= 0) {
		return json({ error: 'amount 必须是正数' }, 400);
	}
	if (!body.category || !body.note) {
		return json({ error: '缺少 category 或 note' }, 400);
	}

	const record = await appendLedger(env, {
		type: body.type,
		amount: amount.toFixed(2),
		category: String(body.category).slice(0, 50),
		note: String(body.note).slice(0, 200),
		source: 'manual',
		ref: body.ref ? String(body.ref).slice(0, 100) : '',
	});
	return json({ ok: true, seq: record.seq, hash: record.hash });
}
