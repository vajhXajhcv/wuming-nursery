// DAO 治理核心（纯函数，零依赖）：链记录类型、规范化序列化、哈希链校验、
// 链重放 reducer（成员/贡献点/提案/投票/决议/执行/参数/锚定）、ECDSA P-256 签名验签。
// 同一份代码被两端使用：
//   - functions/api/**（Cloudflare Pages Functions，服务端校验与写链）
//   - src/pages/**（Astro 打包进浏览器，任何人可独立重放验证）
// 哈希规则（向后兼容旧账本）：
//   base = prev|seq|ts|type|amount|category|note|source|ref
//   hash = SHA-256(data 存在 ? base + '|' + stableStringify(data) : base)
// 旧 income/expense 记录没有 data 字段，哈希值与旧算法完全一致。

// ---- 链记录基础类型 ----

export const GENESIS = 'GENESIS';
export const HEAD_KEY = 'ledger:head';
export const REC_PREFIX = 'ledger:rec:';

// 财务事件沿用旧类型；DAO 事件统一使用下列新类型
export type FinancialType = 'income' | 'expense';
export type DaoEventType =
	| 'member' // 成员加入/移除
	| 'contribution' // 贡献核定（资金/劳动，产生贡献点）
	| 'proposal' // 提案
	| 'vote' // 投票
	| 'resolution' // 提案决议（关闭计票结果）
	| 'execution' // 支出提案执行回执
	| 'params' // 治理参数变更
	| 'anchor'; // 链头外部锚定（OpenTimestamps）
export type RecordType = FinancialType | DaoEventType;

export type RecordSource = 'manual' | 'alipay' | 'afdian' | 'dao';

export interface ChainRecord {
	seq: number;
	ts: number; // 毫秒时间戳
	prev: string; // 前序哈希，创世记录为 GENESIS
	type: RecordType;
	amount: string; // 财务记录为两位小数字符串；DAO 事件为 ''
	category: string; // 财务分类；DAO 事件为事件简述（如 提案/投票）
	note: string; // 人类可读摘要
	source: RecordSource;
	ref: string; // 关联单号 / 交叉引用（如 dao:proposal:<pid>）
	hash: string;
	data?: Record<string, unknown>; // DAO 事件负载；财务记录无此字段
}

export interface ChainHead {
	seq: number;
	hash: string;
}

// ---- 规范化 JSON 序列化（键序稳定，undefined 丢弃，与 JSON 语义一致） ----

export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj)
		.filter((k) => obj[k] !== undefined)
		.sort();
	return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

// ---- 哈希 ----

export async function sha256Hex(text: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// 记录哈希内容：9 个基础字段拼接；有 data 时追加规范化 JSON（旧记录无 data，结果与旧算法一致）
export function recordContent(r: Omit<ChainRecord, 'hash'>): string {
	const base = [r.prev, r.seq, r.ts, r.type, r.amount, r.category, r.note, r.source, r.ref || ''].join(
		'|',
	);
	return r.data ? base + '|' + stableStringify(r.data) : base;
}

export async function hashRecord(r: Omit<ChainRecord, 'hash'>): Promise<string> {
	return sha256Hex(recordContent(r));
}

// 整链校验：prev 链接 + 每条哈希重算 + （可选）链头一致性
export async function verifyChain(
	records: ChainRecord[],
	head?: ChainHead,
): Promise<{ valid: boolean; brokenAt: number | null }> {
	let prev = GENESIS;
	for (const r of records) {
		if (r.prev !== prev) return { valid: false, brokenAt: r.seq };
		if ((await hashRecord(r)) !== r.hash) return { valid: false, brokenAt: r.seq };
		prev = r.hash;
	}
	if (head && records.length && head.hash !== prev) return { valid: false, brokenAt: -1 };
	return { valid: true, brokenAt: null };
}

// ---- ECDSA P-256 成员签名（WebCrypto，浏览器与 Workers 行为一致：签名为 raw r||s 64 字节） ----

export interface EcPubJwk {
	kty: 'EC';
	crv: 'P-256';
	x: string;
	y: string;
}

export function b64urlFromBytes(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function bytesFromB64url(s: string): Uint8Array {
	let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	while (b64.length % 4) b64 += '=';
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function importMemberPublicKey(jwk: EcPubJwk): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		{ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true } as JsonWebKey,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify'],
	);
}

export async function verifyMemberSignature(
	jwk: EcPubJwk,
	message: string,
	sigB64url: string,
): Promise<boolean> {
	try {
		const key = await importMemberPublicKey(jwk);
		return await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			bytesFromB64url(sigB64url) as BufferSource,
			new TextEncoder().encode(message),
		);
	} catch {
		return false;
	}
}

// ---- 签名消息格式（均含当前链头哈希，防重放、串行化写入；服务端要求与当前链头严格一致） ----

export function voteMessage(headHash: string, pid: number, choice: VoteChoice): string {
	return `vote|${headHash}|${pid}|${choice}`;
}

// 提案签名负载：可选字段为空时必须整个省略（stableStringify 语义），两端才能重算一致
export function proposeMessage(headHash: string, payload: Record<string, unknown>): string {
	return `propose|${headHash}|${stableStringify(payload)}`;
}

// ---- 治理参数 ----

export interface DaoParams {
	pointsPerYuan: number; // 资金贡献核定时的参考折算率（¥1 = N 点）
	proposeThreshold: number; // 发起提案所需贡献点
	votingPeriodMs: number; // 投票期
	quorumBps: number; // 法定人数（基点，2000 = 20%）：参与权重 ≥ 总权重 × quorumBps/10000
}

export const DEFAULT_PARAMS: DaoParams = {
	pointsPerYuan: 1,
	proposeThreshold: 50,
	votingPeriodMs: 7 * 24 * 3600 * 1000,
	quorumBps: 2000,
};

// ---- DAO 事件负载类型 ----

export interface MemberData {
	action: 'add' | 'remove';
	handle: string;
	pubkey: EcPubJwk;
}

export interface ContributionData {
	handle: string;
	kind: string; // money / article / code / translation / design / ops ...
	points: number;
	ref?: string; // kind=money 时为 'ledger#<seq>'，交叉引用账本收入记录
	evidence?: string; // 链接或说明
}

export type ProposalType = 'spend' | 'text' | 'param';
export type VoteChoice = 'for' | 'against' | 'abstain';

export interface ProposalData {
	ptype: ProposalType;
	title: string;
	body: string;
	amount?: string; // spend：金额（元，两位小数）
	recipient?: string; // spend：收款方说明
	paramPatch?: Partial<DaoParams>; // param：参数变更
	deadline: number; // = 提案 ts + 创建时投票期快照
	quorumBps: number; // 创建时法定人数快照
	proposer: string;
	headHash: string; // 发起时链头（已签入签名）
	sig: string; // proposer 对 proposeMessage 的签名
}

export interface VoteData {
	pid: number;
	handle: string;
	choice: VoteChoice;
	weight: number; // 服务端按提案快照算出；reducer 独立重算校验，不信任此值
	sig: string;
}

export interface ResolutionData {
	pid: number;
	outcome: 'passed' | 'rejected';
	for: number;
	against: number;
	abstain: number;
	turnout: number; // 参与权重
	totalWeight: number; // 快照总权重
	quorumReached: boolean;
}

export interface ExecutionData {
	pid: number;
	ledgerSeq: number; // 对应 expense 记录的 seq
}

export interface AnchorData {
	anchoredSeq: number;
	anchoredHash: string;
	otsFile: string; // public/dao/anchors/ 下的证明文件名
}

// ---- 链重放：从整条链确定性推出治理状态 ----

export interface MemberInfo {
	handle: string;
	pubkey: EcPubJwk;
	joinedSeq: number;
	joinedTs: number;
	removed: boolean;
	removedSeq?: number;
}

export interface PointsInfo {
	total: number;
	money: number; // kind=money 的贡献点
	labor: number; // 其余 kind
}

export interface VoteInfo extends VoteData {
	seq: number;
	ts: number;
	valid: boolean; // reducer 重算后判定；无效票保留可见但不计入
}

export interface ProposalState {
	pid: number; // = 提案记录 seq
	seq: number;
	ts: number;
	data: ProposalData;
	votes: VoteInfo[];
	resolution?: ResolutionData & { seq: number; ts: number };
	execution?: ExecutionData & { seq: number; ts: number };
}

export interface AnchorInfo {
	seq: number;
	ts: number;
	data: AnchorData;
}

export interface DaoState {
	params: DaoParams;
	members: Record<string, MemberInfo>; // 全部出现过的成员（含已移除，removed 标记）
	points: Record<string, PointsInfo>; // 当前累计贡献点
	proposals: Record<number, ProposalState>;
	anchors: AnchorInfo[];
}

// 某 handle 在 uptoSeq（不含）之前的累计贡献点
export function pointsAt(records: ChainRecord[], uptoSeq: number, handle: string): PointsInfo {
	let money = 0;
	let labor = 0;
	for (const r of records) {
		if (r.seq >= uptoSeq) break;
		if (r.type !== 'contribution' || !r.data) continue;
		const d = r.data as unknown as ContributionData;
		if (d.handle !== handle || typeof d.points !== 'number' || d.points <= 0) continue;
		if (d.kind === 'money') money += d.points;
		else labor += d.points;
	}
	return { total: money + labor, money, labor };
}

// 快照时刻（uptoSeq 不含）的在册成员句柄集合
export function activeHandlesAt(records: ChainRecord[], uptoSeq: number): Set<string> {
	const removed = new Set<string>();
	const added = new Set<string>();
	for (const r of records) {
		if (r.seq >= uptoSeq) break;
		if (r.type !== 'member' || !r.data) continue;
		const d = r.data as unknown as MemberData;
		if (d.action === 'add') added.add(d.handle);
		else removed.add(d.handle);
	}
	for (const h of removed) added.delete(h);
	return added;
}

// 快照总权重 = 快照时在册成员的贡献点之和
export function totalWeightAt(records: ChainRecord[], uptoSeq: number): number {
	let total = 0;
	for (const h of activeHandlesAt(records, uptoSeq)) {
		total += pointsAt(records, uptoSeq, h).total;
	}
	return total;
}

export function replay(records: ChainRecord[]): DaoState {
	const state: DaoState = {
		params: { ...DEFAULT_PARAMS },
		members: {},
		points: {},
		proposals: {},
		anchors: [],
	};

	const addPoints = (handle: string, kind: string, points: number) => {
		const p = (state.points[handle] ||= { total: 0, money: 0, labor: 0 });
		p.total += points;
		if (kind === 'money') p.money += points;
		else p.labor += points;
	};

	for (const r of records) {
		const d = (r.data || {}) as Record<string, unknown>;
		switch (r.type) {
			case 'member': {
				const m = d as unknown as MemberData;
				if (!m.handle || !m.pubkey) break;
				if (m.action === 'add') {
					state.members[m.handle] = {
						handle: m.handle,
						pubkey: m.pubkey,
						joinedSeq: r.seq,
						joinedTs: r.ts,
						removed: false,
					};
				} else if (state.members[m.handle]) {
					state.members[m.handle].removed = true;
					state.members[m.handle].removedSeq = r.seq;
				}
				break;
			}
			case 'contribution': {
				const c = d as unknown as ContributionData;
				if (c.handle && typeof c.points === 'number' && c.points > 0) {
					addPoints(c.handle, c.kind || 'other', c.points);
				}
				break;
			}
			case 'proposal': {
				const p = d as unknown as ProposalData;
				state.proposals[r.seq] = { pid: r.seq, seq: r.seq, ts: r.ts, data: p, votes: [] };
				break;
			}
			case 'vote': {
				const v = d as unknown as VoteData;
				const prop = state.proposals[v.pid];
				if (!prop || v.pid >= r.seq) break;
				// reducer 独立重算权重（快照），不信任事件里的 weight 字段
				const weight = pointsAt(records, v.pid, v.handle).total;
				const eligible =
					weight > 0 &&
					state.members[v.handle] !== undefined &&
					state.members[v.handle].joinedSeq < v.pid && // 提案前已加入（快照内含权重）
					!prop.votes.some((x) => x.handle === v.handle && x.valid);
				prop.votes.push({ ...v, seq: r.seq, ts: r.ts, valid: eligible });
				break;
			}
			case 'resolution': {
				const res = d as unknown as ResolutionData;
				const prop = state.proposals[res.pid];
				if (prop && !prop.resolution) prop.resolution = { ...res, seq: r.seq, ts: r.ts };
				break;
			}
			case 'execution': {
				const ex = d as unknown as ExecutionData;
				const prop = state.proposals[ex.pid];
				if (prop) prop.execution = { ...ex, seq: r.seq, ts: r.ts };
				break;
			}
			case 'params': {
				const patch = (d.patch || {}) as Partial<DaoParams>;
				for (const k of Object.keys(patch) as (keyof DaoParams)[]) {
					const val = patch[k];
					if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
						state.params[k] = val;
					}
				}
				break;
			}
			case 'anchor': {
				state.anchors.push({ seq: r.seq, ts: r.ts, data: d as unknown as AnchorData });
				break;
			}
		}
	}
	return state;
}

// ---- 计票（任何人可对链重放后独立重算） ----

export interface Tally {
	for: number;
	against: number;
	abstain: number;
	turnout: number; // for+against+abstain（有效票权重和）
	totalWeight: number; // 快照总权重
	quorumReached: boolean;
	passed: boolean; // 法定人数达成且赞成 > 反对
}

export function tally(records: ChainRecord[], prop: ProposalState): Tally {
	let forW = 0,
		againstW = 0,
		abstainW = 0;
	for (const v of prop.votes) {
		if (!v.valid) continue;
		if (v.choice === 'for') forW += v.weight;
		else if (v.choice === 'against') againstW += v.weight;
		else abstainW += v.weight;
	}
	const totalWeight = totalWeightAt(records, prop.pid);
	const turnout = forW + againstW + abstainW;
	const quorumReached = turnout * 10000 >= totalWeight * prop.data.quorumBps;
	return {
		for: forW,
		against: againstW,
		abstain: abstainW,
		turnout,
		totalWeight,
		quorumReached,
		passed: quorumReached && forW > againstW,
	};
}

// 提案展示状态
export type ProposalStatus = 'active' | 'passed' | 'rejected' | 'executed' | 'expired';
// expired = 已过投票期但尚未写 resolution（待关闭）

export function proposalStatus(prop: ProposalState, now: number): ProposalStatus {
	if (prop.execution) return 'executed';
	if (prop.resolution) return prop.resolution.outcome === 'passed' ? 'passed' : 'rejected';
	return now <= prop.data.deadline ? 'active' : 'expired';
}
