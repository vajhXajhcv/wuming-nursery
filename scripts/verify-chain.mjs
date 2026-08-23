// 独立整链校验脚本（供任何镜像方使用）：不依赖本仓库任何代码，自包含实现
// sha256hex / stableStringify / 记录内容拼接，与 src/lib/dao-core.ts 的规则等价。
// 独立实现是有意为之：独立实现 = 独立验证。
//
// 用法：
//   node scripts/verify-chain.mjs [--site https://wumingmp.me]
//   node scripts/verify-chain.mjs --file chain.json   # 与"下载全链"功能配合，离线校验
//
// 校验内容：seq 从 1 连续递增；prev 链接（首条 prev === 'GENESIS'）；
// 逐条重算哈希；链头 head 与末条记录一致。全部通过打印 ✅，否则打印 ❌ 并 exit 1。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const GENESIS = 'GENESIS';

// AbortSignal.timeout(ms) 在 Windows 上会使进程退出时触发 libuv 断言（exit 127），
// 改用手动 AbortController + unref 定时器
function timeoutSignal(ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	timer.unref?.();
	return controller.signal;
}

// ---- 规范化 JSON 序列化（键序稳定，undefined 丢弃，数组保持顺序，无空白） ----
function stableStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
	const keys = Object.keys(value)
		.filter((k) => value[k] !== undefined)
		.sort();
	return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function sha256Hex(text) {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

// 记录哈希内容：9 个基础字段拼接；有 data 时追加规范化 JSON
function recordContent(r) {
	const base = [r.prev, r.seq, r.ts, r.type, r.amount, r.category, r.note, r.source, r.ref || ''].join(
		'|',
	);
	return r.data ? base + '|' + stableStringify(r.data) : base;
}

// ---- 参数 ----
function parseArgs(argv) {
	const args = { site: 'https://wumingmp.me', file: null };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--site') args.site = argv[++i];
		else if (a === '--file') args.file = argv[++i];
		else if (a.startsWith('--site=')) args.site = a.slice('--site='.length);
		else if (a.startsWith('--file=')) args.file = a.slice('--file='.length);
		else {
			console.error(`[verify-chain] 未知参数: ${a}`);
			console.error('用法: node scripts/verify-chain.mjs [--site https://wumingmp.me] [--file chain.json]');
			process.exit(1);
		}
	}
	if (!args.site) args.site = 'https://wumingmp.me';
	args.site = args.site.replace(/\/+$/, '');
	return args;
}

const args = parseArgs(process.argv);

// 注意：fetch 之后不能调用 process.exit()（Windows 上 undici 句柄未关闭时会触发
// libuv 断言导致 exit 127），一律用 process.exitCode + 自然结束。
function die(msg) {
	console.error(`[verify-chain] ${msg}`);
	process.exitCode = 1;
}

// ---- 取数 ----
let data = null;
if (args.file) {
	console.log(`[verify-chain] 数据源: 本地文件 ${args.file}`);
	try {
		data = JSON.parse(readFileSync(args.file, 'utf8'));
	} catch (e) {
		die(`读取/解析文件失败: ${e.message}`);
	}
} else {
	const url = `${args.site}/api/ledger/list`;
	console.log(`[verify-chain] 数据源: ${url}`);
	try {
		const res = await fetch(url, { signal: timeoutSignal(30_000) });
		if (!res.ok) die(`拉取失败: HTTP ${res.status}`);
		else data = await res.json();
	} catch (e) {
		die(`拉取失败: ${e.message}`);
	}
}

const records = data?.records;
const head = data?.head;
if (data && (!Array.isArray(records) || !head || typeof head.seq !== 'number' || typeof head.hash !== 'string')) {
	die('数据格式不符：需要 {records: [], head: {seq, hash}}');
	data = null;
}

if (data) {
	// ---- 校验 ----
	const sorted = [...records].sort((a, b) => a.seq - b.seq);
	const failures = [];
	let prev = GENESIS;
	sorted.forEach((r, i) => {
		const expectedSeq = i + 1;
		if (r.seq !== expectedSeq) {
			failures.push({ seq: r.seq, reason: `seq 不连续（期望 ${expectedSeq}，实际 ${r.seq}）` });
		}
		if (r.prev !== prev) {
			failures.push({ seq: r.seq, reason: `prev 不衔接（期望 ${prev}，实际 ${r.prev}）` });
		}
		const recomputed = sha256Hex(recordContent(r));
		if (recomputed !== r.hash) {
			failures.push({ seq: r.seq, reason: `哈希重算不符（记录值 ${r.hash}，重算值 ${recomputed}）` });
		}
		prev = r.hash;
	});

	const last = sorted[sorted.length - 1];
	const expectedHead = last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
	if (head.seq !== expectedHead.seq || head.hash !== expectedHead.hash) {
		failures.push({
			seq: 'head',
			reason: `链头与末条记录不一致（head seq=${head.seq} hash=${head.hash}，期望 seq=${expectedHead.seq} hash=${expectedHead.hash}）`,
		});
	}

	// ---- 输出 ----
	const byType = {};
	for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1;
	const typeSummary = Object.entries(byType)
		.sort((a, b) => b[1] - a[1])
		.map(([t, n]) => `${t}=${n}`)
		.join(' ');

	console.log(`[verify-chain] 记录数: ${records.length}`);
	console.log(`[verify-chain] 类型分布: ${typeSummary || '(无)'}`);
	console.log(`[verify-chain] 链头: seq=${head.seq} hash=${head.hash}`);

	if (failures.length) {
		console.error(`\n❌ 校验失败，共 ${failures.length} 处问题：`);
		for (const f of failures) console.error(`  - seq=${f.seq}: ${f.reason}`);
		process.exitCode = 1;
	} else {
		console.log(`\n✅ 整链校验通过（${records.length} 条记录，seq 连续、prev 衔接、逐条哈希一致、链头吻合）`);
	}
}
