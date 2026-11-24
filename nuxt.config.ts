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
    adminEmails: process.env.ADMIN_EMAILS ?? '',
    schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
    // Web Push. When unset, a VAPID key pair is generated once and stored in
    // app_settings so subscriptions survive restarts.
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: process.env.VAPID_SUBJECT ?? '',
    // When set, /api/metrics requires `Authorization: Bearer <token>`.
    metricsToken: process.env.METRICS_TOKEN ?? '',
    // Password reset delivery: with no mail provider bundled, the link is
    // logged server-side. Set RESET_WEBHOOK_URL to POST it to any mail service,
    // and RESET_LINK_IN_RESPONSE=true to hand it back to the browser (dev only).
    resetWebhookUrl: process.env.RESET_WEBHOOK_URL ?? '',
    // A reset link may only be handed back to the browser when no mail channel
    // exists and the deployment is local, or when explicitly opted in.
    resetLinkInResponse:
      process.env.RESET_LINK_IN_RESPONSE === 'true' ||
      (!process.env.RESET_WEBHOOK_URL &&
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(
          process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000'
        )),
    public: {
      siteUrl: (
        process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000'
      ).replace(/\/+$/, ''),
    },
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
        { name: 'robots', content: 'index,follow' },
        {
          name: 'description',
          content:
            'Feedwire is a fast, bilingual RSS reader for Hacker News and any feed you follow — semantic search, offline reading and one-click Persian translation.',
        },
        { property: 'og:site_name', content: 'Feedwire' },
        { property: 'og:type', content: 'website' },
        {
          property: 'og:title',
          content: 'Feedwire · Hacker News and your own feeds',
        },
        {
          property: 'og:description',
          content:
            'Read Hacker News and your own RSS feeds in one clean, bilingual reader.',
        },
        { name: 'twitter:card', content: 'summary_large_image' },
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
