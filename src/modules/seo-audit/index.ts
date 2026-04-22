import axios from 'axios'
import * as cheerio from 'cheerio'
import { generate } from '@/lib/claude'

export type IssueSeverity = 'critical' | 'warning' | 'info'

export interface SeoIssue {
  type: string
  severity: IssueSeverity
  description: string
  recommendation: string
  element?: string
}

export interface SeoAuditResult {
  url: string
  score: number
  issues: SeoIssue[]
  stats: {
    title: string | null
    description: string | null
    h1Count: number
    h2Count: number
    imageCount: number
    imagesWithoutAlt: number
    wordCount: number
    internalLinks: number
    externalLinks: number
    brokenLinks: number
    hasCanonical: boolean
    hasSchema: boolean
    hasSitemap: boolean
    hasRobots: boolean
  }
}

export async function auditPage(url: string): Promise<SeoAuditResult> {
  const html = await fetchPage(url)
  const $ = cheerio.load(html)

  const issues: SeoIssue[] = []

  const title = $('title').text().trim() || null
  const description = $('meta[name="description"]').attr('content') || null
  const h1Elements = $('h1')
  const h2Elements = $('h2')
  const images = $('img')
  const imagesWithoutAlt = images.filter((_, el) => !$(el).attr('alt')).length
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const wordCount = bodyText.split(' ').length
  const internalLinks = $(`a[href^="/"], a[href*="${new URL(url).hostname}"]`).length
  const externalLinks = $('a[href^="http"]').length - internalLinks
  const hasCanonical = $('link[rel="canonical"]').length > 0
  const hasSchema = $('script[type="application/ld+json"]').length > 0

  // title checks
  if (!title) {
    issues.push({ type: 'missing_title', severity: 'critical', description: 'חסר title', recommendation: 'הוסף title עם מילת המפתח הראשית' })
  } else if (title.length < 30) {
    issues.push({ type: 'short_title', severity: 'warning', description: `Title קצר מדי (${title.length} תווים)`, recommendation: 'הארך ל-50-60 תווים', element: title })
  } else if (title.length > 65) {
    issues.push({ type: 'long_title', severity: 'warning', description: `Title ארוך מדי (${title.length} תווים)`, recommendation: 'קצר ל-50-60 תווים', element: title })
  }

  // description checks
  if (!description) {
    issues.push({ type: 'missing_description', severity: 'critical', description: 'חסר meta description', recommendation: 'הוסף תיאור ממיר CTR בין 120-155 תווים' })
  } else if (description.length > 160) {
    issues.push({ type: 'long_description', severity: 'warning', description: `Description ארוך (${description.length} תווים)`, recommendation: 'קצר ל-120-155 תווים' })
  }

  // H1 checks
  if (h1Elements.length === 0) {
    issues.push({ type: 'missing_h1', severity: 'critical', description: 'חסר H1', recommendation: 'הוסף H1 אחד עם מילת המפתח הראשית' })
  } else if (h1Elements.length > 1) {
    issues.push({ type: 'multiple_h1', severity: 'warning', description: `${h1Elements.length} כותרות H1`, recommendation: 'השאר H1 אחד בלבד' })
  }

  if (h2Elements.length === 0) {
    issues.push({ type: 'missing_h2', severity: 'warning', description: 'אין כותרות H2', recommendation: 'הוסף H2 לחלוקת תוכן ולסיגנלים סמנטיים' })
  }

  // images
  if (imagesWithoutAlt > 0) {
    issues.push({ type: 'images_no_alt', severity: 'warning', description: `${imagesWithoutAlt} תמונות ללא alt`, recommendation: 'הוסף alt text לכל תמונה עם מילת מפתח' })
  }

  // content length
  if (wordCount < 300) {
    issues.push({ type: 'thin_content', severity: 'critical', description: `תוכן דק (${wordCount} מילים)`, recommendation: 'הרחב ל-1000+ מילים עם תוכן בעל ערך' })
  } else if (wordCount < 800) {
    issues.push({ type: 'short_content', severity: 'warning', description: `תוכן קצר (${wordCount} מילים)`, recommendation: 'שקול הרחבה ל-1500+ מילים' })
  }

  // canonical
  if (!hasCanonical) {
    issues.push({ type: 'missing_canonical', severity: 'warning', description: 'חסר canonical tag', recommendation: 'הוסף <link rel="canonical"> למניעת תוכן כפול' })
  }

  // schema
  if (!hasSchema) {
    issues.push({ type: 'missing_schema', severity: 'info', description: 'אין structured data', recommendation: 'הוסף Article/FAQ Schema.org' })
  }

  // internal links
  if (internalLinks < 2) {
    issues.push({ type: 'few_internal_links', severity: 'info', description: `רק ${internalLinks} קישורים פנימיים`, recommendation: 'הוסף 3-5 קישורים פנימיים רלוונטיים' })
  }

  const score = calcScore(issues)

  const hasSitemap = await checkUrl(`${new URL(url).origin}/sitemap.xml`)
  const hasRobots = await checkUrl(`${new URL(url).origin}/robots.txt`)

  return {
    url,
    score,
    issues,
    stats: {
      title,
      description,
      h1Count: h1Elements.length,
      h2Count: h2Elements.length,
      imageCount: images.length,
      imagesWithoutAlt,
      wordCount,
      internalLinks,
      externalLinks,
      brokenLinks: 0,
      hasCanonical,
      hasSchema,
      hasSitemap,
      hasRobots,
    },
  }
}

async function fetchPage(url: string): Promise<string> {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'SolinaSEOBot/1.0' },
    timeout: 15000,
  })
  return res.data
}

async function checkUrl(url: string): Promise<boolean> {
  try {
    await axios.head(url, { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function calcScore(issues: SeoIssue[]): number {
  let score = 100
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 15
    else if (issue.severity === 'warning') score -= 7
    else score -= 2
  }
  return Math.max(0, score)
}

export async function auditWithAiRecommendations(url: string): Promise<SeoAuditResult & { aiSummary: string }> {
  const audit = await auditPage(url)

  const issuesList = audit.issues
    .map((i) => `[${i.severity.toUpperCase()}] ${i.description}: ${i.recommendation}`)
    .join('\n')

  const aiPrompt = `
אתה מומחה SEO. סכם את הממצאים הבאים בדוח מקצועי בעברית.

URL: ${url}
ציון: ${audit.score}/100
מילים: ${audit.stats.wordCount}
H1: ${audit.stats.h1Count} | H2: ${audit.stats.h2Count}
תמונות ללא alt: ${audit.stats.imagesWithoutAlt}

בעיות שנמצאו:
${issuesList}

כתוב סיכום קצר (3-4 משפטים) עם:
1. מה הבעיות הקריטיות
2. מה לתקן קודם
3. השפעה צפויה על דירוג
`

  const aiSummary = await generate(aiPrompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
  })

  return { ...audit, aiSummary }
}
