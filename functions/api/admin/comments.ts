// GET  /api/admin/comments?status=pending —— 按状态列出评论（含 KV key；ADMIN_TOKEN 保护）
// POST /api/admin/comments {key, action: "approve"|"reject"|"delete"}
//   approve/reject：改评论状态；delete：物理删除 KV 记录。
import { checkAdminAuth, json, type Env } from '../_lib/alipay';

const COMMENT_PREFIX = 'c:';
const STATUSES = ['pending', 'approved', 'rejected'];
const MAX_RETURN = 200;

interface CommentRecord {
	name: string;
	content: string;
	ts: number;
	status: string;
	member?: string;
}

// key = c:<slug>:<ts13>:<rand6>；slug 本身可能含 '/'，从右侧剥掉 :<rand> 与 :<ts> 两段
function slugFromKey(key: string): string {
	const rest = key.slice(COMMENT_PREFIX.length);
	const beforeRand = rest.slice(0, rest.lastIndexOf(':'));
	const tsColon = beforeRand.lastIndexOf(':');
	return tsColon >= 0 ? beforeRand.slice(0, tsColon) : beforeRand;
}

export async function onRequestGet(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	const status = new URL(request.url).searchParams.get('status') || 'pending';
	if (!STATUSES.includes(status)) return json({ error: 'status 不合法' }, 400);

	const out: (CommentRecord & { key: string; slug: string })[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.COMMENTS.list({ prefix: COMMENT_PREFIX, cursor });
		for (const k of page.keys) {
			const raw = await env.COMMENTS.get(k.name);
			if (!raw) continue;
			try {
				const c = JSON.parse(raw) as CommentRecord;
				if (c.status === status) out.push({ key: k.name, slug: slugFromKey(k.name), ...c });
			} catch {
				// 单条损坏跳过
			}
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	out.sort((a, b) => b.ts - a.ts);
	return json({ comments: out.slice(0, MAX_RETURN) });
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { key?: unknown; action?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const key = typeof body.key === 'string' ? body.key : '';
	if (!key.startsWith(COMMENT_PREFIX)) return json({ error: 'key 不合法' }, 400);
	if (body.action !== 'approve' && body.action !== 'reject' && body.action !== 'delete') {
		return json({ error: 'action 必须是 approve / reject / delete' }, 400);
	}
	const action = body.action;

	if (action === 'delete') {
		await env.COMMENTS.delete(key);
		return json({ ok: true });
	}

	const raw = await env.COMMENTS.get(key);
	if (!raw) return json({ error: '评论不存在' }, 404);
	let record: CommentRecord;
	try {
		record = JSON.parse(raw) as CommentRecord;
	} catch {
		return json({ error: '评论记录已损坏' }, 500);
	}
	record.status = action === 'approve' ? 'approved' : 'rejected';
	await env.COMMENTS.put(key, JSON.stringify(record));
	return json({ ok: true, status: record.status });
}
