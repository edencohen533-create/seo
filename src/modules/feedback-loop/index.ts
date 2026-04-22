import { prisma } from '@/lib/prisma'
import { fetchSearchAnalytics } from '@/lib/gsc'
import { generate } from '@/lib/claude'
import { format, subDays } from 'date-fns'

export type RefreshAction =
  | 'rewrite_title'
  | 'expand_content'
  | 'refresh_content'
  | 'add_faq'
  | 'add_internal_links'
  | 'no_action'

export interface RefreshRecommendation {
  articleId: string
  pageId: string
  url: string
  title: string | null
  action: RefreshAction
  reason: string
  urgency: 'high' | 'medium' | 'low'
  currentPosition: number
  currentCtr: number
  impressions: number
}

export async function runFeedbackLoop(siteId: string): Promise<RefreshRecommendation[]> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } })

  const endDate = format(new Date(), 'yyyy-MM-dd')
  const startDate = format(subDays(new Date(), 28), 'yyyy-MM-dd')

  const recentData = await fetchSearchAnalytics(siteId, site.gscSiteUrl, {
    startDate,
    endDate,
    dimensions: ['page', 'query'],
    rowLimit: 5000,
  })

  const prevStart = format(subDays(new Date(), 56), 'yyyy-MM-dd')
  const prevEnd = format(subDays(new Date(), 29), 'yyyy-MM-dd')

  const prevData = await fetchSearchAnalytics(siteId, site.gscSiteUrl, {
    startDate: prevStart,
    endDate: prevEnd,
    dimensions: ['page', 'query'],
    rowLimit: 5000,
  })

  const pageMetrics = aggregateByPage(recentData)
  const prevMetrics = aggregateByPage(prevData)

  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published', wpPostUrl: { not: null } },
    include: { page: true },
  })

  const recommendations: RefreshRecommendation[] = []

  for (const article of articles) {
    const pageUrl = article.wpPostUrl ?? article.page?.url
    if (!pageUrl) continue

    const current = pageMetrics.get(pageUrl)
    if (!current || current.impressions < 20) continue

    const prev = prevMetrics.get(pageUrl)
    const action = determineAction(current, prev)

    if (action !== 'no_action') {
      recommendations.push({
        articleId: article.id,
        pageId: article.pageId ?? '',
        url: pageUrl,
        title: article.title,
        action,
        reason: buildReason(action, current, prev),
        urgency: determineUrgency(action, current),
        currentPosition: current.avgPosition,
        currentCtr: current.avgCtr,
        impressions: current.impressions,
      })
    }
  }

  return recommendations.sort((a, b) => {
    const urgencyScore = { high: 3, medium: 2, low: 1 }
    return urgencyScore[b.urgency] - urgencyScore[a.urgency]
  })
}

interface PageMetric {
  url: string
  impressions: number
  clicks: number
  avgCtr: number
  avgPosition: number
}

function aggregateByPage(rows: { page: string; impressions: number; clicks: number; ctr: number; position: number }[]): Map<string, PageMetric> {
  const map = new Map<string, PageMetric>()

  for (const row of rows) {
    const existing = map.get(row.page)
    if (existing) {
      existing.impressions += row.impressions
      existing.clicks += row.clicks
      existing.avgCtr = existing.clicks / existing.impressions
    } else {
      map.set(row.page, {
        url: row.page,
        impressions: row.impressions,
        clicks: row.clicks,
        avgCtr: row.ctr,
        avgPosition: row.position,
      })
    }
  }

  return map
}

function determineAction(current: PageMetric, prev: PageMetric | undefined): RefreshAction {
  const positionDrop = prev ? current.avgPosition - prev.avgPosition : 0

  if (current.avgCtr < 0.02 && current.impressions > 200) {
    return 'rewrite_title'
  }

  if (current.avgPosition >= 5 && current.avgPosition <= 10) {
    return 'expand_content'
  }

  if (positionDrop > 3 && prev) {
    return 'refresh_content'
  }

  if (current.avgPosition < 15 && current.avgCtr < 0.03) {
    return 'add_faq'
  }

  return 'no_action'
}

function buildReason(action: RefreshAction, current: PageMetric, prev: PageMetric | undefined): string {
  const reasons: Record<RefreshAction, string> = {
    rewrite_title: `CTR נמוך (${(current.avgCtr * 100).toFixed(1)}%) למרות ${current.impressions} חשיפות — שכתוב כותרת ותיאור`,
    expand_content: `מיקום ${current.avgPosition.toFixed(1)} — הרחבת תוכן יכולה לדחוף לעמוד ראשון`,
    refresh_content: `ירידה של ${prev ? (current.avgPosition - prev.avgPosition).toFixed(1) : 0} מקומות — תוכן צריך רענון`,
    add_faq: `שיפור CTR ורלוונטיות עם FAQ ו-schema`,
    add_internal_links: `הוסף קישורים פנימיים לשיפור PageRank`,
    no_action: `אין פעולה נדרשת`,
  }
  return reasons[action]
}

function determineUrgency(action: RefreshAction, current: PageMetric): 'high' | 'medium' | 'low' {
  if (action === 'refresh_content' || (action === 'rewrite_title' && current.impressions > 500)) {
    return 'high'
  }
  if (action === 'expand_content' || action === 'rewrite_title') {
    return 'medium'
  }
  return 'low'
}

export async function generateRefreshPlan(recommendation: RefreshRecommendation, currentContent: string): Promise<string> {
  const prompt = `
אתה מומחה SEO. בנה תכנית רענון קצרה לעמוד זה.

URL: ${recommendation.url}
כותרת: ${recommendation.title}
פעולה נדרשת: ${recommendation.action}
סיבה: ${recommendation.reason}
מיקום נוכחי: ${recommendation.currentPosition.toFixed(1)}
CTR: ${(recommendation.currentCtr * 100).toFixed(1)}%
חשיפות: ${recommendation.impressions}

תוכן נוכחי (300 מילים ראשונות):
${currentContent.replace(/<[^>]+>/g, '').substring(0, 300)}...

תן המלצות ספציפיות ב-5 נקודות קצרות לפעולה מיידית.
`

  return generate(prompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 600,
  })
}
