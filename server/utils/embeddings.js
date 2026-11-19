import { env, pipeline } from '@huggingface/transformers';
import { join, resolve } from 'node:path';
import { clampText, normalizeText } from './text.js';
import { EMBEDDING_DIM, MODEL_ID } from './model.js';

// The bundler rewrites `import.meta.url` to `file:///` on Windows, so resolve
// the model directory from the process working directory instead (the server
// is always started from the project root) with an explicit override available.
const root = process.env.FEEDWIRE_ROOT
  ? resolve(process.env.FEEDWIRE_ROOT)
  : process.cwd();

env.localModelPath = `${join(root, 'models')}/`;
env.cacheDir = join(root, 'models', '.cache');
env.allowRemoteModels = false;
env.allowLocalModels = true;

export const CATEGORIES = [
  {
    id: 'technology',
    label: 'Technology',
    fa: 'فناوری',
    examples: [
      'New smartphone release and gadget review',
      'Software update for Windows and macOS',
      'Programming languages, frameworks and developer tools',
      'Artificial intelligence and machine learning models',
      'Open source project on GitHub',
      'اپلیکیشن و نرم‌افزار جدید',
      'به‌روزرسانی ویندوز و اندروید',
      'هوش مصنوعی و یادگیری ماشین',
      'برنامه‌نویسی و توسعه نرم‌افزار',
      'سخت‌افزار و پردازنده جدید',
    ],
  },
  {
    id: 'security',
    label: 'Security',
    fa: 'امنیت',
    examples: [
      'Critical vulnerability exploited in the wild',
      'Hackers breach company database',
      'Privacy and encryption concerns',
      'Malware and ransomware attack',
      'امنیت سایبری و نشت داده',
      'هک و بدافزار',
      'آسیب‌پذیری امنیتی',
      'رمزنگاری و حریم خصوصی',
    ],
  },
  {
    id: 'science',
    label: 'Science',
    fa: 'علم',
    examples: [
      'New study published in Nature',
      'Space telescope discovers exoplanet',
      'Physics experiment results',
      'Climate research findings',
      'پژوهش علمی جدید',
      'کشف فضایی و نجوم',
      'مطالعه در نشریه علمی',
      'فیزیک و زیست‌شناسی',
    ],
  },
  {
    id: 'business',
    label: 'Business',
    fa: 'کسب‌وکار',
    examples: [
      'Startup raises funding round',
      'Company earnings and stock market',
      'Acquisition and layoffs',
      'Economy and inflation report',
      'استارتاپ سرمایه جذب کرد',
      'بازار سهام و اقتصاد',
      'خرید شرکت و تعدیل نیرو',
    ],
  },
  {
    id: 'world',
    label: 'World',
    fa: 'جهان',
    examples: [
      'Election results and government policy',
      'War and conflict in the region',
      'International diplomacy and sanctions',
      'اخبار سیاسی و انتخابات',
      'جنگ و درگیری',
      'سیاست خارجی و تحریم',
    ],
  },
  {
    id: 'culture',
    label: 'Culture',
    fa: 'فرهنگ',
    examples: [
      'Film review and movie release',
      'Book and literature',
      'Music album and art exhibition',
      'History and philosophy essay',
      'فیلم و سینما',
      'کتاب و ادبیات',
      'موسیقی و هنر',
      'تاریخ و فلسفه',
    ],
  },
  {
    id: 'health',
    label: 'Health',
    fa: 'سلامت',
    examples: [
      'Medical treatment and clinical trial',
      'Mental health and psychology',
      'Nutrition diet and fitness',
      'سلامت و درمان',
      'پزشکی و بیماری',
      'روان‌شناسی و تغذیه',
    ],
  },
  {
    id: 'design',
    label: 'Design',
    fa: 'طراحی',
    examples: [
      'User interface and UX design',
      'Typography and branding',
      'Product design and illustration',
      'طراحی رابط کاربری',
      'تایپوگرافی و برندینگ',
      'طراحی محصول',
    ],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    fa: 'بازی',
    examples: [
      'Video game release and review',
      'PlayStation and Xbox consoles',
      'Game studio and esports tournament',
      'Game cheats and walkthrough',
      'بازی ویدیویی و کنسول',
      'پلی‌استیشن و ایکس‌باکس',
      'استودیو بازی و ورزش الکترونیک',
    ],
  },
];

let extractorPromise = null;
let exemplarsPromise = null;

export function loadModel() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
  }
  return extractorPromise;
}

async function embed(texts) {
  const extractor = await loadModel();
  const output = await extractor(texts, { pooling: 'cls', normalize: true });
  const [count, dim] = output.dims;
  const vectors = [];
  for (let index = 0; index < count; index += 1) {
    vectors.push(output.data.subarray(index * dim, (index + 1) * dim));
  }
  return vectors;
}

export function embedPassages(texts) {
  return embed(texts.map((text) => clampText(text)));
}

export async function embedQuery(text) {
  const [vector] = await embed([clampText(text, 300)]);
  return vector;
}

export function getCategoryExemplars() {
  if (!exemplarsPromise) {
    const flat = CATEGORIES.flatMap((category) =>
      category.examples.map((text) => ({ category: category.id, text }))
    );
    exemplarsPromise = embedPassages(flat.map((entry) => entry.text)).then(
      (vectors) =>
        flat.map((entry, index) => ({
          category: entry.category,
          vector: vectors[index],
        }))
    );
  }
  return exemplarsPromise;
}

export const CATEGORY_MIN_SCORE = 0.42;

const LEXICON = {
  technology: [
    'software', 'app', 'apps', 'windows', 'linux', 'android', 'ios', 'iphone',
    'chip', 'chips', 'cpu', 'gpu', 'ai', 'llm', 'api', 'code', 'coding',
    'developer', 'developers', 'github', 'browser', 'cloud', 'server',
    'database', 'gadget', 'phone', 'laptop', 'open source', 'programming',
    'nvidia', 'intel', 'نرم‌افزار', 'نرم افزار',
    'اپلیکیشن', 'هوش مصنوعی', 'ویندوز', 'اندروید', 'سخت‌افزار', 'پردازنده',
    'برنامه‌نویسی', 'توسعه‌دهنده', 'گوشی',
  ],
  security: [
    'vulnerability', 'vulnerabilities', 'exploit', 'exploited', 'malware',
    'ransomware', 'breach', 'breached', 'hacker', 'hackers', 'hacking',
    'phishing', 'encryption', 'privacy', 'cve', 'zero-day', 'botnet',
    'امنیت', 'هک', 'بدافزار', 'آسیب‌پذیری', 'رمزنگاری', 'نشت داده', 'حریم خصوصی',
  ],
  science: [
    'study', 'studies', 'researchers', 'scientists', 'physics', 'biology',
    'astronomy', 'telescope', 'climate', 'nasa', 'esa', 'quantum', 'gene',
    'dna', 'microbiome', 'neuroscience', 'پژوهش', 'دانشمندان', 'مطالعه', 'فضا',
    'نجوم', 'فیزیک', 'زیست', 'اقلیم', 'ژن',
  ],
  business: [
    'funding', 'raises', 'raised', 'ipo', 'acquisition', 'acquires', 'acquired',
    'layoffs', 'laid off', 'revenue', 'earnings', 'stock', 'shares',
    'economy', 'inflation', 'valuation', 'investors', 'startup',
    'استارتاپ', 'سرمایه', 'خرید شرکت', 'تعدیل نیرو', 'درآمد', 'سهام', 'اقتصاد',
    'تورم', 'بازار',
  ],
  world: [
    'election', 'elections', 'president', 'minister', 'government', 'war',
    'military', 'sanctions', 'diplomacy', 'parliament', 'nato', 'border',
    'انتخابات', 'دولت', 'جنگ', 'تحریم', 'دیپلماسی', 'مجلس', 'وزیر', 'مرز',
  ],
  culture: [
    'film', 'movie', 'novel', 'book', 'books', 'album', 'music', 'art',
    'museum', 'history', 'philosophy', 'author', 'poetry', 'cinema',
    'فیلم', 'کتاب', 'موسیقی', 'هنر', 'تاریخ', 'فلسفه', 'رمان', 'سینما',
  ],
  health: [
    'health', 'medical', 'disease', 'vaccine', 'cancer', 'therapy', 'mental',
    'nutrition', 'sleep', 'diet', 'obesity', 'سلامت', 'پزشکی', 'بیماری',
    'واکسن', 'درمان', 'تغذیه', 'روان',
  ],
  design: [
    'design', 'designer', 'designers', 'ux', 'ui', 'typography', 'branding',
    'font', 'interface', 'illustration', 'طراحی', 'تایپوگرافی', 'برندینگ',
    'رابط کاربری', 'فونت',
  ],
  gaming: [
    'game', 'games', 'gaming', 'playstation', 'xbox', 'nintendo', 'steam',
    'console', 'esports', 'gta', 'minecraft', 'fortnite', 'grand theft auto',
    'rockstar', 'بازی', 'کنسول', 'پلی‌استیشن', 'ایکس‌باکس',
  ],
};

const latinPatterns = new Map();

function matchesKeyword(text, keyword, tokens) {
  if (!/^[a-z0-9][a-z0-9 -]*$/.test(keyword)) {
    return text.includes(keyword);
  }
  if (keyword.length <= 3) return tokens.has(keyword);
  if (!latinPatterns.has(keyword)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    latinPatterns.set(
      keyword,
      new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`)
    );
  }
  return latinPatterns.get(keyword).test(text);
}

function keywordScore(category, text, tokens) {
  let score = 0;
  for (const keyword of LEXICON[category] ?? []) {
    if (matchesKeyword(text, keyword, tokens)) score += 1;
  }
  return score;
}

/**
 * Deterministic keyword vote used to correct obvious embedding mistakes
 * (e.g. a GTA headline landing in "business" because of the word "sales").
 */
export function keywordCategory(title, summary) {
  const titleText = normalizeText(title);
  const summaryText = normalizeText(summary ?? '').slice(0, 600);
  const titleTokens = new Set(titleText.split(/[^\p{L}\p{N}]+/u));
  const summaryTokens = new Set(summaryText.split(/[^\p{L}\p{N}]+/u));

  let best = null;
  for (const category of Object.keys(LEXICON)) {
    const titleScore = keywordScore(category, titleText, titleTokens);
    const summaryScore = keywordScore(category, summaryText, summaryTokens);
    const score = titleScore * 2 + summaryScore;
    const strongEnough = titleScore >= 1 || summaryScore >= 3;
    if (!strongEnough) continue;
    if (score >= 2 && (!best || score > best.score)) {
      best = { category, score };
    }
  }
  return best;
}

/**
 * Nearest-exemplar classification (k=1 over bilingual exemplars). This beats a
 * single centroid per label by a wide margin on short news headlines.
 */
export async function classify(vector, title = '', summary = '') {
  const exemplars = await getCategoryExemplars();
  let best = { category: 'other', score: -1 };

  for (const entry of exemplars) {
    let score = 0;
    for (let index = 0; index < vector.length; index += 1) {
      score += vector[index] * entry.vector[index];
    }
    if (score > best.score) {
      best = { category: entry.category, score };
    }
  }

  const nearest =
    best.score >= CATEGORY_MIN_SCORE
      ? { ...best, source: 'auto' }
      : { category: 'other', score: best.score, source: 'auto' };

  const lexical = keywordCategory(title, summary);
  return lexical
    ? { category: lexical.category, score: nearest.score, source: 'keyword' }
    : nearest;
}

export function toBuffer(vector) {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

/**
 * PostgreSQL stores the embedding as `real[]`. Vectors come out of the model
 * already L2-normalised, so cosine similarity equals a plain dot product.
 */
export function toArray(vector) {
  return Array.from(vector, (value) => Number(value));
}
