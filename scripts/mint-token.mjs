// 本地手动签发访问令牌（人工赠送 / 老读者用）：
//   node scripts/mint-token.mjs <slug|subscription> [天数=30]
// 需要先设置环境变量 PAYWALL_TOKEN_SECRET，且必须与线上（wrangler pages secret）一致。
// 例：
//   PAYWALL_TOKEN_SECRET=xxx node scripts/mint-token.mjs sisters-to-rogues-prohibition 30
//   PAYWALL_TOKEN_SECRET=xxx node scripts/mint-token.mjs subscription 365
import { createHmac } from 'node:crypto';

const [, , slug, daysArg] = process.argv;
if (!slug) {
	console.error('用法: node scripts/mint-token.mjs <slug|subscription> [天数=30]');
	process.exit(1);
}
const secret = process.env.PAYWALL_TOKEN_SECRET;
if (!secret) {
	console.error('请先设置环境变量 PAYWALL_TOKEN_SECRET（与线上一致）。');
	process.exit(1);
}
const days = Number(daysArg || 30);
if (!Number.isFinite(days) || days <= 0) {
	console.error('天数必须是正数。');
	process.exit(1);
}

const payload = Buffer.from(
	JSON.stringify({ slug, exp: Date.now() + days * 24 * 3600 * 1000 }),
).toString('base64url');
const sig = createHmac('sha256', secret).update(payload).digest('base64url');

console.log(`${payload}.${sig}`);
console.error(`\n已签发 ${slug} 令牌，有效期 ${days} 天。把上面那串令牌发给读者即可。`);
