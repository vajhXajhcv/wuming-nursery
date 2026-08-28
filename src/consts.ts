// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = '无名苗圃';
export const SITE_DESCRIPTION = '独立开发者 · 技术创作者 · 一人公司探索者。用代码、内容与 AI 工具构建可持续的创作者生意。';

// Cloudflare Turnstile sitekey（评论游客通道的人机验证）。
// 当前为 Cloudflare 官方测试 key（必定通过），上线前替换为正式 sitekey；
// 服务端对应密钥为 TURNSTILE_SECRET（secret 未配置时游客评论 fail-closed）。
export const TURNSTILE_SITEKEY = '1x00000000000000000000AA';