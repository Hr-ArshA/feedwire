/**
 * Curated feed catalog shared by the add-feed dialog and the Explore page.
 * Every entry is a public RSS/Atom feed, so the shared-pool model fetches and
 * embeds it once for all subscribers.
 */
export const FEED_CATALOG = [
  {
    title: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
    tag: 'Technology',
    description: 'The front page of the engineering internet, as it happens.',
  },
  {
    title: 'Lobsters',
    url: 'https://lobste.rs/rss',
    tag: 'Technology',
    description: 'A smaller, calmer Hacker News for programmers.',
  },
  {
    title: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    tag: 'Technology',
    description: 'Deep reporting on hardware, software and science policy.',
  },
  {
    title: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    tag: 'Technology',
    description: 'Gadgets, platforms and the culture around them.',
  },
  {
    title: 'Wired',
    url: 'https://www.wired.com/feed/rss',
    tag: 'Technology',
    description: 'Long-form tech, science and business features.',
  },
  {
    title: 'GitHub Blog',
    url: 'https://github.blog/feed/',
    tag: 'Technology',
    description: 'Product news, open source and engineering write-ups.',
  },
  {
    title: 'Hugging Face',
    url: 'https://huggingface.co/blog/feed.xml',
    tag: 'Technology',
    description: 'Open models, datasets and machine-learning research.',
  },
  {
    title: 'Krebs on Security',
    url: 'https://krebsonsecurity.com/feed/',
    tag: 'Security',
    description: 'Investigative reporting on breaches, fraud and cybercrime.',
  },
  {
    title: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    tag: 'Security',
    description: 'Daily vulnerability and threat-intelligence briefings.',
  },
  {
    title: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    tag: 'World',
    description: 'Global headlines from the BBC newsroom.',
  },
  {
    title: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    tag: 'World',
    description: 'World news, analysis and long reads.',
  },
  {
    title: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    tag: 'World',
    description: 'International reporting with a Global South lens.',
  },
  {
    title: 'NPR News',
    url: 'https://feeds.npr.org/1001/rss.xml',
    tag: 'World',
    description: 'US and world news from public radio.',
  },
  {
    title: 'Google News',
    url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
    tag: 'World',
    description: 'Top stories across thousands of publishers.',
  },
  {
    title: 'NASA',
    url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',
    tag: 'Science',
    description: 'Mission updates and breaking space science.',
  },
  {
    title: 'Nature',
    url: 'https://www.nature.com/nature.rss',
    tag: 'Science',
    description: 'Peer-reviewed research highlights and news.',
  },
  {
    title: 'Quanta Magazine',
    url: 'https://api.quantamagazine.org/feed/',
    tag: 'Science',
    description: 'Mathematics, physics and biology explained well.',
  },
  {
    title: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    tag: 'Science',
    description: 'Emerging technology and its consequences.',
  },
  {
    title: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    tag: 'Business',
    description: 'Startups, funding rounds and product launches.',
  },
  {
    title: 'Harvard Business Review',
    url: 'https://feeds.hbr.org/harvardbusiness',
    tag: 'Business',
    description: 'Management research and workplace strategy.',
  },
  {
    title: 'Smashing Magazine',
    url: 'https://www.smashingmagazine.com/feed/',
    tag: 'Design',
    description: 'Practical front-end and UX craft.',
  },
  {
    title: 'CSS-Tricks',
    url: 'https://css-tricks.com/feed/',
    tag: 'Design',
    description: 'CSS techniques, layout and small web experiments.',
  },
  {
    title: 'A List Apart',
    url: 'https://alistapart.com/main/feed/',
    tag: 'Design',
    description: 'Standards, content strategy and design ethics.',
  },
  {
    title: 'xkcd',
    url: 'https://xkcd.com/rss.xml',
    tag: 'Culture',
    description: 'A webcomic of romance, sarcasm, math and language.',
  },
  {
    title: 'The Marginalian',
    url: 'https://www.themarginalian.org/feed/',
    tag: 'Culture',
    description: 'Essays on art, science and the search for meaning.',
  },
  {
    title: 'Polygon',
    url: 'https://www.polygon.com/rss/index.xml',
    tag: 'Gaming',
    description: 'Games, the people who make them and the culture around them.',
  },
  {
    title: 'Rock Paper Shotgun',
    url: 'https://www.rockpapershotgun.com/feed',
    tag: 'Gaming',
    description: 'PC gaming news, reviews and oddities.',
  },
  {
    title: 'Zoomit',
    url: 'https://www.zoomit.ir/feed/',
    tag: 'Persian',
    description: 'فناوری، گجت و اخبار دیجیتال به فارسی.',
  },
  {
    title: 'Digiato',
    url: 'https://digiato.com/feed',
    tag: 'Persian',
    description: 'اخبار فناوری و بررسی محصولات به فارسی.',
  },
];

export const CATALOG_TAGS = [
  'Technology',
  'Security',
  'World',
  'Science',
  'Business',
  'Design',
  'Culture',
  'Gaming',
  'Persian',
];

/** Same feed regardless of scheme case, `www.`, trailing slash or tracking. */
export function feedKey(value) {
  try {
    const url = new URL(String(value));
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.host.replace(/^www\./, '')}${path}`.toLowerCase();
  } catch {
    return String(value ?? '').toLowerCase();
  }
}

export function sameFeedUrl(a, b) {
  return feedKey(a) === feedKey(b);
}
