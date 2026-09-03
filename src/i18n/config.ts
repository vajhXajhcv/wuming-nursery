export const LOCALES = ['zh', 'en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';

export const LOCALE_LABELS: Record<Locale, string> = {
	zh: '中文',
	en: 'English',
	ja: '日本語',
};

export const HTML_LANG: Record<Locale, string> = {
	zh: 'zh-CN',
	en: 'en',
	ja: 'ja',
};

/** Paths (without locale prefix) that have en/ja translations. */
export const TRANSLATED_PATHS: readonly string[] = [
	'/',
	'/about',
	'/contact',
	'/services',
	'/services/thesis-formatting',
	'/services/custom-development',
	'/tools',
];

/** Remove a leading /en or /ja prefix, returning the base path ('/' for locale roots). */
export function stripLocalePrefix(pathname: string): { base: string; locale: Locale } {
	const m = pathname.match(/^\/(en|ja)(?=\/|$)/);
	if (m) {
		const rest = pathname.slice(m[0].length) || '/';
		return { base: rest.replace(/\/$/, '') || '/', locale: m[1] as Locale };
	}
	return { base: pathname.replace(/\/$/, '') || '/', locale: DEFAULT_LOCALE };
}

/** Build the URL for a base path in a given locale. */
export function localizedPath(base: string, locale: Locale): string {
	const path = base === '/' ? '/' : base;
	return locale === DEFAULT_LOCALE ? path : `/${locale}${path === '/' ? '' : path}/`;
}
