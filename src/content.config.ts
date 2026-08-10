import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).optional(),
			// draft = 非公开：页面仍生成（可通过直链访问），但从列表/归档/RSS/标签/站点地图中隐藏，并加 noindex
			draft: z.boolean().optional(),
			// paid = 付费阅读：正文构建时被抽取到 KV（见 scripts/pack-paid-content.mjs），
			// 文章页只渲染摘要 + Paywall 组件，付款/令牌验证后由 /api/content 下发正文
			paid: z.boolean().optional(),
		}),
});

const notes = defineCollection({
	loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		tags: z.array(z.string()).optional(),
	}),
});

export const collections = { blog, notes };
