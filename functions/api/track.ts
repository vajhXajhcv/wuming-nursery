// /api/track：付费墙匿名转化漏斗统计。
// POST {event} 自增计数；GET 返回各事件总计与近 30 天按天计数。
// 不记录 IP/UA/Referer 等任何身份信息，只有事件名 + 日期计数。
// 注意（MVP 取舍）：不做限流/去重，计数可被刷高，仅作趋势参考；
// 自增为 read-modify-write，极端并发下可能丢计数，业务上可接受。
import { json, type Env } from './_lib/alipay';

const EVENTS = [
	'paywall_view',
	'alipay_click',
	'afdian_click',
	'redeem_click',
	// 工具漏斗：在线工具曝光与真实使用
	'tool_md2docx_view',
	'tool_md2docx_convert',
	'tool_docxcheck_view',
	'tool_docxcheck_run',
] as const;
type EventName = (typeof EVENTS)[number];

// 与站点口径一致按 GMT+8 的日期分桶
function dayKey(offsetDays = 0): string {
	const t = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000);
	return t.toISOString().slice(0, 10);
}

async function incr(env: Env, key: string): Promise<void> {
	const cur = parseInt((await env.ORDERS.get(key)) || '0', 10) || 0;
	await env.ORDERS.put(key, String(cur + 1));
}

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	let event = '';
	try {
		const data = (await request.json()) as { event?: string };
		event = typeof data.event === 'string' ? data.event : '';
	} catch {
		// 非法 JSON 走下面的白名单校验
	}
	if (!EVENTS.includes(event as EventName)) return json({ error: '未知事件' }, 400);
	try {
		await incr(env, `stats:${event}:total`);
		await incr(env, `stats:${event}:${dayKey()}`);
	} catch {
		// 统计失败静默：前端不依赖，绝不能影响支付流程
	}
	return new Response(null, { status: 204 });
}

export async function onRequestGet(context: { env: Env }): Promise<Response> {
	const { env } = context;
	const days: string[] = [];
	for (let i = 29; i >= 0; i--) days.push(dayKey(-i));
	const totals: Record<string, number> = {};
	const daily: Record<string, Record<string, number>> = {};
	for (const event of EVENTS) {
		totals[event] = parseInt((await env.ORDERS.get(`stats:${event}:total`)) || '0', 10) || 0;
		const d: Record<string, number> = {};
		for (const day of days) {
			d[day] = parseInt((await env.ORDERS.get(`stats:${event}:${day}`)) || '0', 10) || 0;
		}
		daily[event] = d;
	}
	return json({ days, totals, daily });
}
