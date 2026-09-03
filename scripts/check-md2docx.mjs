// 构建前自检：在线 Markdown 转 Word 工具（/tools/md2docx）的运行时资源完整性。
// 校验三件事：
//   1. 页面引用的 wheel / 模板文件在 public/ 下真实存在（防止改名后线上 404）
//   2. wheel 是合法 zip 且包含 *.dist-info/METADATA（能被 micropip 安装）
//   3. 模板 JSON 能被解析
// 任一失败以非零码退出，阻断构建。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const PAGE = 'src/pages/tools/md2docx.astro';
const PUBLIC_DIR = 'public';
const WHEELS_DIR = 'public/tools/md2docx/wheels';
const TEMPLATES_DIR = 'public/tools/md2docx/templates';

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(PAGE, 'utf8');

// --- 页面引用的 wheel 列表（WHEELS 常量） ---
const wheelsBlock = src.match(/const WHEELS = \[([\s\S]*?)\]/);
if (!wheelsBlock) {
	fail('无法在页面中找到 WHEELS 常量');
}
const pageWheels = wheelsBlock ? [...wheelsBlock[1].matchAll(/'([^']+\.whl)'/g)].map((m) => m[1]) : [];

// --- 页面引用的 JSON 模板（data-source="json" 的 option value） ---
const pageTemplates = [...src.matchAll(/value="([^"]+)"\s+data-source="json"/g)].map((m) => m[1]);
if (pageTemplates.length === 0) {
	fail('无法在页面中找到 data-source="json" 的模板选项');
}

// --- 1. 页面引用 -> 磁盘文件 ---
for (const w of pageWheels) {
	const rel = join(PUBLIC_DIR, w.replace(/^\//, ''));
	try {
		if (statSync(rel).size === 0) fail(`wheel 文件为空: ${rel}`);
	} catch {
		fail(`页面引用的 wheel 不存在: ${rel}`);
	}
}
for (const t of pageTemplates) {
	const rel = join(TEMPLATES_DIR, `${t}.json`);
	try {
		JSON.parse(readFileSync(rel, 'utf8'));
	} catch (e) {
		fail(`模板缺失或 JSON 无法解析: ${rel} (${e.message})`);
	}
}

// --- 2. 磁盘 -> 页面引用（防止新增资源忘记挂到页面） ---
const diskWheels = readdirSync(WHEELS_DIR).filter((f) => f.endsWith('.whl'));
for (const f of diskWheels) {
	if (!pageWheels.some((w) => basename(w) === f)) {
		fail(`wheel 存在于磁盘但页面未引用: ${f}`);
	}
}
const diskTemplates = readdirSync(TEMPLATES_DIR)
	.filter((f) => f.endsWith('.json'))
	.map((f) => basename(f, '.json'));
for (const t of diskTemplates) {
	if (!pageTemplates.includes(t)) {
		fail(`模板存在于磁盘但页面无对应选项: ${t}.json`);
	}
}

// --- 3. wheel 是合法 zip 且含 dist-info/METADATA ---
for (const f of diskWheels) {
	const rel = join(WHEELS_DIR, f);
	const buf = readFileSync(rel);
	const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4;
	if (!isZip) {
		fail(`wheel 不是合法 zip: ${rel}`);
		continue;
	}
	if (!buf.includes('.dist-info/METADATA')) {
		fail(`wheel 缺少 *.dist-info/METADATA: ${rel}`);
	}
}

if (failures.length > 0) {
	console.error('[check-md2docx] 自检失败：');
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}
console.log(
	`[check-md2docx] OK：${pageWheels.length} 个 wheel、${pageTemplates.length} 个 JSON 模板，页面引用与磁盘文件一致。`,
);
