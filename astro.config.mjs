// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// 从 sitemap 中排除 draft（非公开）文章
const draftPaths = readdirSync('./src/content/blog')
	.filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
	.filter((f) => /^draft:\s*true\s*$/m.test(readFileSync(join('./src/content/blog', f), 'utf8')))
	.map((f) => `/blog/${f.replace(/\.mdx?$/, '')}/`);

// https://astro.build/config
export default defineConfig({
	site: 'https://wumingmp.me',
	integrations: [
		mdx(),
		sitemap({
			// paid-src 是付费正文抽取用的临时页面，构建后会被删除，不进入 sitemap
			filter: (page) =>
				!page.includes('/paid-src/') && !draftPaths.some((p) => page.endsWith(p)),
		}),
	],
	markdown: {
		shikiConfig: {
			theme: 'github-light',
			darkTheme: 'github-dark',
			wrap: true,
		},
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
