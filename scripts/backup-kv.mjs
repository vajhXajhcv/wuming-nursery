// KV 数据备份：把 ORDERS / LEDGER / COMMENTS 三个命名空间全量导出为本地 JSON。
//
// 用法：
//   npm run backup            # 导出到 backup/kv-<yyyy-mm-dd>.json（目录已 gitignore，不会进仓库）
//
// 为什么需要它：订单、账本、评论的唯一存储是 Cloudflare KV，KV 没有快照/回滚概念。
// 账本（LEDGER）虽公开可读且有 OTS 锚定，但锚定只证明"存在过"，丢了还是丢了。
// CONTENT 命名空间不备份——它由仓库内容构建，npm run upload:content 可随时重建。
//
// 实现：通过本机已登录的 wrangler CLI 逐个 key 拉取（kv key list + kv key get）。
// 当前数据量很小（几十条），逐 key 拉取足够快；将来数据量大时可改用 Cloudflare REST API 或 R2 快照。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BACKUP_DIR = join(ROOT, 'backup');
const NAMESPACES = ['ORDERS', 'LEDGER', 'COMMENTS'];

const log = (msg) => console.log(`[backup-kv] ${msg}`);
const warn = (msg) => console.error(`[backup-kv] ${msg}`);

// wrangler.jsonc 是 JSONC（含注释与 URL），不做完整解析，直接正则提取 binding/id 对
function loadNamespaceIds() {
	const raw = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8');
	const ids = {};
	const re = /"binding"\s*:\s*"([^"]+)"[\s\S]*?"id"\s*:\s*"([^"]+)"/g;
	let m;
	while ((m = re.exec(raw))) ids[m[1]] = m[2];
	return ids;
}

function wrangler(args) {
	// Windows 上 npx 是 npx.cmd，execFile 不带 shell 会 ENOENT/EINVAL，需 shell:true。
	// key 由本系统生成（order:/ledger:/stats: 等），无 shell 元字符；仍加双引号兜底。
	const quoted = args.map((a) => (/[\s:]/.test(a) ? `"${a}"` : a));
	return execFileSync('npx', ['wrangler', ...quoted], {
		cwd: ROOT,
		encoding: 'utf8',
		shell: true,
		maxBuffer: 64 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

function listKeys(id) {
	const out = wrangler(['kv', 'key', 'list', '--namespace-id', id, '--remote']);
	// wrangler 输出为 JSON 数组 [{name, ...}]；前面可能带非 JSON 的提示行，找到第一个 '[' 再解析
	const start = out.indexOf('[');
	if (start === -1) throw new Error('kv key list 输出不是 JSON');
	return JSON.parse(out.slice(start)).map((k) => k.name);
}

function getKey(id, key) {
	const out = wrangler(['kv', 'key', 'get', key, '--namespace-id', id, '--remote', '--text']);
	return out;
}

function today() {
	// 按本地时区取日期，文件名可读
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ids = loadNamespaceIds();
const backup = { exportedAt: new Date().toISOString(), namespaces: {} };
let failed = 0;

for (const binding of NAMESPACES) {
	const id = ids[binding];
	if (!id) {
		warn(`${binding}: wrangler.jsonc 中未找到 binding，跳过。`);
		failed++;
		continue;
	}
	try {
		const keys = listKeys(id);
		log(`${binding}: ${keys.length} 个 key，开始导出…`);
		const ns = {};
		for (const key of keys) {
			try {
				const raw = getKey(id, key);
				try {
					ns[key] = JSON.parse(raw);
				} catch {
					ns[key] = raw; // 非 JSON 原样存
				}
			} catch (e) {
				warn(`${binding}/${key}: 读取失败 ${e.message?.split('\n')[0] || e}（跳过该 key）`);
				failed++;
			}
		}
		backup.namespaces[binding] = ns;
		log(`${binding}: 已导出 ${Object.keys(ns).length}/${keys.length} 个 key。`);
	} catch (e) {
		warn(`${binding}: 列出 key 失败（${e.message?.split('\n')[0] || e}）。wrangler 是否已登录？跳过该命名空间。`);
		failed++;
	}
}

mkdirSync(BACKUP_DIR, { recursive: true });
const file = join(BACKUP_DIR, `kv-${today()}.json`);
writeFileSync(file, JSON.stringify(backup, null, 2) + '\n');
log(`完成：${file}`);
if (failed) {
	warn(`有 ${failed} 处失败，请检查上方日志。`);
	process.exitCode = 1;
}
