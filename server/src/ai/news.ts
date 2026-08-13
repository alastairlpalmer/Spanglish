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

export function parseFeed(xml: string, limit = 10): NewsItem[] {
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
    if (title) items.push({ title, snippet, source: source || 'Google News', date });
  }
  return items;
}

export async function fetchNews(
  country: string | null,
  topic: string | undefined,
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(feedUrl(country, topic), {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (seiscientas news reader)' },
    });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    return parseFeed(await res.text());
  } finally {
    clearTimeout(timer);
  }
}
