// POST /api/dao/pending —— 列出待审核的加入申请（ADMIN_TOKEN 保护）
import { checkAdminAuth, json, type Env } from '../_lib/alipay';

const PENDING_PREFIX = 'dao:pending:';

interface PendingEntry {
	handle: string;
	pubkey: unknown;
	ts: number;
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	const pending: PendingEntry[] = [];
	let cursor: string | undefined;
	// KV list 分页拉取全部待审核记录
	do {
		const page = await env.LEDGER.list({ prefix: PENDING_PREFIX, cursor });
		for (const k of page.keys) {
			const raw = await env.LEDGER.get(k.name);
			if (!raw) continue;
			try {
				pending.push(JSON.parse(raw) as PendingEntry);
			} catch {
				// 跳过损坏的记录
			}
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	pending.sort((a, b) => a.ts - b.ts);
	return json({ pending });
}
