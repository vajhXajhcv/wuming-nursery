// 为博客文章生成标题卡封面（1200x630 PNG，渐变底 + 白色线性图标 + 标题/副标题）。
// 用法：node scripts/make-covers.mjs
// 依赖 sharp（项目已有）。产物写入 src/assets/blog-covers/<slug>.png。
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT_DIR = './src/assets/blog-covers';

// 图标为 Feather Icons 风格的路径（24x24 viewBox）
const ICONS = {
	music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
	link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
	fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
	bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
	message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
	compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
	eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
	flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
	trendingUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
	shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
};

const COVERS = [
	{ slug: 'astro-music-player-and-draft-posts', title: '给 Astro 加上背景音乐', subtitle: '与「非公开文章」机制', icon: 'music', from: '#0f766e', to: '#5ec4b6' },
	{ slug: 'blockchain-ai-learning-plan', title: '区块链核心技术', subtitle: 'AI 增强型 24 周进阶计划', icon: 'link', from: '#3730a3', to: '#9aa8f5' },
	{ slug: 'docx-formatter-online-and-templates', title: '在线 Markdown 转 Word', subtitle: '期刊模板更新', icon: 'fileText', from: '#ea580c', to: '#f5b183' },
	{ slug: 'federalist-papers-elite-discussion', title: '联邦党人文集', subtitle: '精英概念与国家制度', icon: 'bookOpen', from: '#1e40af', to: '#8fb3f0' },
	{ slug: 'finite-being-power-faith-dialogue', title: '有限者的广延', subtitle: '权力、信仰与行动', icon: 'message', from: '#5b21b6', to: '#b79df0' },
	{ slug: 'overseas-development-guide', title: '海外发展', subtitle: '参考指南', icon: 'compass', from: '#0369a1', to: '#7cc4e8' },
	{ slug: 'paranormal-miracles-metaphysics', title: '超常与神迹', subtitle: '形而上学的终结', icon: 'eye', from: '#6b21a8', to: '#c9a4ef' },
	{ slug: 'sisters-to-rogues-prohibition', title: '从「姐妹」到「流氓」', subtitle: '新中国初期禁娼运动', icon: 'flag', from: '#be123c', to: '#f193a5' },
	{ slug: 'site-commercialization-redesign', title: '从博客到产品站', subtitle: '商业化重构记录', icon: 'trendingUp', from: '#15803d', to: '#8fd9a8' },
	{ slug: 'ai-security-audit-hardening', title: 'AI 给我的网站做安全体检', subtitle: '从检测到修复的全记录', icon: 'shield', from: '#0f3d5c', to: '#5fb8d9' },
	{ slug: 'site-progress-payment-ledger-dao', title: '网站阶段总结', subtitle: '支付、账本与组织', icon: 'flag', from: '#0e7490', to: '#7dd3fc' },
];

const FONT = "'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif";

function escapeXml(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function coverSvg({ title, subtitle, icon, from, to }) {
	return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${from}"/>
			<stop offset="1" stop-color="${to}"/>
		</linearGradient>
	</defs>
	<rect width="1200" height="630" fill="url(#bg)"/>
	<g transform="translate(558 118) scale(3.5)" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
		${ICONS[icon]}
	</g>
	<text x="600" y="345" text-anchor="middle" font-family="${FONT}" font-size="66" font-weight="700" fill="#ffffff">${escapeXml(title)}</text>
	<text x="600" y="435" text-anchor="middle" font-family="${FONT}" font-size="34" fill="#ffffff" opacity="0.88">${escapeXml(subtitle)}</text>
</svg>`;
}

mkdirSync(OUT_DIR, { recursive: true });

for (const cover of COVERS) {
	const out = `${OUT_DIR}/${cover.slug}.png`;
	await sharp(Buffer.from(coverSvg(cover))).png().toFile(out);
	console.log(`[make-covers] ${out}`);
}
console.log('[make-covers] 完成，共 ' + COVERS.length + ' 张。');
