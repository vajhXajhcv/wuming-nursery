import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const posts = await getCollection('blog');
	const notes = await getCollection('notes');
	const allItems = [...posts, ...notes].sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: allItems.map((item) => ({
			title: item.data.title,
			description: item.data.description,
			pubDate: item.data.pubDate,
			link: `/${item.collection}/${item.id}/`,
			categories: item.data.tags || [],
		})),
		customData: `<language>zh-CN</language>`,
	});
}
