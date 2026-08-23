// 把账本链头锚定到比特币（OpenTimestamps 公共日历），证明"链头在某时刻已存在"。
//
// 用法：
//   node scripts/anchor-ots.mjs [--site https://wumingmp.me]
// 环境变量 ADMIN_TOKEN 可选：设置后会把锚定结果写回链上（POST /api/dao/anchor，写 anchor 事件）。
//
// 每次运行做三件事：
//   1. 锚定：把当前链头 hash 提交到 alice / finney 两个公共日历，证明字节存到
//      public/dao/anchors/<seq>-<hash前8位>.<日历名>.ots，并维护 index.json。
//   2. 升级：对 index.json 里尚未升级（upgraded=false）的条目，向日历拉取含比特币
//      区块 attestation 的完整证明并覆盖本地文件（日历承诺 → 比特币确认通常需数小时）。
//   3. 写链（可选）：设置 ADMIN_TOKEN 时，把本次锚定的 {anchoredSeq, anchoredHash, otsFile}
//      写回链上（anchor 事件），任何人可在公开链上看到"哪个链头锚定到了哪个证明"。
//
// 网络失败对单日历容错：至少一个日历成功才算锚定成功，否则 exit 1。
// 注意：.ots 证明写入 public/dao/anchors/ 后需 npm run deploy 才会发布到站点。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CALENDARS = {
	alice: 'https://alice.btc.calendar.opentimestamps.org',
	finney: 'https://finney.btc.calendar.opentimestamps.org',
};
const ANCHOR_DIR = fileURLToPath(new URL('../public/dao/anchors/', import.meta.url));
const INDEX_FILE = join(ANCHOR_DIR, 'index.json');
const TIMEOUT = 30_000;

const log = (msg) => console.log(`[anchor-ots] ${msg}`);
const warn = (msg) => console.error(`[anchor-ots] ${msg}`);

// AbortSignal.timeout(ms) 在 Windows 上会使进程退出时触发 libuv 断言（exit 127），
// 改用手动 AbortController + unref 定时器
function timeoutSignal(ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	timer.unref?.();
	return controller.signal;
}

// ---- 参数 ----
function parseArgs(argv) {
	const args = { site: 'https://wumingmp.me' };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--site') args.site = argv[++i];
		else if (a.startsWith('--site=')) args.site = a.slice('--site='.length);
		else {
			warn(`未知参数: ${a}`);
			warn('用法: node scripts/anchor-ots.mjs [--site https://wumingmp.me]');
			process.exit(1);
		}
	}
	args.site = (args.site || 'https://wumingmp.me').replace(/\/+$/, '');
	return args;
}

// ---- index.json 读写 ----
function loadIndex() {
	if (!existsSync(INDEX_FILE)) return [];
	try {
		const arr = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
		return Array.isArray(arr) ? arr : [];
	} catch {
		warn('index.json 解析失败，按空索引重新开始（已有 .ots 文件不受影响）');
		return [];
	}
}

function saveIndex(index) {
	mkdirSync(ANCHOR_DIR, { recursive: true });
	index.sort((a, b) => a.seq - b.seq);
	writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
}

const fileName = (seq, hash, cal) => `${String(seq).padStart(4, '0')}-${hash.slice(0, 8)}.${cal}.ots`;

// ---- 第 1 步：锚定当前链头 ----
async function anchorPhase(site, index) {
	log(`从 ${site}/api/ledger/list 拉取链头…`);
	const res = await fetch(`${site}/api/ledger/list`, { signal: timeoutSignal(TIMEOUT) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = await res.json();
	const head = data?.head;
	if (!head || typeof head.seq !== 'number' || typeof head.hash !== 'string') {
		throw new Error('返回数据缺少 head {seq, hash}');
	}
	if (head.seq === 0) {
		log('链为空（seq 0），没有可锚定的链头，退出。');
		return null;
	}
	if (!/^[0-9a-f]{64}$/.test(head.hash)) {
		throw new Error(`链头 hash 不是 64 位十六进制: ${head.hash}`);
	}
	log(`当前链头: seq=${head.seq} hash=${head.hash}`);

	let entry = index.find((e) => e.seq === head.seq);
	const sameHash = entry && entry.hash === head.hash;
	if (!entry) {
		entry = {
			seq: head.seq,
			hash: head.hash,
			ts: Date.now(),
			files: {},
			upgraded: { alice: false, finney: false },
			chained: false,
		};
		index.push(entry);
	} else if (!sameHash) {
		// 同 seq 不同 hash：链发生过重组/分叉，以站点当前链头为准重新锚定
		warn(`⚠️  seq ${head.seq} 的链头 hash 与本地索引不同（本地 ${entry.hash}），按分叉处理：重新锚定。`);
		entry.hash = head.hash;
		entry.ts = Date.now();
		entry.files = {};
		entry.upgraded = { alice: false, finney: false };
		entry.chained = false;
	}

	const digest = Buffer.from(head.hash, 'hex'); // 32 字节
	let okCount = 0;
	for (const [name, base] of Object.entries(CALENDARS)) {
		const fname = fileName(head.seq, head.hash, name);
		const fpath = join(ANCHOR_DIR, fname);
		if (sameHash && entry.files[name] && existsSync(fpath)) {
			log(`日历 ${name}: 本地已有该链头的证明 ${fname}，跳过提交。`);
			okCount++;
			continue;
		}
		try {
			log(`日历 ${name}: POST ${base}/digest …`);
			const r = await fetch(`${base}/digest`, {
				method: 'POST',
				headers: { 'content-type': 'application/octet-stream' },
				body: digest,
				signal: timeoutSignal(TIMEOUT),
			});
			if (!r.ok) {
				warn(`日历 ${name}: 提交失败 HTTP ${r.status}（容错跳过）`);
				continue;
			}
			const proof = Buffer.from(await r.arrayBuffer());
			mkdirSync(ANCHOR_DIR, { recursive: true });
			writeFileSync(fpath, proof);
			entry.files[name] = fname;
			entry.upgraded[name] = false;
			okCount++;
			log(`日历 ${name}: 已保存日历承诺 ${fname}（${proof.length} 字节，尚待比特币确认）`);
		} catch (e) {
			warn(`日历 ${name}: 网络错误 ${e.message}（容错跳过）`);
		}
	}
	return { entry, okCount };
}

// ---- 第 2 步：升级待定证明（日历承诺 → 比特币区块 attestation） ----
async function upgradePhase(index) {
	const pending = index.filter((e) =>
		Object.entries(CALENDARS).some(([name]) => e.files?.[name] && !e.upgraded?.[name]),
	);
	if (!pending.length) {
		log('升级检查: 没有待定证明。');
		return;
	}
	log(`升级检查: ${pending.length} 个条目有待定证明…`);
	for (const entry of pending) {
		for (const [name, base] of Object.entries(CALENDARS)) {
			if (!entry.files?.[name] || entry.upgraded?.[name]) continue;
			const fpath = join(ANCHOR_DIR, entry.files[name]);
			try {
				// commitment = 该条目锚定的链头 hash（提交给日历的 digest 的 hex）
				const r = await fetch(`${base}/timestamp/${entry.hash}`, {
					signal: timeoutSignal(TIMEOUT),
				});
				if (r.status === 404) {
					log(`seq ${entry.seq} @ ${name}: 日历尚无记录（保持待定）`);
					continue;
				}
				if (!r.ok) {
					warn(`seq ${entry.seq} @ ${name}: 查询失败 HTTP ${r.status}（保持待定）`);
					continue;
				}
				const proof = Buffer.from(await r.arrayBuffer());
				const local = existsSync(fpath) ? readFileSync(fpath) : null;
				if (local && local.equals(proof)) {
					log(`seq ${entry.seq} @ ${name}: 尚未获得比特币确认（保持待定）`);
					continue;
				}
				mkdirSync(ANCHOR_DIR, { recursive: true });
				writeFileSync(fpath, proof);
				entry.upgraded[name] = true;
				log(`seq ${entry.seq} @ ${name}: ✅ 已升级为含比特币区块 attestation 的证明（${proof.length} 字节）`);
			} catch (e) {
				warn(`seq ${entry.seq} @ ${name}: 网络错误 ${e.message}（保持待定）`);
			}
		}
	}
}

// ---- 第 3 步：把锚定结果写回链上（可选，需 ADMIN_TOKEN） ----
async function chainPhase(site, entry) {
	if (!entry) return;
	if (entry.chained) {
		log(`写链: seq ${entry.seq} 的锚定已在链上（chained=true），跳过。`);
		return;
	}
	const token = process.env.ADMIN_TOKEN;
	if (!token) {
		log('写链: 未设置 ADMIN_TOKEN，跳过（设置后会写 anchor 事件并标记 chained=true）。');
		return;
	}
	const otsFile = entry.files?.alice;
	if (!otsFile) {
		warn('写链: 缺少 alice 证明文件，跳过（chained 保持 false，下次运行重试）。');
		return;
	}
	try {
		const r = await fetch(`${site}/api/dao/anchor`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({ anchoredSeq: entry.seq, anchoredHash: entry.hash, otsFile }),
			signal: timeoutSignal(TIMEOUT),
		});
		if (!r.ok) {
			warn(`写链: POST /api/dao/anchor 失败 HTTP ${r.status}: ${await r.text()}（chained 保持 false）`);
			return;
		}
		entry.chained = true;
		log(`写链: ✅ 已把锚定写回链上（anchoredSeq=${entry.seq}, otsFile=${otsFile}）`);
	} catch (e) {
		warn(`写链: 网络错误 ${e.message}（chained 保持 false）`);
	}
}

// ---- 主流程 ----
// 注意：fetch 之后不能调用 process.exit()（Windows 上 undici 句柄未关闭时会触发
// libuv 断言导致 exit 127），一律用 process.exitCode + 自然结束。
const args = parseArgs(process.argv);
const index = loadIndex();

let anchored = null;
try {
	anchored = await anchorPhase(args.site, index);
} catch (e) {
	warn(`拉取链头失败: ${e.message}`);
	process.exitCode = 1;
}
saveIndex(index);

// 升级只依赖日历与本地文件，即使拉取链头失败也照常执行
await upgradePhase(index);
saveIndex(index);

if (anchored) {
	await chainPhase(args.site, anchored.entry);
	saveIndex(index);

	if (anchored.okCount > 0) {
		log(
			`完成: 链头 seq=${anchored.entry.seq} 已锚定到 ${anchored.okCount}/${Object.keys(CALENDARS).length} 个日历。` +
				'比特币确认通常需数小时，之后重跑本脚本即可升级证明；部署站点后证明在 /dao/anchors/ 下公开可下载。',
		);
	} else {
		warn('❌ 两个日历都未能成功锚定，请检查网络后重试。');
		process.exitCode = 1;
	}
}
