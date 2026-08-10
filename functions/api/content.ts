// GET /api/content?slug=xxx&token=yyy
// 校验访问令牌，通过后从 CONTENT KV 返回付费正文 HTML。
import { json, verifyToken, type Env } from './_lib/alipay';

export async function onRequestGet(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	const url = new URL(request.url);
	const slug = url.searchParams.get('slug') || '';
	const token = url.searchParams.get('token') || '';
	if (!slug || !token) return json({ error: '缺少 slug 或 token' }, 400);

	const payload = await verifyToken(token, env.PAYWALL_TOKEN_SECRET);
	// 订阅令牌（slug = "subscription"）可解锁全部付费文章
	if (!payload || (payload.slug !== slug && payload.slug !== 'subscription')) {
		return json({ error: '令牌无效或已过期' }, 403);
	}

	const html = await env.CONTENT.get(`article:${slug}`);
	if (html == null) return json({ error: '内容不存在' }, 404);

	return json({ html });
}
