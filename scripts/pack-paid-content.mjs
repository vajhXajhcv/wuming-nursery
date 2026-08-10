// 构建后抽取付费文章正文（在 astro build 之后由 npm run build 自动调用）：
// 1. 读取 dist/paid-src/<slug>/index.html，提取 <div id="paid-body"> 内部 HTML；
// 2. 写入 dist-paid-content/<slug>.html（临时目录，不上传 dist，不上 git）；
// 3. 生成 dist-paid-content/catalog.json：{ slug: { title, price, wordCount } }；
// 4. 删除 dist/paid-src/，保证正文绝不出现在公开产物中。
//
// 之后运行 npm run upload:content 把 dist-paid-content/ 上传到 Cloudflare KV。
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'dist/paid-src';
const OUT_DIR = 'dist-paid-content';
const BLOG_DIR = 'src/content/blog';

const START_MARKER = '<div id="paid-body">';

// 与文章页保持一致：wordCount = Markdown 正文长度，price = max(1, round(wordCount / 2000))
function priceOf(wordCount) {
	return Math.max(1, Math.round(wordCount / 2000));
}

function parseMarkdown(slug) {
	for (const ext of ['.md', '.mdx']) {
		const file = join(BLOG_DIR, slug + ext);
		if (!existsSync(file)) continue;
		const src = readFileSync(file, 'utf8');
		const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		const frontmatter = m ? m[1] : '';
		const body = m ? src.slice(m[0].length) : src;
		const titleMatch = frontmatter.match(/^title:\s*(.+?)\s*$/m);
		const title = titleMatch ? titleMatch[1].replace(/^["']|["']$/g, '').replace(/\\"/g, '"') : slug;
		return { title, wordCount: body.length };
	}
	throw new Error(`找不到 ${slug} 对应的 Markdown 源文件`);
}

function extractPaidBody(html, slug) {
	const start = html.indexOf(START_MARKER);
	if (start === -1) throw new Error(`${slug}: 未找到 ${START_MARKER}`);
	// paid-src 页面是我们自己生成的裸 HTML，最后一个 </div> 即 #paid-body 的闭合标签
	const end = html.lastIndexOf('</div>');
	if (end <= start) throw new Error(`${slug}: 未找到 #paid-body 闭合标签`);
	return html.slice(start + START_MARKER.length, end).trim();
}

if (!existsSync(SRC_DIR)) {
	console.log('[pack-paid-content] 没有付费文章（dist/paid-src 不存在），跳过。');
	process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

const catalog = {};
const slugs = readdirSync(SRC_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

for (const slug of slugs) {
	const html = readFileSync(join(SRC_DIR, slug, 'index.html'), 'utf8');
	const body = extractPaidBody(html, slug);
	const { title, wordCount } = parseMarkdown(slug);
	writeFileSync(join(OUT_DIR, `${slug}.html`), body);
	catalog[slug] = { title, price: priceOf(wordCount), wordCount };
	console.log(`[pack-paid-content] ${slug}: ${wordCount} 字, ¥${catalog[slug].price}`);
}

writeFileSync(join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));

// 关键步骤：删除公开产物中的付费正文
rmSync(SRC_DIR, { recursive: true, force: true });

console.log(`[pack-paid-content] 已抽取 ${slugs.length} 篇付费文章到 ${OUT_DIR}/，并已删除 ${SRC_DIR}/。`);
console.log('[pack-paid-content] 下一步：运行 npm run upload:content 将正文上传到 Cloudflare KV（CONTENT binding）。');
