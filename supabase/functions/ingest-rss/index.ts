// MIP — RSS ingestion edge function (deployed v2).
// Fetches a curated set of ideologically and geographically diverse feeds,
// parses RSS 2.0 / Atom, and upserts items into public.articles.
// Scheduled via pg_cron every 6 hours (job: mip-ingest-rss-daily).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FEEDS: Array<{ feed: string; outlet: string; url: string }> = [
  { feed: 'bbc-world', outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { feed: 'aljazeera', outlet: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { feed: 'guardian-world', outlet: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  { feed: 'nyt-world', outlet: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { feed: 'npr-news', outlet: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
  { feed: 'democracynow', outlet: 'Democracy Now!', url: 'https://www.democracynow.org/democracynow.rss' },
  { feed: 'scmp', outlet: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed' },
  { feed: 'timesofindia', outlet: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
]

const MAX_ITEMS_PER_FEED = 30

function tag(block: string, name: string): string | null {
  const m = block.match(
    new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, 'i'),
  )
  return m ? m[1].trim() : null
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseDate(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

function parseFeed(xml: string, feedUrl: string, outlet: string, feed: string) {
  const items: any[] = []
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const block = m[1]
    const title = tag(block, 'title')
    const link = tag(block, 'link') ?? tag(block, 'guid')
    if (!title || !link) continue
    items.push({
      outlet,
      feed,
      title: stripHtml(title),
      url: absoluteUrl(feedUrl, link),
      summary: stripHtml(tag(block, 'description') ?? '').slice(0, 500) || null,
      published_at: parseDate(tag(block, 'pubDate') ?? tag(block, 'dc:date')),
    })
  }
  for (const m of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const block = m[1]
    const title = tag(block, 'title')
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i)
    if (!title || !linkMatch) continue
    items.push({
      outlet,
      feed,
      title: stripHtml(title),
      url: absoluteUrl(feedUrl, linkMatch[1]),
      summary: stripHtml(tag(block, 'summary') ?? tag(block, 'content') ?? '').slice(0, 500) || null,
      published_at: parseDate(tag(block, 'published') ?? tag(block, 'updated')),
    })
  }
  return items.slice(0, MAX_ITEMS_PER_FEED)
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const results: any[] = []

  for (const { feed, outlet, url } of FEEDS) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MIP-Ingestion/0.2)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const items = parseFeed(xml, url, outlet, feed)
      let upserted = 0
      if (items.length > 0) {
        const { error, count } = await supabase
          .from('articles')
          .upsert(items, { onConflict: 'url', ignoreDuplicates: true, count: 'exact' })
        if (error) throw error
        upserted = count ?? items.length
      }
      results.push({ feed, fetched: items.length, upserted, bodyBytes: xml.length })
    } catch (err) {
      results.push({ feed, fetched: 0, upserted: 0, error: String(err) })
    }
  }

  return Response.json({
    ok: true,
    feeds: results,
    totalUpserted: results.reduce((n, r) => n + (r.upserted ?? 0), 0),
    ranAt: new Date().toISOString(),
  })
})
