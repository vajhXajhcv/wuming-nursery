// GET /api/ledger/list —— 公开接口：返回全部账本记录与链头，任何人可独立验链
import { json, type Env } from '../_lib/alipay';
import { listLedger, verifyLedger } from '../_lib/ledger';

export async function onRequestGet(context: { env: Env }): Promise<Response> {
	const { records, head } = await listLedger(context.env);
	const check = await verifyLedger(records);
	return json({
		records,
		head,
		chain: {
			valid: check.valid && (records.length === 0 || head.hash === records[records.length - 1].hash),
			brokenAt: check.brokenAt,
			count: records.length,
		},
	});
}
