// POST /api/dao/vote —— 成员对提案投票（成员 ECDSA 签名）
// body: {pid, handle, choice: "for"|"against"|"abstain", headHash, sig}
// 签名消息为 voteMessage(headHash, pid, choice)；权重按提案快照（pointsAt(records, pid, handle)）计算。
import { json, type Env } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import {
	pointsAt,
	replay,
	verifyMemberSignature,
	voteMessage,
	type VoteChoice,
	type VoteData,
} from '../../../src/lib/dao-core';

const CHOICES: VoteChoice[] = ['for', 'against', 'abstain'];

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	let body: {
		pid?: unknown;
		handle?: unknown;
		choice?: unknown;
		headHash?: unknown;
		sig?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const pid = typeof body.pid === 'number' ? body.pid : NaN;
	const handle = typeof body.handle === 'string' ? body.handle : '';
	const headHash = typeof body.headHash === 'string' ? body.headHash : '';
	const sig = typeof body.sig === 'string' ? body.sig : '';
	if (!Number.isInteger(pid) || !handle || !headHash || !sig) {
		return json({ error: '缺少 pid / handle / headHash / sig' }, 400);
	}
	if (!CHOICES.includes(body.choice as VoteChoice)) {
		return json({ error: 'choice 必须是 for / against / abstain' }, 400);
	}
	const choice = body.choice as VoteChoice;

	const { records, head } = await listLedger(env);
	if (headHash !== head.hash) {
		return json({ error: '链头已变化，请重新获取后重试' }, 409);
	}

	const state = replay(records);
	const member = state.members[handle];
	if (!member || member.removed) return json({ error: '该 handle 不是在册成员' }, 403);
	const prop = state.proposals[pid];
	if (!prop) return json({ error: '提案不存在' }, 404);
	if (prop.resolution) return json({ error: '提案已关闭' }, 400);
	if (Date.now() > prop.data.deadline) return json({ error: '投票已截止' }, 400);
	if (prop.votes.some((v) => v.handle === handle && v.valid)) {
		return json({ error: '已投过票' }, 400);
	}

	// 快照权重：提案记录 seq（不含）之前的累计贡献点
	const weight = pointsAt(records, pid, handle).total;
	if (weight <= 0) return json({ error: '快照时无贡献点，无投票权重' }, 403);

	const ok = await verifyMemberSignature(member.pubkey, voteMessage(headHash, pid, choice), sig);
	if (!ok) return json({ error: '签名验证失败' }, 403);

	const data: VoteData = { pid, handle, choice, weight, sig };
	await appendLedger(env, {
		type: 'vote',
		category: '投票',
		note: `${handle} 对提案 #${pid} 投 ${choice}`,
		source: 'dao',
		data: { ...data },
	});
	return json({ ok: true, weight });
}
