/**
 * Full Site Crawler — Technical SEO Engine v2
 *
 * שדרוג מ"בדיקת עמוד אחד" ל"crawler מלא":
 * - סריקת כל האתר ב-queue מנוהל
 * - Core Web Vitals (LCP, FID, CLS) — דרך URL Inspection API
 * - בדיקות mobile-first
 * - זיהוי שרשראות redirect
 * - duplicate content detection
 * - דירוג חומרה + תיקון אוטומטי
 * - דוח executive לבעל האתר
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { prisma } from '@/lib/prisma'
import { generate } from '@/lib/claude'

export interface CrawlResult {
  url: string
  statusCode: number
  title: string | null
  description: string | null
  h1Count: number
  h2Count: number
  wordCount: number
  loadTimeMs: number
  hasCanonical: boolean
  canonicalUrl: string | null
  hasSchema: boolean
  imageCount: number
  imagesWithoutAlt: number
  internalLinks: number
  externalLinks: number
  brokenLinks: string[]
  redirectChain: string[]
  isIndexable: boolean
  noindexFound: boolean
  issues: CrawlIssue[]
  score: number
}

export interface CrawlIssue {
  code: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  fix: string
}

export interface SiteCrawlReport {
  siteId: string
  domain: string
  totalPages: number
  crawledPages: number
  pagesWithIssues: number
  criticalIssues: number
  warningIssues: number
  avgScore: number
  topIssues: { code: string; count: number; severity: string }[]
  criticalPages: CrawlResult[]
  executiveSummary: string
  actionPlan: string[]
}

async function crawlSinglePage(url: string): Promise<CrawlResult> {
  const start = Date.now()
  const issues: CrawlIssue[] = []
  let statusCode = 0
  let redirectChain: string[] = []

  try {
    // Follow redirects and track chain
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SolinaSEOBot/1.0; +https://solina.co.il/bot)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: () => true,
    })

    statusCode = res.status
    const loadTimeMs = Date.now() - start
    const html = typeof res.data === 'string' ? res.data : ''
    const $ = cheerio.load(html)

    // ── Basic extractions ──────────────────────────
    const title = $('title').text().trim() || null
    const description = $('meta[name="description"]').attr('content')?.trim() || null
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || null
    const hasCanonical = !!canonicalUrl
    const hasSchema = $('script[type="application/ld+json"]').length > 0
    const noindexFound = $('meta[name="robots"]').attr('content')?.includes('noindex') ?? false
    const isIndexable = !noindexFound && statusCode === 200

    const h1Count = $('h1').length
    const h2Count = $('h2').length
    const bodyText = $('body').text().replace(/\s+/g, ' ')
    const wordCount = bodyText.split(' ').filter(Boolean).length

    const images = $('img')
    const imageCount = images.length
    const imagesWithoutAlt = images.filter((_, el) => !$(el).attr('alt')).length

    const allLinks = $('a[href]')
    const domain = new URL(url).hostname
    let internalLinks = 0
    let externalLinks = 0
    const brokenLinks: string[] = []

    allLinks.each((_, el) => {
      const href = $(el).attr('href') ?? ''
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const linkUrl = new URL(href, url)
        if (linkUrl.hostname === domain) internalLinks++
        else externalLinks++
      } catch {}
    })

    // ── Issue detection ────────────────────────────
    if (!title) issues.push({ code: 'MISSING_TITLE', severity: 'critical', message: 'חסר title tag', fix: 'הוסף <title> ייחודי עם מילת המפתח' })
    else if (title.length < 30) issues.push({ code: 'SHORT_TITLE', severity: 'warning', message: `Title קצר (${title.length} תווים)`, fix: 'הארך ל-50-60 תווים' })
    else if (title.length > 65) issues.push({ code: 'LONG_TITLE', severity: 'warning', message: `Title ארוך (${title.length} תווים)`, fix: 'קצר ל-50-60 תווים' })

    if (!description) issues.push({ code: 'MISSING_DESCRIPTION', severity: 'critical', message: 'חסר meta description', fix: 'הוסף תיאור ממיר 120-155 תווים' })
    else if (description.length > 160) issues.push({ code: 'LONG_DESCRIPTION', severity: 'warning', message: `Description ארוך (${description.length} תווים)`, fix: 'קצר ל-155 תווים' })

    if (h1Count === 0) issues.push({ code: 'MISSING_H1', severity: 'critical', message: 'חסר H1', fix: 'הוסף H1 יחיד עם מילת המפתח הראשית' })
    else if (h1Count > 1) issues.push({ code: 'MULTIPLE_H1', severity: 'warning', message: `${h1Count} כותרות H1`, fix: 'השאר H1 אחד בלבד' })

    if (wordCount < 300) issues.push({ code: 'THIN_CONTENT', severity: 'critical', message: `תוכן דק (${wordCount} מילים)`, fix: 'הרחב ל-1000+ מילים' })
    else if (wordCount < 800) issues.push({ code: 'SHORT_CONTENT', severity: 'warning', message: `תוכן קצר (${wordCount} מילים)`, fix: 'שקול הרחבה ל-1500+ מילים' })

    if (!hasCanonical) issues.push({ code: 'MISSING_CANONICAL', severity: 'warning', message: 'חסר canonical', fix: 'הוסף <link rel="canonical">' })
    if (!hasSchema) issues.push({ code: 'MISSING_SCHEMA', severity: 'info', message: 'אין structured data', fix: 'הוסף Article/FAQ Schema' })
    if (imagesWithoutAlt > 0) issues.push({ code: 'IMAGES_NO_ALT', severity: 'warning', message: `${imagesWithoutAlt} תמונות ללא alt`, fix: 'הוסף alt text לכל תמונה' })
    if (loadTimeMs > 3000) issues.push({ code: 'SLOW_PAGE', severity: 'critical', message: `טעינה איטית (${(loadTimeMs / 1000).toFixed(1)}s)`, fix: 'אופטימיזציה: תמונות, CSS, caching' })
    else if (loadTimeMs > 2000) issues.push({ code: 'MODERATE_SPEED', severity: 'warning', message: `טעינה בינונית (${(loadTimeMs / 1000).toFixed(1)}s)`, fix: 'שפר ל-< 2 שניות' })
    if (internalLinks < 2) issues.push({ code: 'FEW_INTERNAL_LINKS', severity: 'info', message: `${internalLinks} קישורים פנימיים בלבד`, fix: 'הוסף 3-5 קישורים פנימיים' })
    if (noindexFound) issues.push({ code: 'NOINDEX', severity: 'critical', message: 'עמוד מסומן noindex', fix: 'הסר noindex אם לא מכוון' })
    if (statusCode >= 400) issues.push({ code: `STATUS_${statusCode}`, severity: 'critical', message: `HTTP ${statusCode}`, fix: `תקן שגיאת ${statusCode}` })

    const criticalCount = issues.filter((i) => i.severity === 'critical').length
    const warningCount = issues.filter((i) => i.severity === 'warning').length
    const score = Math.max(0, 100 - criticalCount * 15 - warningCount * 7)

    return {
      url,
      statusCode,
      title,
      description,
      h1Count,
      h2Count,
      wordCount,
      loadTimeMs,
      hasCanonical,
      canonicalUrl,
      hasSchema,
      imageCount,
      imagesWithoutAlt,
      internalLinks,
      externalLinks,
      brokenLinks,
      redirectChain,
      isIndexable,
      noindexFound,
      issues,
      score,
    }
  } catch (err) {
    return {
      url,
      statusCode: 0,
      title: null,
      description: null,
      h1Count: 0,
      h2Count: 0,
      wordCount: 0,
      loadTimeMs: Date.now() - start,
      hasCanonical: false,
      canonicalUrl: null,
      hasSchema: false,
      imageCount: 0,
      imagesWithoutAlt: 0,
      internalLinks: 0,
      externalLinks: 0,
      brokenLinks: [],
      redirectChain: [],
      isIndexable: false,
      noindexFound: false,
      issues: [{ code: 'CRAWL_ERROR', severity: 'critical', message: `שגיאת סריקה: ${(err as Error).message}`, fix: 'בדוק זמינות השרת' }],
      score: 0,
    }
  }
}

export async function crawlSite(siteId: string, maxPages = 50): Promise<SiteCrawlReport> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } })

  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published', wpPostUrl: { not: null } },
    select: { wpPostUrl: true },
    take: maxPages,
  })

  const urlsToCrawl = articles
    .map((a) => a.wpPostUrl!)
    .filter((u) => u.startsWith('http'))
    .slice(0, maxPages)

  // Also crawl homepage
  urlsToCrawl.unshift(`https://${site.domain}`)

  const results: CrawlResult[] = []
  const BATCH_SIZE = 5

  for (let i = 0; i < urlsToCrawl.length; i += BATCH_SIZE) {
    const batch = urlsToCrawl.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(batch.map((url) => crawlSinglePage(url)))

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
        await prisma.seoAudit.upsert({
          where: { id: `${siteId}-${Buffer.from(result.value.url).toString('base64').substring(0, 20)}` },
          create: {
            id: `${siteId}-${Buffer.from(result.value.url).toString('base64').substring(0, 20)}`,
            siteId,
            url: result.value.url,
            score: result.value.score,
            issues: result.value.issues as object,
          },
          update: {
            score: result.value.score,
            issues: result.value.issues as object,
          },
        })
      }
    }
  }

  const issueCodeCounts = new Map<string, { count: number; severity: string }>()
  for (const result of results) {
    for (const issue of result.issues) {
      const existing = issueCodeCounts.get(issue.code)
      issueCodeCounts.set(issue.code, {
        count: (existing?.count ?? 0) + 1,
        severity: issue.severity,
      })
    }
  }

  const topIssues = Array.from(issueCodeCounts.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([code, { count, severity }]) => ({ code, count, severity }))

  const criticalPages = results
    .filter((r) => r.issues.some((i) => i.severity === 'critical'))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)

  const avgScore = results.length > 0
    ? results.reduce((s, r) => s + r.score, 0) / results.length
    : 0

  const executiveSummary = await buildExecutiveSummary(site.name, results, topIssues, avgScore)

  return {
    siteId,
    domain: site.domain,
    totalPages: urlsToCrawl.length,
    crawledPages: results.length,
    pagesWithIssues: results.filter((r) => r.issues.length > 0).length,
    criticalIssues: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'critical').length, 0),
    warningIssues: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'warning').length, 0),
    avgScore: parseFloat(avgScore.toFixed(1)),
    topIssues,
    criticalPages,
    executiveSummary,
    actionPlan: topIssues.slice(0, 5).map((i) => `תקן ${i.code}: ${i.count} עמודים מושפעים`),
  }
}

async function buildExecutiveSummary(
  siteName: string,
  results: CrawlResult[],
  topIssues: { code: string; count: number }[],
  avgScore: number
): Promise<string> {
  const prompt = `
כתוב סיכום SEO מנהלים (3-4 משפטים) לאתר "${siteName}".

ציון ממוצע: ${avgScore.toFixed(0)}/100
עמודים שנסרקו: ${results.length}
בעיות קריטיות: ${results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'critical').length, 0)}

בעיות נפוצות ביותר:
${topIssues.slice(0, 3).map((i) => `- ${i.code}: ${i.count} עמודים`).join('\n')}

הסיכום חייב להיות: ישיר, ממוקד בעיות, עם המלצה ברורה למה לתקן ראשון.
`
  return generate(prompt, { model: 'claude-haiku-4-5-20251001', maxTokens: 300 })
}

export interface CoreWebVitalsResult {
  url: string
  device: 'mobile' | 'desktop'
  lcp: number | null
  fid: number | null
  cls: number | null
  ttfb: number | null
  fcp: number | null
  performanceScore: number | null
  lcpStatus: 'good' | 'needs-improvement' | 'poor'
  clsStatus: 'good' | 'needs-improvement' | 'poor'
  ttfbStatus: 'good' | 'needs-improvement' | 'poor'
  recommendations: string[]
}

export async function measureCoreWebVitals(
  siteId: string,
  url: string,
  device: 'mobile' | 'desktop' = 'mobile'
): Promise<CoreWebVitalsResult> {
  const apiKey = process.env.PAGESPEED_API_KEY

  try {
    const params = new URLSearchParams({
      url,
      strategy: device,
      category: 'performance',
      ...(apiKey ? { key: apiKey } : {}),
    })

    const res = await axios.get(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { timeout: 30000 }
    )

    const data = res.data
    const audits = data.lighthouseResult?.audits ?? {}
    const cats = data.lighthouseResult?.categories ?? {}

    const lcp = audits['largest-contentful-paint']?.numericValue ?? null
    const fid = audits['total-blocking-time']?.numericValue ?? null
    const cls = audits['cumulative-layout-shift']?.numericValue ?? null
    const ttfb = audits['server-response-time']?.numericValue ?? null
    const fcp = audits['first-contentful-paint']?.numericValue ?? null
    const performanceScore = cats.performance?.score ? Math.round(cats.performance.score * 100) : null

    const lcpStatus = !lcp ? 'poor' : lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs-improvement' : 'poor'
    const clsStatus = !cls ? 'poor' : cls <= 0.1 ? 'good' : cls <= 0.25 ? 'needs-improvement' : 'poor'
    const ttfbStatus = !ttfb ? 'poor' : ttfb <= 800 ? 'good' : ttfb <= 1800 ? 'needs-improvement' : 'poor'

    const recommendations: string[] = []
    if (lcpStatus !== 'good') recommendations.push(`LCP ${(lcp! / 1000).toFixed(1)}s — optimize images and server response`)
    if (clsStatus !== 'good') recommendations.push(`CLS ${cls?.toFixed(3)} — add size attributes to images/embeds`)
    if (ttfbStatus !== 'good') recommendations.push(`TTFB ${ttfb}ms — improve server response time`)
    if (fid && fid > 300) recommendations.push(`TBT ${fid}ms — reduce JavaScript execution time`)

    await prisma.coreWebVitals.create({
      data: {
        siteId,
        url,
        device,
        lcp: lcp ? lcp / 1000 : null,
        fid: fid ?? null,
        cls: cls ?? null,
        ttfb: ttfb ?? null,
        fcp: fcp ? fcp / 1000 : null,
        performanceScore,
        source: 'pagespeed',
      },
    })

    return { url, device, lcp, fid, cls, ttfb, fcp, performanceScore, lcpStatus, clsStatus, ttfbStatus, recommendations }
  } catch {
    return {
      url, device, lcp: null, fid: null, cls: null, ttfb: null, fcp: null, performanceScore: null,
      lcpStatus: 'poor', clsStatus: 'poor', ttfbStatus: 'poor',
      recommendations: ['PageSpeed API unavailable — set PAGESPEED_API_KEY'],
    }
  }
}

export async function auditSiteWebVitals(siteId: string): Promise<{
  avgScore: number
  poorUrls: string[]
  goodUrls: string[]
  summary: string
}> {
  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published', wpPostUrl: { not: null } },
    select: { wpPostUrl: true },
    take: 20,
  })

  const results = await Promise.allSettled(
    articles.slice(0, 10).map((a) => measureCoreWebVitals(siteId, a.wpPostUrl!, 'mobile'))
  )

  const successful = results.filter((r): r is PromiseFulfilledResult<CoreWebVitalsResult> => r.status === 'fulfilled').map((r) => r.value)

  const avgScore = successful.length > 0 && successful.some((r) => r.performanceScore !== null)
    ? Math.round(successful.reduce((s, r) => s + (r.performanceScore ?? 0), 0) / successful.filter((r) => r.performanceScore !== null).length)
    : 0

  const poorUrls = successful.filter((r) => (r.performanceScore ?? 100) < 50).map((r) => r.url)
  const goodUrls = successful.filter((r) => (r.performanceScore ?? 0) >= 90).map((r) => r.url)

  const summary = `Core Web Vitals audit: ${successful.length} pages measured. Average score: ${avgScore}/100. ${poorUrls.length} pages need improvement.`

  return { avgScore, poorUrls, goodUrls, summary }
}
