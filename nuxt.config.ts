import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://feedwire:feedwire@localhost:5433/feedwire',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-insecure-secret',
    publicFeedUrl:
      process.env.PUBLIC_FEED_URL ?? 'https://news.ycombinator.com/rss',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Feedwire',
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'color-scheme', content: 'dark light' },
        { name: 'theme-color', content: '#ff6600' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Feedwire' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icon.svg' },
        {
          rel: 'icon',
          href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff6600'/%3E%3Cpath d='M10 22a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-3-8v3a7 7 0 0 1 7 7h3a10 10 0 0 0-10-10Zm0-6v3a13 13 0 0 1 13 13h3A16 16 0 0 0 7 8Z' fill='%23fff'/%3E%3C/svg%3E",
        },
      ],
    },
  },

  nitro: {
    experimental: { websocket: false },
  },
});
