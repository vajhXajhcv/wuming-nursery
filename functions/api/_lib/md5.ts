// 紧凑 MD5 实现（WebCrypto 不支持 MD5，爱发电 API 签名需要）。
// 基于公开领域参考实现改写，输出 32 位小写 hex。

function rol(x: number, n: number): number {
	return ((x << n) | (x >>> (32 - n))) | 0;
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
	return (rol((a + q + x + t) | 0, s) + b) | 0;
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
	return cmn((b & c) | (~b & d), a, b, x, s, t);
}
function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
	return cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
	return cmn(b ^ c ^ d, a, b, x, s, t);
}
function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
	return cmn(c ^ (b | ~d), a, b, x, s, t);
}

const HEX = '0123456789abcdef';

function toHexLE(n: number): string {
	let s = '';
	for (let i = 0; i < 4; i++) {
		s += HEX[(n >> (i * 8 + 4)) & 0x0f] + HEX[(n >> (i * 8)) & 0x0f];
	}
	return s;
}

export function md5(input: string): string {
	const bytes = new TextEncoder().encode(input);
	const len = bytes.length;
	const bitLen = len * 8;

	//  padded message: 16-word blocks
	const totalWords = (((len + 8) >> 6) + 1) * 16;
	const words = new Array<number>(totalWords).fill(0);
	for (let i = 0; i < len; i++) {
		words[i >> 2] |= bytes[i] << ((i % 4) * 8);
	}
	words[len >> 2] |= 0x80 << ((len % 4) * 8);
	words[totalWords - 2] = bitLen >>> 0;
	words[totalWords - 1] = Math.floor(bitLen / 0x100000000);

	let a = 1732584193;
	let b = -271733879;
	let c = -1732584194;
	let d = 271733878;

	for (let k = 0; k < totalWords; k += 16) {
		const x = words.slice(k, k + 16);
		const oa = a, ob = b, oc = c, od = d;

		a = ff(a, b, c, d, x[0], 7, -680876936);
		d = ff(d, a, b, c, x[1], 12, -389564586);
		c = ff(c, d, a, b, x[2], 17, 606105819);
		b = ff(b, c, d, a, x[3], 22, -1044525330);
		a = ff(a, b, c, d, x[4], 7, -176418897);
		d = ff(d, a, b, c, x[5], 12, 1200080426);
		c = ff(c, d, a, b, x[6], 17, -1473231341);
		b = ff(b, c, d, a, x[7], 22, -45705983);
		a = ff(a, b, c, d, x[8], 7, 1770035416);
		d = ff(d, a, b, c, x[9], 12, -1958414417);
		c = ff(c, d, a, b, x[10], 17, -42063);
		b = ff(b, c, d, a, x[11], 22, -1990404162);
		a = ff(a, b, c, d, x[12], 7, 1804603682);
		d = ff(d, a, b, c, x[13], 12, -40341101);
		c = ff(c, d, a, b, x[14], 17, -1502002290);
		b = ff(b, c, d, a, x[15], 22, 1236535329);

		a = gg(a, b, c, d, x[1], 5, -165796510);
		d = gg(d, a, b, c, x[6], 9, -1069501632);
		c = gg(c, d, a, b, x[11], 14, 643717713);
		b = gg(b, c, d, a, x[0], 20, -373897302);
		a = gg(a, b, c, d, x[5], 5, -701558691);
		d = gg(d, a, b, c, x[10], 9, 38016083);
		c = gg(c, d, a, b, x[15], 14, -660478335);
		b = gg(b, c, d, a, x[4], 20, -405537848);
		a = gg(a, b, c, d, x[9], 5, 568446438);
		d = gg(d, a, b, c, x[14], 9, -1019803690);
		c = gg(c, d, a, b, x[3], 14, -187363961);
		b = gg(b, c, d, a, x[8], 20, 1163531501);
		a = gg(a, b, c, d, x[13], 5, -1444681467);
		d = gg(d, a, b, c, x[2], 9, -51403784);
		c = gg(c, d, a, b, x[7], 14, 1735328473);
		b = gg(b, c, d, a, x[12], 20, -1926607734);

		a = hh(a, b, c, d, x[5], 4, -378558);
		d = hh(d, a, b, c, x[8], 11, -2022574463);
		c = hh(c, d, a, b, x[11], 16, 1839030562);
		b = hh(b, c, d, a, x[14], 23, -35309556);
		a = hh(a, b, c, d, x[1], 4, -1530992060);
		d = hh(d, a, b, c, x[4], 11, 1272893353);
		c = hh(c, d, a, b, x[7], 16, -155497632);
		b = hh(b, c, d, a, x[10], 23, -1094730640);
		a = hh(a, b, c, d, x[13], 4, 681279174);
		d = hh(d, a, b, c, x[0], 11, -358537222);
		c = hh(c, d, a, b, x[3], 16, -722521979);
		b = hh(b, c, d, a, x[6], 23, 76029189);
		a = hh(a, b, c, d, x[9], 4, -640364487);
		d = hh(d, a, b, c, x[12], 11, -421815835);
		c = hh(c, d, a, b, x[15], 16, 530742520);
		b = hh(b, c, d, a, x[2], 23, -995338651);

		a = ii(a, b, c, d, x[0], 6, -198630844);
		d = ii(d, a, b, c, x[7], 10, 1126891415);
		c = ii(c, d, a, b, x[14], 15, -1416354905);
		b = ii(b, c, d, a, x[5], 21, -57434055);
		a = ii(a, b, c, d, x[12], 6, 1700485571);
		d = ii(d, a, b, c, x[3], 10, -1894986606);
		c = ii(c, d, a, b, x[10], 15, -1051523);
		b = ii(b, c, d, a, x[1], 21, -2054922799);
		a = ii(a, b, c, d, x[8], 6, 1873313359);
		d = ii(d, a, b, c, x[15], 10, -30611744);
		c = ii(c, d, a, b, x[6], 15, -1560198380);
		b = ii(b, c, d, a, x[13], 21, 1309151649);
		a = ii(a, b, c, d, x[4], 6, -145523070);
		d = ii(d, a, b, c, x[11], 10, -1120210379);
		c = ii(c, d, a, b, x[2], 15, 718787259);
		b = ii(b, c, d, a, x[9], 21, -343485551);

		a = (a + oa) | 0;
		b = (b + ob) | 0;
		c = (c + oc) | 0;
		d = (d + od) | 0;
	}

	return toHexLE(a) + toHexLE(b) + toHexLE(c) + toHexLE(d);
}
