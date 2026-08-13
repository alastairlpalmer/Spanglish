// Free news sourcing via Google News RSS. Replaces the web-search tool for
// article generation: the feed gives real, current headlines and snippets;
// the model only rewrites, so the expensive and failure-prone search call
// disappears entirely.

export interface NewsItem {
  title: string;
  snippet: string;
  source: string;
  date: string;
}

const COUNTRY_CODES: Array<[RegExp, string]> = [
  [/(mexico|méxico)/i, 'MX'],
  [/(spain|españa)/i, 'ES'],
  [/argentina/i, 'AR'],
  [/colombia/i, 'CO'],
  [/chile/i, 'CL'],
  [/(peru|perú)/i, 'PE'],
  [/uruguay/i, 'UY'],
  [/bolivia/i, 'BO'],
  [/ecuador/i, 'EC'],
  [/guatemala/i, 'GT'],
  [/(costa rica)/i, 'CR'],
  [/(panama|panamá)/i, 'PA'],
  [/cuba/i, 'CU'],
  [/(dominican|república dominicana)/i, 'DO'],
];

const TOPIC_IDS: Record<string, string> = {
  sports: 'SPORTS',
  tech: 'TECHNOLOGY',
  science: 'SCIENCE',
  culture: 'ENTERTAINMENT',
  politics: 'NATION',
  business: 'BUSINESS',
  health: 'HEALTH',
};

export function feedUrl(country: string | null, topic: string | undefined): string {
  const code = country
    ? (COUNTRY_CODES.find(([re]) => re.test(country))?.[1] ?? 'MX')
    : 'MX';
  const locale =
    code === 'ES'
      ? `hl=es&gl=ES&ceid=ES:es`
      : `hl=es-419&gl=${code}&ceid=${code}:es-419`;

  if (!topic) return `https://news.google.com/rss?${locale}`;
  const topicId = TOPIC_IDS[topic.toLowerCase()];
  if (topicId) {
    return `https://news.google.com/rss/headlines/section/topic/${topicId}?${locale}`;
  }
  // Free-text topics (e.g. "history") go through search.
  return `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&${locale}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]!.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')) : '';
}

export function parseFeed(xml: string, limit = 10, defaultSource = 'Google News'): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, limit)) {
    const rawTitle = tag(block, 'title');
    const source = tag(block, 'source');
    // Google News titles carry a " - Source" suffix; strip it when known.
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;
    const snippet = tag(block, 'description');
    const date = tag(block, 'pubDate');
    if (title) items.push({ title, snippet, source: source || defaultSource, date });
  }
  return items;
}

async function fetchFeed(url: string, defaultSource: string): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    return parseFeed(await res.text(), 10, defaultSource);
  } finally {
    clearTimeout(timer);
  }
}

// Google sometimes refuses datacenter IPs. These direct publisher feeds are
// the fallback — always-on Spanish news, no gatekeeping.
const FALLBACK_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/mundo/rss.xml', source: 'BBC Mundo' },
  { url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', source: 'El País' },
  { url: 'https://es.euronews.com/rss', source: 'Euronews' },
];

export async function fetchNews(
  country: string | null,
  topic: string | undefined,
): Promise<NewsItem[]> {
  try {
    const items = await fetchFeed(feedUrl(country, topic), 'Google News');
    if (items.length > 0) return items;
  } catch {
    // fall through to the direct feeds
  }
  for (const feed of FALLBACK_FEEDS) {
    try {
      const items = await fetchFeed(feed.url, feed.source);
      if (items.length > 0) return items;
    } catch {
      // try the next one
    }
  }
  throw new Error('all news feeds failed');
}
