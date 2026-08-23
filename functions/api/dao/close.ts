// POST /api/dao/close —— 关闭提案并写入决议（ADMIN_TOKEN 保护）
// body: {pid}
// 计票用 dao-core 的 tally（任何人可对链重放独立重算）。
import { checkAdminAuth, json, type Env } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import { replay, tally, type ResolutionData } from '../../../src/lib/dao-core';

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { pid?: unknown };
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
	if (prop.resolution) return json({ error: '提案已有决议，不能重复关闭' }, 400);
	if (Date.now() <= prop.data.deadline) return json({ error: '投票期未结束，不能关闭' }, 400);

	const t = tally(records, prop);
	const data: ResolutionData = {
		pid,
		outcome: t.passed ? 'passed' : 'rejected',
		for: t.for,
		against: t.against,
		abstain: t.abstain,
		turnout: t.turnout,
		totalWeight: t.totalWeight,
		quorumReached: t.quorumReached,
	};
	await appendLedger(env, {
		type: 'resolution',
		category: '决议',
		note: `提案 #${pid} 已关闭：${t.passed ? '通过' : '未通过'}`,
		source: 'dao',
		data: { ...data },
	});
	return json({ ok: true, outcome: data.outcome, tally: t });
}
