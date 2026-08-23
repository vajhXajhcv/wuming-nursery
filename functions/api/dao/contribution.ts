// POST /api/dao/contribution —— 贡献核定，产生贡献点（ADMIN_TOKEN 保护）
// body: {handle, kind: "1-20字符", points: 0<n<=100000, ref?, evidence?}
import { checkAdminAuth, json, type Env } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import { replay, type ContributionData } from '../../../src/lib/dao-core';

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: {
		handle?: unknown;
		kind?: unknown;
		points?: unknown;
		ref?: unknown;
		evidence?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const handle = typeof body.handle === 'string' ? body.handle : '';
	if (!handle) return json({ error: '缺少 handle' }, 400);
	const kind = typeof body.kind === 'string' ? body.kind : '';
	if (kind.length < 1 || kind.length > 20) return json({ error: 'kind 须为 1-20 个字符' }, 400);
	const points = typeof body.points === 'number' ? body.points : NaN;
	if (!Number.isFinite(points) || points <= 0 || points > 100000) {
		return json({ error: 'points 必须是 0-100000 之间的数' }, 400);
	}

	const { records } = await listLedger(env);
	const state = replay(records);
	const member = state.members[handle];
	if (!member || member.removed) return json({ error: '该 handle 不是在册成员' }, 400);

	const data: ContributionData = {
		handle,
		kind,
		points,
		...(body.ref ? { ref: String(body.ref).slice(0, 100) } : {}),
		...(body.evidence ? { evidence: String(body.evidence).slice(0, 200) } : {}),
	};
	const record = await appendLedger(env, {
		type: 'contribution',
		category: '贡献',
		note: `贡献核定：${handle} ${kind} +${points}点`,
		source: 'dao',
		data: { ...data },
	});
	return json({ ok: true, seq: record.seq });
}
