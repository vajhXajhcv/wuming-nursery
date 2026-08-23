// POST /api/dao/join —— 申请加入 DAO（公开）
// body: {handle: "2-24字符", pubkey: {kty:"EC", crv:"P-256", x, y}}
// 校验通过后写入 KV 待审核队列 dao:pending:<handle>，等待 approve-member 上链。
import { json, type Env } from '../_lib/alipay';
import { listLedger } from '../_lib/ledger';
import { importMemberPublicKey, replay, type EcPubJwk } from '../../../src/lib/dao-core';

const HANDLE_RE = /^[\w\u4e00-\u9fa5-]+$/u;
const PENDING_PREFIX = 'dao:pending:';

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	let body: { handle?: unknown; pubkey?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const handle = typeof body.handle === 'string' ? body.handle : '';
	if (handle.length < 2 || handle.length > 24 || !HANDLE_RE.test(handle)) {
		return json({ error: 'handle 须为 2-24 个字符（字母、数字、下划线、中文、连字符）' }, 400);
	}

	const pubkey = body.pubkey as EcPubJwk | undefined;
	if (
		!pubkey ||
		pubkey.kty !== 'EC' ||
		pubkey.crv !== 'P-256' ||
		typeof pubkey.x !== 'string' ||
		typeof pubkey.y !== 'string'
	) {
		return json({ error: 'pubkey 必须是含 x、y 的 EC P-256 JWK' }, 400);
	}
	try {
		await importMemberPublicKey(pubkey);
	} catch {
		return json({ error: 'pubkey 无法导入，请检查 JWK 内容' }, 400);
	}

	// 链上同名在册成员直接拒绝（已被移除的同名成员允许重新申请）
	const { records } = await listLedger(env);
	const state = replay(records);
	const existing = state.members[handle];
	if (existing && !existing.removed) {
		return json({ error: '该 handle 已是链上成员' }, 409);
	}

	// 幂等：同 handle 且同公钥的重复申请视为成功
	const key = PENDING_PREFIX + handle;
	const pendingRaw = await env.LEDGER.get(key);
	if (pendingRaw) {
		try {
			const pending = JSON.parse(pendingRaw) as { pubkey?: EcPubJwk };
			if (pending.pubkey && pending.pubkey.x === pubkey.x && pending.pubkey.y === pubkey.y) {
				return json({ ok: true });
			}
		} catch {
			// 记录损坏按冲突处理
		}
		return json({ error: '该 handle 已有待审核的申请' }, 409);
	}

	await env.LEDGER.put(key, JSON.stringify({ handle, pubkey, ts: Date.now() }));
	return json({ ok: true });
}
