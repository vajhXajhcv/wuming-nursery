// DAO 前端共享层（浏览器端，纯 TS 零依赖）：链数据加载与本地校验、统一 API POST、
// 格式化助手、成员密钥读取与签名、提案/投票条 HTML 片段、加载/错误态渲染。
// 链逻辑（哈希/重放/计票/签名消息格式）一律来自 ./dao-core，本文件只做 IO 与展示。

import { verifyChain, replay, tally, b64urlFromBytes } from './dao-core';
import type {
	ChainRecord,
	ChainHead,
	DaoState,
	ProposalState,
	ProposalStatus,
} from './dao-core';

// ---- 链数据加载（同源 /api/ledger/list，页面内缓存，组件与页面脚本共享一次请求） ----

export interface LoadedChain {
	records: ChainRecord[];
	head: ChainHead | null;
	/** 服务端给出的校验结论（仅作展示，不代表本地验证） */
	serverChain: { valid: boolean; brokenAt: number | null } | null;
	/** 浏览器本地 verifyChain 结论 */
	verify: { valid: boolean; brokenAt: number | null };
	/** replay 重放出的治理状态 */
	state: DaoState;
}

let chainCache: Promise<LoadedChain> | null = null;

async function doLoadChain(): Promise<LoadedChain> {
	let resp: Response;
	try {
		resp = await fetch('/api/ledger/list');
	} catch {
		throw new Error('链数据加载失败：网络错误，请检查网络后重试。');
	}
	if (!resp.ok) throw new Error(`链数据加载失败（HTTP ${resp.status}）。`);
	const data = await resp.json().catch(() => null);
	if (!data || !Array.isArray(data.records)) throw new Error('链数据加载失败：响应格式异常。');
	const records = data.records as ChainRecord[];
	const head = (data.head || null) as ChainHead | null;
	const serverChain = (data.chain || null) as LoadedChain['serverChain'];
	const verify = await verifyChain(records, head ?? undefined);
	const state = replay(records);
	return { records, head, serverChain, verify, state };
}

/**
 * 加载整条链：拉取 → 本地 verifyChain 校验 → replay 重放。
 * 同一页面内多次调用共享一次请求；写操作后需要最新数据时传 force=true。
 * 失败抛出带中文信息的 Error。
 */
export function loadChain(force = false): Promise<LoadedChain> {
	if (!force && chainCache) return chainCache;
	const p = doLoadChain();
	chainCache = p;
	// 失败不缓存，允许下次重试
	p.catch(() => {
		if (chainCache === p) chainCache = null;
	});
	return p;
}

/** 取最新链头哈希（投票/提案签名前调用，不使用缓存） */
export async function fetchHeadHash(): Promise<string> {
	let resp: Response;
	try {
		resp = await fetch('/api/ledger/list');
	} catch {
		throw new Error('网络错误，取不到链头哈希。');
	}
	const data = await resp.json().catch(() => null);
	const headHash: unknown = data && data.head && data.head.hash;
	if (typeof headHash !== 'string' || !headHash) throw new Error('取不到链头哈希');
	return headHash;
}

// ---- 统一 JSON POST（非 2xx 抛错，带服务端 error 字段；err.status 携带 HTTP 状态码供 409 等分支判断） ----

export async function apiPost<T = unknown>(path: string, body: unknown, token?: string): Promise<T> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (token) headers['Authorization'] = 'Bearer ' + token;
	let resp: Response;
	try {
		resp = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
	} catch {
		throw new Error('网络错误，请稍后重试。');
	}
	const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
	if (!resp.ok) {
		const err = new Error(
			typeof data.error === 'string' && data.error ? data.error : `请求失败（HTTP ${resp.status}）`,
		);
		(err as Error & { status?: number }).status = resp.status;
		throw err;
	}
	return data as T;
}

// ---- 格式化助手 ----

export function escapeHtml(s: unknown): string {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function fmtTime(ts: number): string {
	const d = new Date(ts);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDate(ts: number): string {
	const d = new Date(ts);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtPts(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function fmtMoney(n: number): string {
	return '¥' + n.toFixed(2);
}

export function shortHash(hash: string, len = 16): string {
	return hash.slice(0, len) + '…';
}

/** 治理参数值的人类可读格式（提案详情与章程参数表共用） */
export function fmtParam(key: string, v: unknown): string {
	if (key === 'votingPeriodMs') return Number(v) / (24 * 3600 * 1000) + ' 天';
	if (key === 'quorumBps') return Number(v) / 100 + '%';
	return String(v);
}

// ---- 展示标签映射 ----

export const PTYPE_LABEL: Record<string, string> = { spend: '支出', text: '文本', param: '参数' };
export const STATUS_LABEL: Record<string, string> = {
	active: '投票中',
	expired: '待关闭',
	passed: '已通过',
	rejected: '已拒绝',
	executed: '已执行',
};
export const CHOICE_LABEL: Record<string, string> = { for: '赞成', against: '反对', abstain: '弃权' };

// ---- 成员密钥（localStorage 'dao:key:<handle>'，与 join 页生成/导入格式一致） ----

export const MEMBER_KEY_PREFIX = 'dao:key:';

/** 扫描本机已导入的成员身份 handle 列表 */
export function listMemberKeys(): string[] {
	const out: string[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith(MEMBER_KEY_PREFIX)) out.push(k.slice(MEMBER_KEY_PREFIX.length));
		}
	} catch {}
	return out;
}

/** 读取某身份的私钥 JWK；不存在或格式不符返回 null */
export function getMemberKey(handle: string): JsonWebKey | null {
	try {
		const raw = localStorage.getItem(MEMBER_KEY_PREFIX + handle);
		if (!raw) return null;
		const jwk = JSON.parse(raw) as JsonWebKey;
		if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) return null;
		return jwk;
	} catch {
		return null;
	}
}

/**
 * 用本机私钥签名消息（ECDSA P-256 + SHA-256，raw r||s 64 字节 base64url）。
 * 与 dao-core 验签端字节级兼容；消息格式（vote|… / propose|…）由 dao-core 的
 * voteMessage / proposeMessage 生成，本函数不触碰格式。
 */
export async function signMessage(handle: string, message: string): Promise<string> {
	const jwk = getMemberKey(handle);
	if (!jwk) throw new Error(`本机找不到身份「${handle}」的私钥，请先到加入页导入。`);
	const key = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign'],
	);
	const buf = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		new TextEncoder().encode(message),
	);
	return b64urlFromBytes(new Uint8Array(buf));
}

// ---- 投票条 / 提案卡片 HTML（样式分别在 VoteBar.astro / ProposalCards.astro 里，is:global） ----

/** 三段式投票条；百分比由调用方算好。big=true 用于提案详情页（10px 高） */
export function voteBarHtml(forPct: number, againstPct: number, abstainPct = 0, big = false): string {
	const seg = (cls: string, w: number) => `<div class="${cls}" style="width:${w}%"></div>`;
	return (
		`<div class="vote-bar${big ? ' big' : ''}">` +
		seg('for', forPct) +
		seg('against', againstPct) +
		(abstainPct > 0 ? seg('abstain', abstainPct) : '') +
		`</div>`
	);
}

/** DAO 总览页「进行中的提案」条目（.prop-item 变体，只显示赞成/反对） */
export function proposalItemHtml(records: ChainRecord[], p: ProposalState): string {
	const t = tally(records, p);
	const denom = t.for + t.against;
	const forW = denom ? (t.for / denom) * 100 : 0;
	const againstW = denom ? (t.against / denom) * 100 : 0;
	return (
		`<a class="prop-item" href="/dao/proposal?pid=${p.pid}">` +
		`<div class="prop-title">#${p.pid} ${escapeHtml(p.data.title)}</div>` +
		`<div class="prop-meta">截止 ${fmtTime(p.data.deadline)}</div>` +
		voteBarHtml(forW, againstW) +
		`<div class="vote-nums">赞成 ${fmtPts(t.for)} · 反对 ${fmtPts(t.against)}</div>` +
		`</a>`
	);
}

/** 提案列表页卡片（.prop-card 变体，含类型徽章、参与率与法定人数结论） */
export function proposalCardHtml(records: ChainRecord[], p: ProposalState, status: ProposalStatus): string {
	const t = tally(records, p);
	const denom = t.turnout || 1;
	const forW = (t.for / denom) * 100;
	const againstW = (t.against / denom) * 100;
	const abstainW = (t.abstain / denom) * 100;
	const turnoutPct = t.totalWeight > 0 ? ((t.turnout / t.totalWeight) * 100).toFixed(1) : '0.0';
	const timeLabel =
		status === 'active' || status === 'expired'
			? '截止 ' + fmtTime(p.data.deadline)
			: '关闭 ' + fmtTime((p.resolution ?? p.execution)!.ts);
	return (
		`<a class="prop-card" href="/dao/proposal?pid=${p.pid}">` +
		`<div class="prop-top"><span class="pid">#${p.pid}</span>` +
		`<span class="badge">${PTYPE_LABEL[p.data.ptype] || escapeHtml(p.data.ptype)}</span>` +
		`<span class="prop-title">${escapeHtml(p.data.title)}</span></div>` +
		`<div class="prop-meta">发起人 ${escapeHtml(p.data.proposer)} · ${timeLabel}</div>` +
		voteBarHtml(forW, againstW, abstainW) +
		`<div class="vote-nums">赞成 ${fmtPts(t.for)} · 反对 ${fmtPts(t.against)} · 弃权 ${fmtPts(t.abstain)} · 参与率 ${turnoutPct}% · ` +
		(t.quorumReached
			? '<span class="quorum-ok">已达法定人数</span>'
			: '<span class="quorum-no">未达法定人数</span>') +
		`</div></a>`
	);
}

// ---- 加载 / 错误 / 空态 ----

export function loadingHtml(text = '加载中…'): string {
	return `<div class="empty">⏳ ${escapeHtml(text)}</div>`;
}

/** 错误卡（含重试按钮），配合 bindRetry 使用；样式全部来自全局 .empty/.btn */
export function errorHtml(msg: string): string {
	return (
		`<div class="empty">❌ ${escapeHtml(msg)}<br>` +
		`<button type="button" class="btn btn-outline" data-retry style="margin-top:0.8em">重试</button></div>`
	);
}

/** 给 errorHtml 渲染出的重试按钮绑定回调（通常重跑页面的 init） */
export function bindRetry(el: HTMLElement, retry: () => void): void {
	el.querySelector('[data-retry]')?.addEventListener('click', retry);
}

// ---- 浏览器独立验链（ChainStatus 组件与章程页共用同一套徽标语义） ----

export async function runLocalVerify(badge: HTMLElement): Promise<void> {
	badge.textContent = '⏳ 正在本地重算…';
	badge.classList.remove('ok', 'bad');
	try {
		const c = await loadChain();
		const res = await verifyChain(c.records, c.head ?? undefined);
		if (res.valid) {
			badge.textContent = `✅ 本地验证通过（${c.records.length} 条）`;
			badge.classList.add('ok');
		} else if (res.brokenAt === -1) {
			badge.textContent = '❌ 链头与末条记录不符';
			badge.classList.add('bad');
		} else {
			badge.textContent = '❌ 链断裂于 #' + res.brokenAt;
			badge.classList.add('bad');
		}
	} catch (err) {
		badge.textContent = '❌ ' + ((err as Error).message || '链数据加载失败，无法验链');
		badge.classList.add('bad');
	}
}
