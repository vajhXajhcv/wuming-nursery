// GET  /api/comments?slug=<slug> —— 某篇文章已公开的评论（仅 approved，按 ts 升序）
// POST /api/comments —— 提交评论，两条通道：
//   游客：{slug, name, content, token} —— Turnstile 校验通过 → pending（待审核）；
//         TURNSTILE_SECRET 未配置时 fail-closed（503 评论暂未开放）。
//   成员：{slug, name, content, handle, sig, cts} —— DAO 成员 ECDSA 验签通过 → approved（即时公开，免 Turnstile）。
//         签名消息格式：comment|<slug>|<name>|<content>|<cts>
//         （name/content 为清洗后的值，前端签名前需做同样的清洗；cts 为客户端毫秒时间戳，
//          服务端要求与本地时间相差 ≤10 分钟，防重放）
// 存储：COMMENTS KV，key = c:<slug>:<ts13>:<rand6>，value = {name, content, ts, status, member?}
// 限流：rl:<ip> 计数（expirationTtl 1 小时），游客 5 条/小时、成员 30 条/小时；
// IP 取自 CF-Connecting-IP，仅用于限流，不写入评论记录。
import { json, type Env } from './_lib/alipay';
import { listLedger } from './_lib/ledger';
import { replay, verifyMemberSignature } from '../../src/lib/dao-core';

const COMMENT_PREFIX = 'c:';
const RL_PREFIX = 'rl:';
const RL_TTL_SEC = 3600;
const RL_LIMIT_GUEST = 5;
const RL_LIMIT_MEMBER = 30;
const CTS_SKEW_MS = 10 * 60 * 1000;
const MAX_SLUG_LEN = 200;
const MAX_NAME_LEN = 20;
const MAX_CONTENT_LEN = 1000;

type CommentStatus = 'pending' | 'approved' | 'rejected';

interface CommentRecord {
	name: string;
	content: string;
	ts: number;
	status: CommentStatus;
	member?: string; // DAO 成员 handle（成员通道才有）
}

// slug 规范化：去首尾斜杠、仅允许 [a-z0-9\-/]，超长拒绝
function normalizeSlug(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const s = raw.trim().replace(/^\/+|\/+$/g, '');
	if (!s || s.length > MAX_SLUG_LEN) return null;
	if (!/^[a-z0-9\-/]+$/.test(s)) return null;
	return s;
}

// 去 HTML 标签 + 首尾空白（前端提交前做同样的清洗，成员签名针对清洗后的文本）
function cleanText(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	return raw.replace(/<[^>]*>/g, '').trim();
}

// 限流：先只读检查，所有校验通过后才 bump（KV 计数非原子，MVP 接受轻微超限）
async function rateLimited(env: Env, ip: string, isMember: boolean): Promise<boolean> {
	const raw = await env.COMMENTS.get(RL_PREFIX + ip);
	const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
	return count >= (isMember ? RL_LIMIT_MEMBER : RL_LIMIT_GUEST);
}

async function rateLimitBump(env: Env, ip: string): Promise<void> {
	const key = RL_PREFIX + ip;
	const raw = await env.COMMENTS.get(key);
	const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
	await env.COMMENTS.put(key, String(count + 1), { expirationTtl: RL_TTL_SEC });
}

export async function onRequestGet(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	const slug = normalizeSlug(new URL(request.url).searchParams.get('slug') || '');
	if (!slug) return json({ error: 'slug 不合法' }, 400);

	const out: CommentRecord[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.COMMENTS.list({ prefix: `${COMMENT_PREFIX}${slug}:`, cursor });
		for (const k of page.keys) {
			const raw = await env.COMMENTS.get(k.name);
			if (!raw) continue;
			try {
				const c = JSON.parse(raw) as CommentRecord;
				if (c.status === 'approved') out.push(c);
			} catch {
				// 单条损坏跳过
			}
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	out.sort((a, b) => a.ts - b.ts);
	return json({ comments: out });
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;

	let body: {
		slug?: unknown;
		name?: unknown;
		content?: unknown;
		token?: unknown;
		handle?: unknown;
		sig?: unknown;
		cts?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const slug = normalizeSlug(body.slug);
	if (!slug) return json({ error: 'slug 不合法' }, 400);
	const name = cleanText(body.name);
	const content = cleanText(body.content);
	if (!name || name.length > MAX_NAME_LEN) {
		return json({ error: `昵称必填且不超过 ${MAX_NAME_LEN} 字` }, 400);
	}
	if (!content || content.length > MAX_CONTENT_LEN) {
		return json({ error: `评论内容必填且不超过 ${MAX_CONTENT_LEN} 字` }, 400);
	}

	// 成员通道：handle + sig + cts 三者齐全；只给了一部分则直接报错（避免误落游客通道）
	const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
	const sig = typeof body.sig === 'string' ? body.sig : '';
	const cts = typeof body.cts === 'number' ? body.cts : NaN;
	const anyMemberField = Boolean(handle || sig || Number.isFinite(cts));
	const isMember = Boolean(handle && sig && Number.isFinite(cts));
	if (anyMemberField && !isMember) {
		return json({ error: '成员签名参数不完整（需 handle + sig + cts）' }, 400);
	}

	// 限流对两条通道都生效（先检查，验证全部通过后再 bump）
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	if (await rateLimited(env, ip, isMember)) {
		return json({ error: '提交过于频繁，请一小时后再试' }, 429);
	}

	let status: CommentStatus = 'pending';
	let memberHandle: string | undefined;

	if (isMember) {
		if (Math.abs(Date.now() - cts) > CTS_SKEW_MS) {
			return json({ error: '签名时间戳超出允许范围（±10 分钟），请刷新后重试' }, 400);
		}
		const { records } = await listLedger(env);
		const state = replay(records);
		const member = state.members[handle];
		if (!member || member.removed) return json({ error: '该 handle 不是在册成员' }, 403);
		const ok = await verifyMemberSignature(
			member.pubkey,
			`comment|${slug}|${name}|${content}|${cts}`,
			sig,
		);
		if (!ok) return json({ error: '签名验证失败' }, 403);
		status = 'approved';
		memberHandle = handle;
	} else {
		if (!env.TURNSTILE_SECRET) return json({ error: '评论暂未开放' }, 503);
		const token = typeof body.token === 'string' ? body.token : '';
		if (!token) return json({ error: '缺少人机验证 token' }, 400);
		const form = new URLSearchParams();
		form.set('secret', env.TURNSTILE_SECRET);
		form.set('response', token);
		form.set('remoteip', ip);
		let passed = false;
		try {
			const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
				method: 'POST',
				body: form,
			});
			const data = (await resp.json()) as { success?: boolean; hostname?: string };
			passed = data.success === true;
			// 配置了域名白名单时，siteverify 返回的 hostname 必须命中（防别的站点复用 sitekey）
			if (passed && env.TURNSTILE_HOSTNAMES) {
				const allowed = env.TURNSTILE_HOSTNAMES.split(',').map((h) => h.trim()).filter(Boolean);
				passed = allowed.length > 0 && typeof data.hostname === 'string' && allowed.includes(data.hostname);
			}
		} catch {
			passed = false; // siteverify 网络异常一律按失败处理（fail-closed）
		}
		if (!passed) return json({ error: '人机验证失败，请重试' }, 403);
	}

	await rateLimitBump(env, ip);

	const record: CommentRecord = {
		name,
		content,
		ts: Date.now(),
		status,
		...(memberHandle ? { member: memberHandle } : {}),
	};
	const rand = Math.random().toString(36).slice(2, 8);
	const key = `${COMMENT_PREFIX}${slug}:${record.ts}:${rand}`;
	await env.COMMENTS.put(key, JSON.stringify(record));
	return json({ ok: true, status });
}
