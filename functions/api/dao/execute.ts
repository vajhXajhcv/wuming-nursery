// POST /api/dao/execute —— 执行已通过的支出提案（ADMIN_TOKEN 保护）
// body: {pid, note?}
// 先写一条 expense 财务记录（source 仍为 dao，ref 回指提案），再写 execution 执行回执。
import { checkAdminAuth, json, type Env } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import { replay, type ExecutionData } from '../../../src/lib/dao-core';

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { pid?: unknown; note?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}
	const pid = typeof body.pid === 'number' ? body.pid : NaN;
	if (!Number.isInteger(pid)) return json({ error: 'pid 必须是整数' }, 400);

	const { records } = await listLedger(env);
	const state = replay(records);
	const prop = state.proposals[pid];
	if (!prop) return json({ error: '提案不存在' }, 404);
	if (prop.data.ptype !== 'spend') return json({ error: '只有支出提案可以执行' }, 400);
	if (!prop.resolution || prop.resolution.outcome !== 'passed') {
		return json({ error: '提案未通过，不能执行' }, 400);
	}
	if (prop.execution) return json({ error: '提案已执行过' }, 400);
	if (!prop.data.amount || !prop.data.recipient) {
		return json({ error: '支出提案数据不完整（缺 amount / recipient）' }, 500);
	}
	const amount = prop.data.amount;
	const recipient = prop.data.recipient;

	// 支出记录：amount 由 appendLedger 规范化为两位小数
	const expense = await appendLedger(env, {
		type: 'expense',
		amount,
		category: 'DAO支出',
		note:
			typeof body.note === 'string' && body.note
				? body.note.slice(0, 200)
				: `执行提案 #${pid}：${prop.data.title}`,
		source: 'dao',
		ref: `dao:proposal:${pid}`,
	});

	const data: ExecutionData = { pid, ledgerSeq: expense.seq };
	const execution = await appendLedger(env, {
		type: 'execution',
		category: '执行',
		note: `提案 #${pid} 已执行，支出 ¥${amount} → ${recipient}`,
		source: 'dao',
		data: { ...data },
	});
	return json({ ok: true, ledgerSeq: expense.seq, executionSeq: execution.seq });
}
