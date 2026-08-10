// 哈希链账本核心：追加式记录，每条包含前序哈希，篡改任何历史记录都会导致链校验失败。
// 链头存 KV key "ledger:head"，记录存 "ledger:rec:<seq>"。
// 注意：KV 无事务，极端并发下可能分叉；MVP 接受此限制，后续可迁 Durable Object。

import type { KVNamespace } from './alipay';

export interface LedgerInput {
	type: 'income' | 'expense';
	amount: string; // 元，两位小数字符串
	category: string; // 分类，如 付费阅读 / 办公支出
	note: string; // 摘要
	source: 'manual' | 'alipay' | 'afdian'; // 渠道标注：manual=手动录入，其余为自动渠道
	ref?: string; // 关联单号（可选）
}

export interface LedgerRecord extends LedgerInput {
	seq: number;
	ts: number; // 毫秒时间戳
	prev: string; // 前序哈希，创世记录为 "GENESIS"
	hash: string;
}

export interface LedgerHead {
	seq: number;
	hash: string;
}

const HEAD_KEY = 'ledger:head';
const REC_PREFIX = 'ledger:rec:';
export const GENESIS = 'GENESIS';

interface LedgerEnv {
	LEDGER: KVNamespace;
}

async function sha256Hex(text: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// 记录哈希：前序哈希 + 全部字段的规范化拼接
export function recordContent(r: Omit<LedgerRecord, 'hash'>): string {
	return [r.prev, r.seq, r.ts, r.type, r.amount, r.category, r.note, r.source, r.ref || ''].join(
		'|',
	);
}

export async function appendLedger(
	env: LedgerEnv,
	input: LedgerInput,
): Promise<LedgerRecord> {
	const headRaw = await env.LEDGER.get(HEAD_KEY);
	const head: LedgerHead = headRaw ? JSON.parse(headRaw) : { seq: 0, hash: GENESIS };

	const record: Omit<LedgerRecord, 'hash'> = {
		seq: head.seq + 1,
		ts: Date.now(),
		prev: head.hash,
		type: input.type,
		amount: Number(input.amount).toFixed(2),
		category: input.category,
		note: input.note,
		source: input.source,
		ref: input.ref || '',
	};
	const hash = await sha256Hex(recordContent(record));
	const full: LedgerRecord = { ...record, hash };

	// seq 前补零，保证 KV list 按字典序即按时间序
	const key = `${REC_PREFIX}${String(full.seq).padStart(12, '0')}`;
	await env.LEDGER.put(key, JSON.stringify(full));
	await env.LEDGER.put(HEAD_KEY, JSON.stringify({ seq: full.seq, hash }));
	return full;
}

export async function listLedger(env: LedgerEnv): Promise<{
	records: LedgerRecord[];
	head: LedgerHead;
}> {
	const records: LedgerRecord[] = [];
	let cursor: string | undefined;
	// KV list 分页拉取全部记录
	do {
		const page = (await env.LEDGER.list({ prefix: REC_PREFIX, cursor })) as {
			keys: { name: string }[];
			cursor?: string;
			list_complete: boolean;
		};
		for (const k of page.keys) {
			const raw = await env.LEDGER.get(k.name);
			if (raw) records.push(JSON.parse(raw));
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	records.sort((a, b) => a.seq - b.seq);
	const headRaw = await env.LEDGER.get(HEAD_KEY);
	const head: LedgerHead = headRaw ? JSON.parse(headRaw) : { seq: 0, hash: GENESIS };
	return { records, head };
}

// 服务端整链校验（公开页前端也会独立校验一遍）
export async function verifyLedger(records: LedgerRecord[]): Promise<{
	valid: boolean;
	brokenAt: number | null;
}> {
	let prev = GENESIS;
	for (const r of records) {
		if (r.prev !== prev) return { valid: false, brokenAt: r.seq };
		const expect = await sha256Hex(recordContent(r));
		if (expect !== r.hash) return { valid: false, brokenAt: r.seq };
		prev = r.hash;
	}
	return { valid: true, brokenAt: null };
}
