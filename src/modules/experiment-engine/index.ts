/**
 * Experiment Engine — A/B Testing Framework for SEO
 *
 * מעבר מ"מנחשים מה עובד" ל"מודדים מה עובד":
 * - A/B testing לכותרות, meta descriptions, מבנה תוכן
 * - חישוב statistical significance אמיתי (chi-square)
 * - auto-winner selection לפי GSC data
 * - בדיקות מבנה תוכן (עם/בלי FAQ, אורך מאמר)
 * - למידה אוטומטית — Pattern recognition מניסויים
 * - Dashboard ניסויים
 */

import { prisma } from '@/lib/prisma'
import { generateJson } from '@/lib/claude'
import { fetchSearchAnalytics } from '@/lib/gsc'
import { format, subDays } from 'date-fns'

export type ExperimentType =
  | 'title'
  | 'meta_description'
  | 'content_structure'
  | 'content_length'
  | 'faq'
  | 'intro'
  | 'cta'
  | 'image_position'

export interface ExperimentVariant {
  id: 'A' | 'B'
  description: string
  content: Record<string, unknown>
  impressions: number
  clicks: number
  ctr: number
  avgPosition: number
}

export interface ExperimentResult {
  experimentId: string
  name: string
  type: ExperimentType
  status: 'running' | 'completed' | 'inconclusive'
  variantA: ExperimentVariant
  variantB: ExperimentVariant
  winner: 'A' | 'B' | 'inconclusive' | null
  significance: number
  liftPercent: number
  daysRunning: number
  recommendation: string
  insights: string[]
}

export interface ExperimentInsight {
  pattern: string
  confidence: number
  applies_to: string
  example: string
}

// Chi-square test for CTR significance
function chiSquareTest(
  clicksA: number,
  impressionsA: number,
  clicksB: number,
  impressionsB: number
): number {
  if (impressionsA < 100 || impressionsB < 100) return 0

  const totalClicks = clicksA + clicksB
  const totalImpressions = impressionsA + impressionsB
  const totalCtr = totalClicks / totalImpressions

  const expectedA = impressionsA * totalCtr
  const expectedB = impressionsB * totalCtr

  if (expectedA === 0 || expectedB === 0) return 0

  const chi2 =
    Math.pow(clicksA - expectedA, 2) / expectedA +
    Math.pow(totalImpressions - impressionsA - (totalClicks - clicksA) - (totalImpressions - impressionsB), 2) / expectedB

  // Convert chi2 to p-value approximation (1 degree of freedom)
  // p < 0.05 → 95% significance → return > 0.95
  if (chi2 >= 10.83) return 0.999
  if (chi2 >= 6.63) return 0.99
  if (chi2 >= 3.84) return 0.95
  if (chi2 >= 2.71) return 0.90
  return chi2 / 10
}

export async function createExperiment(
  siteId: string,
  articleId: string,
  type: ExperimentType,
  hypothesis: string,
  variantAContent: Record<string, unknown>,
  variantBContent: Record<string, unknown>
): Promise<string> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    select: { title: true, primaryKeyword: true },
  })

  const experiment = await prisma.experiment.create({
    data: {
      siteId,
      articleId,
      type,
      name: `${type} test: "${article.primaryKeyword}"`,
      hypothesis,
      variantA: variantAContent as object,
      variantB: variantBContent as object,
      metric: 'ctr',
      status: 'running',
    },
  })

  return experiment.id
}

export async function measureExperiment(experimentId: string): Promise<ExperimentResult> {
  const experiment = await prisma.experiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: {
      article: { select: { primaryKeyword: true, wpPostUrl: true } },
      site: true,
    },
  })

  if (!experiment.article) throw new Error('Experiment has no article')

  const daysRunning = Math.floor(
    (Date.now() - experiment.startedAt.getTime()) / 86400000
  )

  // Pull GSC data for the experiment period
  const endDate = format(new Date(), 'yyyy-MM-dd')
  const midDate = format(experiment.startedAt, 'yyyy-MM-dd')
  const startDate = format(
    new Date(experiment.startedAt.getTime() - daysRunning * 86400000),
    'yyyy-MM-dd'
  )

  const [beforeData, afterData] = await Promise.all([
    fetchSearchAnalytics(experiment.siteId, experiment.site.gscSiteUrl, {
      startDate,
      endDate: midDate,
      dimensions: ['query', 'page'],
    }),
    fetchSearchAnalytics(experiment.siteId, experiment.site.gscSiteUrl, {
      startDate: midDate,
      endDate,
      dimensions: ['query', 'page'],
    }),
  ])

  const keyword = experiment.article.primaryKeyword ?? ''
  const filterRows = (rows: typeof beforeData) =>
    rows.filter((r) => r.query === keyword || r.page.includes(experiment.article!.wpPostUrl ?? ''))

  const beforeRows = filterRows(beforeData)
  const afterRows = filterRows(afterData)

  const sumMetrics = (rows: typeof beforeData) => ({
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    ctr: rows.length > 0 ? rows.reduce((s, r) => s + r.ctr, 0) / rows.length : 0,
    avgPosition: rows.length > 0 ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0,
  })

  const variantA = { id: 'A' as const, description: 'לפני', content: experiment.variantA as Record<string, unknown>, ...sumMetrics(beforeRows) }
  const variantB = { id: 'B' as const, description: 'אחרי', content: experiment.variantB as Record<string, unknown>, ...sumMetrics(afterRows) }

  const significance = chiSquareTest(
    variantA.clicks, variantA.impressions,
    variantB.clicks, variantB.impressions
  )

  const liftPercent = variantA.ctr > 0
    ? ((variantB.ctr - variantA.ctr) / variantA.ctr) * 100
    : 0

  let winner: 'A' | 'B' | 'inconclusive' | null = null
  let status: 'running' | 'completed' | 'inconclusive' = 'running'

  if (daysRunning >= 14 && (variantA.impressions + variantB.impressions) >= 200) {
    if (significance >= 0.95) {
      winner = variantB.ctr > variantA.ctr ? 'B' : 'A'
      status = 'completed'
    } else if (daysRunning >= 28) {
      status = 'inconclusive'
      winner = 'inconclusive'
    }
  }

  if (winner && winner !== 'inconclusive') {
    await prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status,
        winnerId: winner,
        significance,
        results: JSON.parse(JSON.stringify({ variantA, variantB, liftPercent })),
        endedAt: new Date(),
      },
    })
  }

  const insights = generateInsights(variantA, variantB, experiment.type as ExperimentType, liftPercent)

  return {
    experimentId,
    name: experiment.name,
    type: experiment.type as ExperimentType,
    status,
    variantA,
    variantB,
    winner,
    significance,
    liftPercent,
    daysRunning,
    recommendation: buildRecommendation(winner, liftPercent, significance, experiment.type as ExperimentType),
    insights,
  }
}

function generateInsights(
  a: ExperimentVariant,
  b: ExperimentVariant,
  type: ExperimentType,
  lift: number
): string[] {
  const insights: string[] = []

  if (Math.abs(lift) > 20) {
    insights.push(`שינוי ב-${type} הוביל לשינוי של ${lift.toFixed(1)}% ב-CTR`)
  }
  if (b.avgPosition < a.avgPosition - 0.5) {
    insights.push(`הגרסה החדשה שיפרה מיקום ב-${(a.avgPosition - b.avgPosition).toFixed(1)} מקומות`)
  }
  if (b.ctr > a.ctr && b.impressions > a.impressions) {
    insights.push('שיפור CTR + עלייה בחשיפות — סיגנל חיובי כפול')
  }
  if (a.impressions < 50 || b.impressions < 50) {
    insights.push('נדרש נתונים נוספים — המשך הניסוי')
  }

  return insights
}

function buildRecommendation(
  winner: 'A' | 'B' | 'inconclusive' | null,
  lift: number,
  significance: number,
  type: ExperimentType
): string {
  if (!winner || winner === null) {
    return 'הניסוי עדיין רץ — המתן ל-14+ ימים ו-200+ חשיפות'
  }
  if (winner === 'inconclusive') {
    return 'אין הבדל מובהק — השאר את הגרסה הנוכחית'
  }
  if (winner === 'B') {
    return `✅ גרסה B מנצחת — שיפור ${lift.toFixed(1)}% ב-CTR (מובהקות ${(significance * 100).toFixed(0)}%). יישם עכשיו.`
  }
  return `גרסה A טובה יותר — ירידה ${Math.abs(lift).toFixed(1)}%. השאר את הגרסה המקורית.`
}

export async function getSiteExperiments(siteId: string) {
  return prisma.experiment.findMany({
    where: { siteId },
    include: {
      article: { select: { title: true, primaryKeyword: true, wpPostUrl: true } },
    },
    orderBy: { startedAt: 'desc' },
  })
}

export async function learnFromExperiments(siteId: string): Promise<ExperimentInsight[]> {
  const completed = await prisma.experiment.findMany({
    where: { siteId, status: 'completed', winnerId: 'B' },
    include: { article: { select: { primaryKeyword: true } } },
  })

  if (completed.length < 3) return []

  const prompt = `
אתה מומחה A/B testing ו-SEO. נתח את תוצאות הניסויים ומצא patterns.

**ניסויים שהגרסה B ניצחה:**
${completed.map((e) => `- Type: ${e.type} | Keyword: "${e.article?.primaryKeyword}" | Significance: ${((e.significance ?? 0) * 100).toFixed(0)}%`).join('\n')}

זהה patterns ותן insights שיעזרו לאופטימיזציה עתידית.

החזר JSON:
[
  {
    "pattern": "pattern שזוהה",
    "confidence": 0.0-1.0,
    "applies_to": "לאיזה סוג תוכן רלוונטי",
    "example": "דוגמה ספציפית לישום"
  }
]
`

  return generateJson<ExperimentInsight[]>(prompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1000,
  })
}
