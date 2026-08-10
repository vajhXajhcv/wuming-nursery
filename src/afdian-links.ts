// 爱发电购买链接配置
// 在爱发电为每篇付费文章创建"商品"并开启自动发货后，把商品链接填到对应 slug 下。
// 未配置的文章回退到店铺主页。
export const AFDIAN_SHOP_URL = 'https://afdian.com/a/jk342joy';

export const AFDIAN_ITEM_URLS: Record<string, string> = {
	// 'sisters-to-rogues-prohibition': 'https://afdian.com/item/xxxx',
	// 'federalist-papers-elite-discussion': 'https://afdian.com/item/xxxx',
	// 'overseas-development-guide': 'https://afdian.com/item/xxxx',
	// 'finite-being-power-faith-dialogue': 'https://afdian.com/item/xxxx',
};

export function afdianUrlFor(slug: string): string {
	return AFDIAN_ITEM_URLS[slug] || AFDIAN_SHOP_URL;
}
