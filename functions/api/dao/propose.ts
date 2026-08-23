// POST /api/dao/propose —— 成员发起提案（成员 ECDSA 签名）
// body: {payload: {ptype, title, body, amount?, recipient?, paramPatch?}, proposer, headHash, sig}
// payload 为成员签名的原始对象（可选字段为空时整个省略）；签名消息为 proposeMessage(headHash, payload)。
import { json, type Env } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import {
	DEFAULT_PARAMS,
	proposeMessage,
	replay,
	verifyMemberSignature,
	type DaoParams,
	type ProposalData,
	type ProposalType,
} from '../../../src/lib/dao-core';

const PARAM_KEYS = Object.keys(DEFAULT_PARAMS) as (keyof DaoParams)[];
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

// 治理参数补丁：键 ⊆ DEFAULT_PARAMS 的键，值为 ≥0 的有限数；
// votingPeriodMs ≥ 1 小时，quorumBps ≤ 10000
function validateParamPatch(patch: unknown): patch is Partial<DaoParams> {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
	for (const [k, v] of Object.entries(patch)) {
		if (!PARAM_KEYS.includes(k as keyof DaoParams)) return false;
		if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
		if (k === 'votingPeriodMs' && v < 3600000) return false;
		if (k === 'quorumBps' && v > 10000) return false;
	}
	return true;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	let body: { payload?: unknown; proposer?: unknown; headHash?: unknown; sig?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const proposer = typeof body.proposer === 'string' ? body.proposer : '';
	const headHash = typeof body.headHash === 'string' ? body.headHash : '';
	const sig = typeof body.sig === 'string' ? body.sig : '';
	if (
		!proposer ||
		!headHash ||
		!sig ||
		!body.payload ||
		typeof body.payload !== 'object' ||
		Array.isArray(body.payload)
	) {
		return json({ error: '缺少 payload / proposer / headHash / sig' }, 400);
	}
	const p = body.payload as Record<string, unknown>;

	const { records, head } = await listLedger(env);
	// 链头乐观锁：签名消息含链头哈希，过期即拒绝
	if (headHash !== head.hash) {
		return json({ error: '链头已变化，请重新获取后重试' }, 409);
	}

	const state = replay(records);
	const member = state.members[proposer];
	if (!member || member.removed) return json({ error: 'proposer 不是在册成员' }, 403);
	const total = state.points[proposer]?.total ?? 0;
	if (total < state.params.proposeThreshold) {
		return json(
			{ error: `贡献点不足：当前 ${total} 点，提案门槛 ${state.params.proposeThreshold} 点` },
			403,
		);
	}

	// payload 校验（签名覆盖的原始字段，不可改写）
	if (p.ptype !== 'spend' && p.ptype !== 'text' && p.ptype !== 'param') {
		return json({ error: 'ptype 必须是 spend / text / param' }, 400);
	}
	if (typeof p.title !== 'string' || p.title.length < 1 || p.title.length > 80) {
		return json({ error: 'title 须为 1-80 个字符' }, 400);
	}
	if (typeof p.body !== 'string' || p.body.length < 1 || p.body.length > 5000) {
		return json({ error: 'body 须为 1-5000 个字符' }, 400);
	}
	if (p.ptype === 'spend') {
		if (typeof p.amount !== 'string' || !AMOUNT_RE.test(p.amount) || Number(p.amount) <= 0) {
			return json({ error: 'spend 提案的 amount 必须是 >0 的金额字符串（最多两位小数）' }, 400);
		}
		if (typeof p.recipient !== 'string' || p.recipient.length < 1 || p.recipient.length > 100) {
			return json({ error: 'spend 提案的 recipient 须为 1-100 个字符' }, 400);
		}
	}
	if (p.ptype === 'param' && !validateParamPatch(p.paramPatch)) {
		return json(
			{
				error:
					'paramPatch 不合法：仅支持 pointsPerYuan / proposeThreshold / votingPeriodMs(≥3600000) / quorumBps(≤10000)，值为 ≥0 的有限数',
			},
			400,
		);
	}

	const ok = await verifyMemberSignature(member.pubkey, proposeMessage(headHash, p), sig);
	if (!ok) return json({ error: '签名验证失败' }, 403);

	// ts 与 deadline 同源：保证链上精确满足 deadline = ts + 投票期快照，任何人可审计
	const ts = Date.now();
	const data: ProposalData = {
		...(p as {
			ptype: ProposalType;
			title: string;
			body: string;
			amount?: string;
			recipient?: string;
			paramPatch?: Partial<DaoParams>;
		}),
		deadline: ts + state.params.votingPeriodMs,
		quorumBps: state.params.quorumBps,
		proposer,
		headHash,
		sig,
	};
	const record = await appendLedger(env, {
		type: 'proposal',
		category: '提案',
		note: `提案：${p.title}（由 ${proposer} 发起）`,
		source: 'dao',
		data: { ...data },
		ts,
	});
	return json({ ok: true, pid: record.seq });
}
