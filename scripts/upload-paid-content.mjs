// 把 dist-paid-content/ 下的付费正文上传到 Cloudflare KV（CONTENT binding）。
// 用法：npm run upload:content（npm run deploy 会自动先执行本脚本）。
// 前提：wrangler.jsonc 里 CONTENT binding 的 namespace id 已填好，且已 wrangler login。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'dist-paid-content';
// Node ≥18.20/20.12/21+ 在 Windows 上禁止直接 spawn .cmd（EINVAL），需 shell:true
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

if (!existsSync(DIR)) {
	console.error('[upload-paid-content] 未找到 dist-paid-content/，请先运行 npm run build。');
	process.exit(1);
}

function upload(key, file) {
	console.log(`[upload-paid-content] 上传 ${key}`);
	execFileSync(
		npx,
		['wrangler', 'kv', 'key', 'put', '--remote', '--binding=CONTENT', key, '--path', file],
		{ stdio: 'inherit', shell: isWin },
	);
}

const htmlFiles = readdirSync(DIR).filter((f) => f.endsWith('.html'));
for (const f of htmlFiles) {
	upload(`article:${f.replace(/\.html$/, '')}`, join(DIR, f));
}
upload('catalog', join(DIR, 'catalog.json'));

console.log('[upload-paid-content] 完成。现在可以运行 npm run deploy 部署站点。');
