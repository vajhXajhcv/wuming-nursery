// 通过 WebBridge daemon 截图并保存到文件（替代 jq 版 screenshot.sh）
// 用法: node scripts/_wb-shot.mjs <url> <输出文件> [等待毫秒]
import { copyFileSync } from 'node:fs';

const [url, out, waitMs = '3000'] = process.argv.slice(2);

async function cmd(action, args) {
	const r = await fetch('http://127.0.0.1:10086/command', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, args, session: 'audit-shot' }),
	});
	return r.json();
}

await cmd('navigate', { url, newTab: !globalThis._opened });
globalThis._opened = true;
await new Promise((r) => setTimeout(r, parseInt(waitMs)));
const res = await cmd('screenshot', { format: 'jpeg', quality: 80 });
if (!res.ok || !res.data.path) {
	console.error('截图失败:', JSON.stringify(res).slice(0, 300));
	process.exit(1);
}
copyFileSync(res.data.path, out);
console.log(out, res.data.sizeBytes);
