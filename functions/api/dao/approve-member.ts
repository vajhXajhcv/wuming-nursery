// POST /api/dao/approve-member —— 审核加入申请 / 移除成员（ADMIN_TOKEN 保护）
// body: {handle, action: "approve"|"reject"|"remove"}
// approve：把待审核申请写为 member/add 链事件并删除待审核 key；
// reject：仅删除待审核 key；
// remove：写 member/remove 链事件（公钥保留在链上，供历史签名验证）。
import { checkAdminAuth, json, type Env, type KVNamespace } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import { replay, type EcPubJwk, type MemberData } from '../../../src/lib/dao-core';

const PENDING_PREFIX = 'dao:pending:';

// _lib/alipay.ts 的 KVNamespace 未声明 delete（真实 KV 运行时支持），此处本地补齐
type KVWithDelete = KVNamespace & { delete(key: string): Promise<void> };

interface PendingEntry {
	handle: string;
	pubkey: EcPubJwk;
	ts: number;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { handle?: unknown; action?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const handle = typeof body.handle === 'string' ? body.handle : '';
	if (!handle) return json({ error: '缺少 handle' }, 400);
	if (body.action !== 'approve' && body.action !== 'reject' && body.action !== 'remove') {
		return json({ error: 'action 必须是 approve / reject / remove' }, 400);
	}
	const action = body.action;
	const kv = env.LEDGER as KVWithDelete;
	const pendingKey = PENDING_PREFIX + handle;

	if (action === 'approve') {
		const raw = await env.LEDGER.get(pendingKey);
		if (!raw) return json({ error: '没有该 handle 的待审核申请' }, 404);
		let pending: PendingEntry;
		try {
			pending = JSON.parse(raw) as PendingEntry;
		} catch {
			return json({ error: '待审核记录已损坏' }, 500);
		}
		if (!pending.pubkey || typeof pending.pubkey.x !== 'string') {
			return json({ error: '待审核记录已损坏' }, 500);
		}
		const { records } = await listLedger(env);
		const state = replay(records);
		const m = state.members[handle];
		if (m && !m.removed) return json({ error: '该 handle 已是成员' }, 409);
		const data: MemberData = { action: 'add', handle, pubkey: pending.pubkey };
		await appendLedger(env, {
			type: 'member',
			category: '成员',
			note: '成员加入：' + handle,
			source: 'dao',
			data: { ...data },
		});
		await kv.delete(pendingKey);
		return json({ ok: true });
	}

	if (action === 'reject') {
		await kv.delete(pendingKey);
		return json({ ok: true });
	}

	// remove
	const { records } = await listLedger(env);
	const state = replay(records);
	const member = state.members[handle];
	if (!member || member.removed) return json({ error: '该 handle 不是在册成员' }, 404);
	const data: MemberData = { action: 'remove', handle, pubkey: member.pubkey };
	await appendLedger(env, {
		type: 'member',
		category: '成员',
		note: '成员移除：' + handle,
		source: 'dao',
		data: { ...data },
	});
	return json({ ok: true });
}
