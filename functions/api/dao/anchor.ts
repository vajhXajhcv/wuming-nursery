// POST /api/dao/anchor —— 记录链头外部锚定（OpenTimestamps，ADMIN_TOKEN 保护）
// body: {anchoredSeq, anchoredHash, otsFile}
// otsFile 为 public/dao/anchors/ 下的证明文件名；anchoredSeq/anchoredHash 必须与链上记录一致。
import { checkAdminAuth, json, type Env } from '../_lib/alipay';
import { appendLedger, listLedger } from '../_lib/ledger';
import type { AnchorData } from '../../../src/lib/dao-core';

export async function onRequestPost(context: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const { request, env } = context;
	if (!checkAdminAuth(request, env)) return json({ error: '未授权' }, 401);

	let body: { anchoredSeq?: unknown; anchoredHash?: unknown; otsFile?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '请求体必须是 JSON' }, 400);
	}

	const anchoredSeq = typeof body.anchoredSeq === 'number' ? body.anchoredSeq : NaN;
	if (!Number.isInteger(anchoredSeq) || anchoredSeq < 1) {
		return json({ error: 'anchoredSeq 必须是正整数' }, 400);
	}
	const anchoredHash = typeof body.anchoredHash === 'string' ? body.anchoredHash : '';
	if (!anchoredHash) return json({ error: '缺少 anchoredHash' }, 400);
	const otsFile = typeof body.otsFile === 'string' ? body.otsFile : '';
	if (
		otsFile.length < 1 ||
		otsFile.length > 100 ||
		/[\/\\]/.test(otsFile) ||
		otsFile.includes('..')
	) {
		return json({ error: 'otsFile 须为 1-100 个字符的文件名（不能包含 /、\\、..）' }, 400);
	}

	const { records } = await listLedger(env);
	const target = records.find((r) => r.seq === anchoredSeq);
	if (!target || target.hash !== anchoredHash) {
		return json({ error: 'anchoredSeq 与 anchoredHash 不匹配链上记录' }, 400);
	}

	const data: AnchorData = { anchoredSeq, anchoredHash, otsFile };
	await appendLedger(env, {
		type: 'anchor',
		category: '锚定',
		note: `链头锚定至比特币（OTS）：#${anchoredSeq} ${anchoredHash.slice(0, 16)}…`,
		source: 'dao',
		data: { ...data },
	});
	return json({ ok: true });
}
