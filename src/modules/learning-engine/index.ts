/**
 * Learning Engine — Site-Specific Success Pattern Recognition
 *
 * מנתח מאמרים שהצליחו בפועל ומחלץ patterns ייחודיים לאתר הזה:
 * - אורך תוכן אופטימלי לנישה
 * - מבנה כותרת שמייצר CTR גבוה
 * - זוויות רגשיות שעובדות
 * - כמות H2 אופטימלית
 * - האם FAQ משפר ביצועים
 * - ניתוח מה מבדיל top vs bottom performers
 */

import { prisma } from '@/lib/prisma'
import { generateJson } from '@/lib/claude'
import { subDays } from 'date-fns'

export interface SuccessPattern {
  type: string
  key: string
  value: string
  confidence: number
  supportingCount: number
  avgCtrLift: number
  avgPositionGain: number
  examples: string[]
  recommendation: string
}

export interface SiteModel {
  siteId: string
  patterns: SuccessPattern[]
  topPerformerProfile: ArticleProfile
  underperformerProfile: ArticleProfile
  keyInsights: string[]
  lastUpdated: string
}

export interface ArticleProfile {
  avgWordCount: number
  avgH2Count: number
  hasFaqRate: number
  titleLengthRange: [number, number]
  commonPhrases: string[]
  avgCtr: number
  avgPosition: number
}

export async function buildSiteModel(siteId: string): Promise<SiteModel> {
  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published', content: { not: null } },
    select: {
      id: true, title: true, content: true, wordCount: true,
      primaryKeyword: true, wpPostUrl: true, contentBrief: true,
    },
  })

  if (articles.length < 5) {
    return {
      siteId, patterns: [], keyInsights: ['Need at least 5 published articles to build a model.'],
      topPerformerProfile: defaultProfile(), underperformerProfile: defaultProfile(),
      lastUpdated: new Date().toISOString(),
    }
  }

  // Fetch 28-day performance for each article
  const since = subDays(new Date(), 28)
  const snapshots = await prisma.performanceSnapshot.findMany({
    where: { siteId, snapshotDate: { gte: since }, period: 'daily' },
  })

  const urlPerf = new Map<string, { ctr: number; position: number; clicks: number; impressions: number; count: number }>()
  for (const s of snapshots) {
    const ex = urlPerf.get(s.url) ?? { ctr: 0, position: 0, clicks: 0, impressions: 0, count: 0 }
    urlPerf.set(s.url, {
      ctr: ex.ctr + s.ctr,
      position: ex.position + s.position,
      clicks: ex.clicks + s.clicks,
      impressions: ex.impressions + s.impressions,
      count: ex.count + 1,
    })
  }

  // Enrich articles with performance
  const enriched = articles.map((art) => {
    const perf = urlPerf.get(art.wpPostUrl ?? '')
    const h2Count = (art.content?.match(/<h2/gi) ?? []).length
    const hasFaq = art.content?.toLowerCase().includes('שאלות נפוצות') ?? false
    return {
      ...art,
      avgCtr: perf && perf.count > 0 ? (perf.ctr / perf.count) * 100 : 0,
      avgPosition: perf && perf.count > 0 ? perf.position / perf.count : 99,
      totalClicks: perf?.clicks ?? 0,
      h2Count,
      hasFaq,
      titleLength: (art.title ?? '').length,
    }
  }).filter((a) => a.totalClicks > 0 || a.avgPosition < 50)

  if (enriched.length < 3) {
    return {
      siteId, patterns: [], keyInsights: ['Not enough performance data yet.'],
      topPerformerProfile: defaultProfile(), underperformerProfile: defaultProfile(),
      lastUpdated: new Date().toISOString(),
    }
  }

  // Sort by composite score
  const sorted = [...enriched].sort((a, b) => {
    const scoreA = (a.avgCtr * 0.5) + ((50 - Math.min(a.avgPosition, 50)) * 1)
    const scoreB = (b.avgCtr * 0.5) + ((50 - Math.min(b.avgPosition, 50)) * 1)
    return scoreB - scoreA
  })

  const topCount = Math.max(2, Math.floor(sorted.length * 0.3))
  const topPerformers = sorted.slice(0, topCount)
  const bottomPerformers = sorted.slice(-topCount)

  const topProfile = buildProfile(topPerformers)
  const bottomProfile = buildProfile(bottomPerformers)

  // Ask Claude to extract patterns
  const prompt = `
אתה מנתח SEO. עליך לזהות patterns ייחודיים לאתר הזה שמבדילים מאמרים מצליחים מכאלה שלא.

**Top Performers (CTR גבוה, מיקום טוב):**
${topPerformers.map((a) => `- "${a.title}" | ${a.wordCount} מילים | ${a.h2Count} H2 | FAQ: ${a.hasFaq} | CTR: ${a.avgCtr.toFixed(2)}% | מיקום: ${a.avgPosition.toFixed(1)}`).join('\n')}

**Under Performers:**
${bottomPerformers.map((a) => `- "${a.title}" | ${a.wordCount} מילים | ${a.h2Count} H2 | FAQ: ${a.hasFaq} | CTR: ${a.avgCtr.toFixed(2)}% | מיקום: ${a.avgPosition.toFixed(1)}`).join('\n')}

**סטטיסטיקות השוואה:**
- Top: avg ${topProfile.avgWordCount} מילים, ${topProfile.avgH2Count} H2, ${(topProfile.hasFaqRate * 100).toFixed(0)}% יש FAQ
- Bottom: avg ${bottomProfile.avgWordCount} מילים, ${bottomProfile.avgH2Count} H2, ${(bottomProfile.hasFaqRate * 100).toFixed(0)}% יש FAQ

זהה 5-10 patterns ספציפיים לאתר הזה שמנבאים הצלחה.

החזר JSON:
[
  {
    "type": "word_count" | "h2_count" | "has_faq" | "title_pattern" | "content_depth" | "keyword_usage",
    "key": "שם ה-pattern",
    "value": "הערך המנצח (e.g. '1500-2500', '6-8 H2', 'כן')",
    "confidence": 0.0-1.0,
    "avgCtrLift": 0.5,
    "avgPositionGain": 2.3,
    "examples": ["כותרת מאמר 1"],
    "recommendation": "המלצה ספציפית לאתר הזה"
  }
]
`

  let patterns: SuccessPattern[] = []
  try {
    const raw = await generateJson<Omit<SuccessPattern, 'supportingCount'>[]>(prompt, {
      model: 'claude-sonnet-4-6',
      maxTokens: 3000,
    })
    patterns = raw.map((p) => ({ ...p, supportingCount: topPerformers.length }))
  } catch {
    patterns = []
  }

  // Persist patterns
  for (const pattern of patterns) {
    await prisma.siteSuccessPattern.upsert({
      where: { siteId_patternType_patternKey: { siteId, patternType: pattern.type, patternKey: pattern.key } },
      create: {
        siteId,
        patternType: pattern.type,
        patternKey: pattern.key,
        patternValue: pattern.value,
        confidence: pattern.confidence,
        supportingCount: pattern.supportingCount,
        avgCtrLift: pattern.avgCtrLift,
        avgPositionGain: pattern.avgPositionGain,
        examples: pattern.examples as string[],
      },
      update: {
        patternValue: pattern.value,
        confidence: pattern.confidence,
        avgCtrLift: pattern.avgCtrLift,
        avgPositionGain: pattern.avgPositionGain,
        examples: pattern.examples as string[],
        lastUpdated: new Date(),
      },
    })
  }

  const keyInsights = patterns
    .filter((p) => p.confidence > 0.6)
    .sort((a, b) => b.avgCtrLift - a.avgCtrLift)
    .slice(0, 5)
    .map((p) => p.recommendation)

  return {
    siteId,
    patterns,
    topPerformerProfile: topProfile,
    underperformerProfile: bottomProfile,
    keyInsights,
    lastUpdated: new Date().toISOString(),
  }
}

function buildProfile(articles: {
  wordCount: number | null; h2Count: number; hasFaq: boolean; titleLength: number; avgCtr: number; avgPosition: number
}[]): ArticleProfile {
  const n = articles.length
  if (n === 0) return defaultProfile()

  return {
    avgWordCount: Math.round(articles.reduce((s, a) => s + (a.wordCount ?? 0), 0) / n),
    avgH2Count: Math.round(articles.reduce((s, a) => s + a.h2Count, 0) / n * 10) / 10,
    hasFaqRate: articles.filter((a) => a.hasFaq).length / n,
    titleLengthRange: [
      Math.min(...articles.map((a) => a.titleLength)),
      Math.max(...articles.map((a) => a.titleLength)),
    ],
    commonPhrases: [],
    avgCtr: articles.reduce((s, a) => s + a.avgCtr, 0) / n,
    avgPosition: articles.reduce((s, a) => s + a.avgPosition, 0) / n,
  }
}

function defaultProfile(): ArticleProfile {
  return {
    avgWordCount: 0, avgH2Count: 0, hasFaqRate: 0,
    titleLengthRange: [0, 0], commonPhrases: [], avgCtr: 0, avgPosition: 50,
  }
}

export async function getSiteModel(siteId: string): Promise<SiteModel | null> {
  const patterns = await prisma.siteSuccessPattern.findMany({
    where: { siteId },
    orderBy: { confidence: 'desc' },
  })

  if (patterns.length === 0) return null

  return {
    siteId,
    patterns: patterns.map((p) => ({
      type: p.patternType,
      key: p.patternKey,
      value: p.patternValue,
      confidence: p.confidence,
      supportingCount: p.supportingCount,
      avgCtrLift: p.avgCtrLift,
      avgPositionGain: p.avgPositionGain,
      examples: p.examples as string[],
      recommendation: `${p.patternKey}: ${p.patternValue}`,
    })),
    topPerformerProfile: defaultProfile(),
    underperformerProfile: defaultProfile(),
    keyInsights: patterns.slice(0, 5).map((p) => `${p.patternKey}: ${p.patternValue}`),
    lastUpdated: patterns[0]?.lastUpdated.toISOString() ?? '',
  }
}

export async function applyModelToBrief(
  siteId: string,
  brief: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const patterns = await prisma.siteSuccessPattern.findMany({
    where: { siteId, confidence: { gte: 0.6 } },
    orderBy: { avgCtrLift: 'desc' },
    take: 10,
  })

  if (patterns.length === 0) return brief

  const adjustments: string[] = []

  for (const pattern of patterns) {
    if (pattern.patternType === 'word_count') {
      const range = pattern.patternValue.split('-').map(Number)
      if (range.length === 2) {
        brief.targetWordCount = Math.round((range[0] + range[1]) / 2)
        adjustments.push(`Target word count adjusted to ${brief.targetWordCount} based on site data`)
      }
    }
    if (pattern.patternType === 'has_faq' && pattern.patternValue === 'כן') {
      brief.includeFaq = true
      adjustments.push('FAQ included — site data shows it improves performance')
    }
    if (pattern.patternType === 'h2_count') {
      const n = parseInt(pattern.patternValue)
      if (!isNaN(n)) {
        brief.targetH2Count = n
        adjustments.push(`Target ${n} H2 sections`)
      }
    }
  }

  return { ...brief, siteModelAdjustments: adjustments }
}
