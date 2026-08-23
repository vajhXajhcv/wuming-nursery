// POST /api/dao/params —— 治理参数变更（ADMIN_TOKEN 保护）
// body: {patch: {pointsPerYuan?, proposeThreshold?, votingPeriodMs?, quorumBps?}}
// 校验规则与 propose 端点的 paramPatch 一致。
import { checkAdminAuth, json, type Env } from '../_lib/alipay';
import { appendLedger } from '../_lib/ledger';
import { DEFAULT_PARAMS, type DaoParams } from '../../../src/lib/dao-core';

const PARAM_KEYS = Object.keys(DEFAULT_PARAMS) as (keyof DaoParams)[];

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
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { patch?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}
	if (!validateParamPatch(body.patch)) {
		return json(
			{
				error:
					'patch 不合法：仅支持 pointsPerYuan / proposeThreshold / votingPeriodMs(≥3600000) / quorumBps(≤10000)，值为 ≥0 的有限数',
			},
			400,
		);
	}
	const patch = body.patch;

	const entries = Object.entries(patch) as [string, number][];
	const note = '治理参数变更：' + entries.map(([k, v]) => `${k}=${v}`).join('，');
	await appendLedger(env, {
		type: 'params',
		category: '参数',
		note,
		source: 'dao',
		data: { patch: { ...patch } },
	});
	return json({ ok: true });
}
