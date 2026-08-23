// 哈希链账本核心：追加式记录，每条包含前序哈希，篡改任何历史记录都会导致链校验失败。
// 链头存 KV key "ledger:head"，记录存 "ledger:rec:<seq>"。
// 注意：KV 无事务，极端并发下可能分叉；MVP 接受此限制，后续可迁 Durable Object。
//
// 记录格式与哈希规则单源定义在 src/lib/dao-core.ts（与浏览器端独立验链共用），
// 本文件只保留 KV 读写。DAO 事件（成员/贡献/提案/投票等）与财务收支共用同一条链：
// DAO 事件 amount 为空字符串、source 为 'dao'、负载在可选 data 字段中（参与哈希）。

import {
	GENESIS,
	HEAD_KEY,
	REC_PREFIX,
	hashRecord,
	verifyChain,
	recordContent,
	type ChainRecord,
	type ChainHead,
	type RecordType,
	type RecordSource,
} from '../../../src/lib/dao-core';

// 兼容旧导出（ledger/list.ts 等既有调用方不变）
export { GENESIS, HEAD_KEY, REC_PREFIX, recordContent };
export type { ChainHead as LedgerHead };
export type LedgerRecord = ChainRecord;

import type { KVNamespace } from './alipay';

export interface LedgerInput {
	type: RecordType;
	amount?: string; // 财务记录为元（两位小数字符串）；DAO 事件省略或 ''
	category: string; // 财务分类；DAO 事件为事件简述
	note: string; // 摘要
	source: RecordSource; // manual=手动录入，alipay/afdian=自动渠道，dao=治理事件
	ref?: string; // 关联单号 / 交叉引用（可选）
	data?: Record<string, unknown>; // DAO 事件负载（参与哈希；财务记录勿传）
	ts?: number; // 默认 Date.now()；提案等需"deadline = ts + 投票期"精确关系时显式传入
}

interface LedgerEnv {
	LEDGER: KVNamespace;
}

export async function appendLedger(
	env: LedgerEnv,
	input: LedgerInput,
): Promise<LedgerRecord> {
	const headRaw = await env.LEDGER.get(HEAD_KEY);
	const head: ChainHead = headRaw ? JSON.parse(headRaw) : { seq: 0, hash: GENESIS };

	const record: Omit<LedgerRecord, 'hash'> = {
		seq: head.seq + 1,
		ts: input.ts ?? Date.now(),
		prev: head.hash,
		type: input.type,
		// 财务事件由调用方保证是正数金额；DAO 事件为空字符串
		amount: input.amount === undefined || input.amount === '' ? '' : Number(input.amount).toFixed(2),
		category: input.category,
		note: input.note,
		source: input.source,
		ref: input.ref || '',
		...(input.data ? { data: input.data } : {}),
	};
	const hash = await hashRecord(record);
	const full: LedgerRecord = { ...record, hash };

	// seq 前补零，保证 KV list 按字典序即按时间序
	const key = `${REC_PREFIX}${String(full.seq).padStart(12, '0')}`;
	await env.LEDGER.put(key, JSON.stringify(full));
	await env.LEDGER.put(HEAD_KEY, JSON.stringify({ seq: full.seq, hash }));
	return full;
}

export async function listLedger(env: LedgerEnv): Promise<{
	records: LedgerRecord[];
	head: ChainHead;
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
	const head: ChainHead = headRaw ? JSON.parse(headRaw) : { seq: 0, hash: GENESIS };
	return { records, head };
}

// 服务端整链校验（公开页前端也会用共享核心独立校验一遍）
export async function verifyLedger(records: LedgerRecord[]): Promise<{
	valid: boolean;
	brokenAt: number | null;
}> {
	return verifyChain(records);
}
