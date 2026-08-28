// 支付宝 RSA2 签名/验签 + 付费墙访问令牌 HMAC 工具。
// 全部基于 WebCrypto（crypto.subtle），无第三方依赖。
// 密钥支持 PEM 格式（含头尾/换行）或纯 base64，导入前会统一清洗。

// ---- 环境绑定类型（避免依赖 @cloudflare/workers-types） ----
export interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(options?: {
		prefix?: string;
		cursor?: string;
		limit?: number;
	}): Promise<{
		keys: { name: string }[];
		cursor?: string;
		list_complete: boolean;
	}>;
}

export interface Env {
	ORDERS: KVNamespace;
	CONTENT: KVNamespace;
	LEDGER: KVNamespace;
	COMMENTS: KVNamespace; // 评论：c:<slug>:<ts>:<rand> 记录 + rl:<ip> 限流计数
	ALIPAY_APP_ID: string;
	// 应用私钥：非 Java 项目使用支付宝给的 appPrivatePkcsKey 原值（PKCS#1，无 PEM 头尾），
	// 也兼容 PKCS#8（"BEGIN PRIVATE KEY" 或无头 base64）；导入时自动识别并适配
	ALIPAY_PRIVATE_KEY: string;
	ALIPAY_PUBLIC_KEY: string; // 支付宝公钥，SPKI PEM 或纯 base64
	PAYWALL_TOKEN_SECRET: string;
	ALIPAY_GATEWAY?: string; // 默认 https://openapi.alipay.com/gateway.do
	ALIPAY_SELLER_ID?: string; // 可选：配置后异步通知必须匹配 seller_id
	ADMIN_TOKEN?: string; // admin 管理接口（退款/关单）的 Bearer 令牌
	TURNSTILE_SECRET?: string; // 评论游客通道的 Turnstile 密钥；未配置时游客评论 fail-closed
	TURNSTILE_HOSTNAMES?: string; // 可选：逗号分隔的前端域名白名单，配置后 siteverify 返回的 hostname 必须命中
}

export const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export interface OrderRecord {
	slug: string;
	amount: string; // 如 "3.00"
	status: 'pending' | 'paid';
	tradeNo?: string;
	createdAt: number;
}

// ---- base64 / base64url ----
function bytesToBase64(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function b64urlEncodeText(text: string): string {
	return bytesToBase64(new TextEncoder().encode(text))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function b64urlEncodeBytes(buf: ArrayBuffer): string {
	return bytesToBase64(new Uint8Array(buf))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function b64urlDecodeText(s: string): string {
	let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	while (b64.length % 4) b64 += '=';
	return new TextDecoder().decode(base64ToBytes(b64));
}

// ---- 密钥导入（PEM 头尾与换行清洗） ----
function pemToDer(pem: string): Uint8Array {
	const b64 = pem
		.replace(/-----BEGIN [^-]+-----/g, '')
		.replace(/-----END [^-]+-----/g, '')
		.replace(/\\n/g, '')
		.replace(/\s+/g, '');
	return base64ToBytes(b64);
}

// DER 长度字节编码：>127 用长格式
function derLength(len: number): number[] {
	if (len < 0x80) return [len];
	const bytes: number[] = [];
	let n = len;
	while (n > 0) {
		bytes.unshift(n & 0xff);
		n >>= 8;
	}
	return [0x80 | bytes.length, ...bytes];
}

function derConcat(...parts: (number[] | Uint8Array)[]): Uint8Array {
	const total = parts.reduce((s, p) => s + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

// PKCS#1（"BEGIN RSA PRIVATE KEY" / appPrivatePkcsKey）DER 包装为 PKCS#8：
// SEQUENCE { INTEGER 0, SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }, OCTET STRING(pkcs1Der) }
// WebCrypto 只接受 pkcs8，非 Java 项目拿到的 appPrivatePkcsKey 是 PKCS#1，需要这层适配。
function wrapPkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
	const algId = [
		0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05,
		0x00,
	];
	const version = [0x02, 0x01, 0x00];
	const octetString = derConcat([0x04, ...derLength(pkcs1Der.length)], pkcs1Der);
	const seqContent = derConcat(version, algId, octetString);
	return derConcat([0x30, ...derLength(seqContent.length)], seqContent);
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
	const der = pemToDer(pem);
	const algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
	// PEM 头可直接判断格式
	const isPkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
	if (!isPkcs1) {
		try {
			return await crypto.subtle.importKey('pkcs8', der as BufferSource, algo, false, ['sign']);
		} catch {
			// 无头纯 base64 无法从外观区分，pkcs8 导入失败则按 PKCS#1 处理
		}
	}
	return crypto.subtle.importKey(
		'pkcs8',
		wrapPkcs1ToPkcs8(der) as BufferSource,
		algo,
		false,
		['sign'],
	);
}

export function importPublicKey(pem: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'spki',
		pemToDer(pem) as BufferSource,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['verify'],
	);
}

// ---- RSA2（RSASSA-PKCS1-v1_5 + SHA-256）签名与验签 ----
export async function rsaSign(content: string, privateKey: CryptoKey): Promise<string> {
	const sig = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		privateKey,
		new TextEncoder().encode(content),
	);
	return bytesToBase64(new Uint8Array(sig));
}

export function rsaVerify(
	content: string,
	signatureB64: string,
	publicKey: CryptoKey,
): Promise<boolean> {
	return crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		publicKey,
		base64ToBytes(signatureB64) as BufferSource,
		new TextEncoder().encode(content),
	);
}

// 拼接待签名字符串：非空参数按 key ASCII 升序拼 k=v&k=v。
// 请求签名时排除 sign；异步通知验签时排除 sign 和 sign_type。
export function signContent(
	params: Record<string, string>,
	excludeSignType = false,
): string {
	return Object.keys(params)
		.filter((k) => k !== 'sign' && params[k] !== '' && params[k] != null)
		.filter((k) => !excludeSignType || k !== 'sign_type')
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join('&');
}

// 构造带签名的支付宝网关请求 URL（GET 方式）
export async function buildSignedRequestUrl(
	gateway: string,
	params: Record<string, string>,
	privateKey: CryptoKey,
): Promise<string> {
	const sign = await rsaSign(signContent(params), privateKey);
	const qs = Object.keys(params)
		.sort()
		.map((k) => `${k}=${encodeURIComponent(params[k])}`)
		.join('&');
	return `${gateway}?${qs}&sign=${encodeURIComponent(sign)}`;
}

// 支付宝要求 GMT+8 时间戳：yyyy-MM-dd HH:mm:ss
export function alipayTimestamp(d = new Date()): string {
	const t = new Date(d.getTime() + 8 * 3600 * 1000);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

// ---- 访问令牌：base64url(payload).base64url(HMAC-SHA256(payload, secret)) ----
async function hmacSha256(message: string, secret: string): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

export interface TokenPayload {
	slug: string; // 文章 slug，或 "subscription"（解锁全部）
	exp: number;
}

export async function mintToken(
	slug: string,
	secret: string,
	daysValid = 30,
): Promise<string> {
	const payload = b64urlEncodeText(
		JSON.stringify({ slug, exp: Date.now() + daysValid * 24 * 3600 * 1000 }),
	);
	const sig = b64urlEncodeBytes(await hmacSha256(payload, secret));
	return `${payload}.${sig}`;
}

export async function verifyToken(
	token: string,
	secret: string,
): Promise<TokenPayload | null> {
	const dot = token.lastIndexOf('.');
	if (dot <= 0) return null;
	const payload = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = b64urlEncodeBytes(await hmacSha256(payload, secret));
	// 等长比较，避免时序泄露
	if (sig.length !== expected.length) return null;
	let diff = 0;
	for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
	if (diff !== 0) return null;
	try {
		const data = JSON.parse(b64urlDecodeText(payload));
		if (typeof data.slug !== 'string' || typeof data.exp !== 'number') return null;
		if (Date.now() > data.exp) return null;
		return data as TokenPayload;
	} catch {
		return null;
	}
}

// ---- 通用 JSON 响应 ----
export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}

// ---- exec 类服务端接口调用（交易查询/退款/退款查询/关单，JSON 响应） ----
export async function execAlipay<T = Record<string, unknown>>(
	env: Env,
	method: string,
	bizContent: Record<string, unknown>,
): Promise<T> {
	const privateKey = await importPrivateKey(env.ALIPAY_PRIVATE_KEY);
	const url = await buildSignedRequestUrl(
		env.ALIPAY_GATEWAY || DEFAULT_GATEWAY,
		{
			app_id: env.ALIPAY_APP_ID,
			method,
			charset: 'utf-8',
			sign_type: 'RSA2',
			timestamp: alipayTimestamp(),
			version: '1.0',
			biz_content: JSON.stringify(bizContent),
		},
		privateKey,
	);
	const resp = await fetch(url);
	const text = await resp.text();
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(text) as Record<string, unknown>;
	} catch {
		// 网关异常时可能返回 HTML 错误页而非 JSON
		throw new Error(`支付宝网关返回非 JSON 响应（HTTP ${resp.status}）：${text.slice(0, 200)}`);
	}
	// alipay.trade.query -> alipay_trade_query_response
	const responseKey = method.replace(/\./g, '_') + '_response';
	return (data[responseKey] ?? data) as T;
}

// ---- admin 管理接口鉴权：Authorization: Bearer ${ADMIN_TOKEN} ----
export function checkAdminAuth(request: Request, env: Env): boolean {
	if (!env.ADMIN_TOKEN) return false;
	const header = request.headers.get('Authorization') || '';
	if (!header.startsWith('Bearer ')) return false;
	const token = header.slice(7);
	// 等长比较
	if (token.length !== env.ADMIN_TOKEN.length) return false;
	let diff = 0;
	for (let i = 0; i < token.length; i++) {
		diff |= token.charCodeAt(i) ^ env.ADMIN_TOKEN.charCodeAt(i);
	}
	return diff === 0;
}

// ---- HTML 属性值转义（构造支付表单用） ----
export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
