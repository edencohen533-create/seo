/**
 * CTR Engine
 *
 * מעבר מ"כותרת אחת" ל"מנוע ממיר קליקים":
 * - 5 וריאציות כותרת לכל עמוד, מגוונות ולא חוזרות
 * - ניתוח כותרות מתחרים מה-SERP
 * - Power Words: מה מעלה CTR, מה מוריד
 * - חיזוי CTR לפני פרסום (מודל תבנית)
 * - A/B testing framework — ב-WordPress עם auto-winner
 * - התאמה לפי intent, journey stage, קהל יעד
 * - שיפור מתמיד לפי GSC data
 * - Meta description מותאם CTR
 */

import { generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export interface TitleVariantData {
  title: string
  metaTitle: string
  metaDescription: string
  angle: string
  emotionalHook: string
  predictedCtr: number
  powerWords: string[]
  reasoning: string
}

export interface CtrAnalysisResult {
  articleId: string
  primaryKeyword: string
  currentTitle: string
  currentCtr: number
  variants: TitleVariantData[]
  bestVariant: TitleVariantData
  competitorTitles: string[]
  avoidWords: string[]
  powerWords: string[]
  ctriImprovementPotential: number
}

// Power words שמעלים CTR בתוכן עברי
const HIGH_CTR_PATTERNS = [
  'המדריך המלא',
  'כל מה שצריך לדעת',
  'הדרך הנכונה',
  'בלי טעויות',
  'מה שרופאים לא אומרים',
  'הסוד ש',
  'למה',
  'איך',
  'כמה',
  'מתי',
  'האמת על',
  'מדריך ל',
  'שיטה שעובדת',
  'תוצאות מהירות',
  'ביתי',
  'טבעי',
  'פשוט',
  'מהיר',
  'יעיל',
]

const LOW_CTR_PATTERNS = [
  'מידע על',
  'הכל על',
  'דברים על',
  'מאמר על',
  'עמוד על',
]

export async function generateTitleVariants(
  articleId: string,
  competitorContext?: string
): Promise<CtrAnalysisResult> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: {
      site: true,
      opportunity: true,
    },
  })

  const currentPerf = await prisma.performance.findFirst({
    where: {
      siteId: article.siteId,
      query: article.primaryKeyword ?? '',
    },
    orderBy: { date: 'desc' },
  })

  const currentCtr = currentPerf?.ctr ?? 0
  const currentPosition = currentPerf?.position ?? 0

  const prompt = `
אתה מומחה CTR ו-copywriting ברמה עולמית. ספציאליזציה: כותרות SEO שמקבלות קליקים.

**מילת מפתח:** ${article.primaryKeyword}
**כותרת נוכחית:** ${article.title ?? 'אין עדיין'}
**CTR נוכחי:** ${(currentCtr * 100).toFixed(2)}%
**מיקום:** ${currentPosition.toFixed(1)}
**כוונת חיפוש:** ${article.contentBrief ? (article.contentBrief as Record<string, unknown>).searchIntent : 'informational'}
**שלב במסע:** ${article.contentBrief ? (article.contentBrief as Record<string, unknown>).journeyStage : 'awareness'}
**קהל יעד:** ${article.contentBrief ? (article.contentBrief as Record<string, unknown>).targetAudience : 'כללי'}
**מתחרים ב-SERP:** ${competitorContext ?? 'לא זמין'}

צור 5 וריאציות כותרת מגוונות לחלוטין — כל אחת עם זווית שונה:
1. Curiosity gap (מה שאנשים לא יודעים)
2. Direct benefit (תוצאה ברורה ומהירה)
3. Fear avoidance (מה לא לעשות / טעויות)
4. Authority/trust (מדריך, מומחה, מוכח)
5. Question (שאלה שהמשתמש שואל לעצמו)

החזר JSON:
{
  "variants": [
    {
      "title": "כותרת מלאה לעמוד",
      "metaTitle": "כותרת SEO עד 60 תווים",
      "metaDescription": "תיאור 120-155 תווים שממשיך את ה-hook ומסיים ב-CTA",
      "angle": "curiosity_gap" | "direct_benefit" | "fear_avoidance" | "authority" | "question",
      "emotionalHook": "הרגש שמניע את הקליק",
      "predictedCtr": 4.2,
      "powerWords": ["מילה1", "מילה2"],
      "reasoning": "למה הכותרת הזו תעבוד — 2 משפטים"
    }
  ],
  "competitorTitles": ["כותרת מתחרה 1", "כותרת מתחרה 2"],
  "avoidWords": ["מילה לא טובה 1", "מילה לא טובה 2"],
  "powerWords": ["מילת כוח 1", "מילת כוח 2"],
  "ctriImprovementPotential": 150
}

כללים חשובים:
- predictedCtr בין 2.0-8.0 (ריאלי לפי מיקום ${currentPosition.toFixed(0)})
- כותרת: 50-70 תווים בעברית
- meta description חייב לסיים ב-CTA: "קרא עכשיו", "גלה כיצד", "המדריך המלא"
- avoidWords: מה להוריד מהכותרת הנוכחית
- ctriImprovementPotential: % שיפור CTR צפוי לעומת הנוכחי
`

  const result = await generateJson<{
    variants: TitleVariantData[]
    competitorTitles: string[]
    avoidWords: string[]
    powerWords: string[]
    ctriImprovementPotential: number
  }>(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 3000,
  })

  // Save variants to DB
  await prisma.titleVariant.deleteMany({ where: { articleId, isWinner: false } })

  await prisma.titleVariant.createMany({
    data: result.variants.map((v, i) => ({
      articleId,
      title: v.title,
      metaTitle: v.metaTitle,
      predictedCtr: v.predictedCtr,
      isActive: i === 0,
      reasoning: `${v.angle}: ${v.reasoning}`,
    })),
  })

  const bestVariant = result.variants.reduce(
    (best, v) => (v.predictedCtr > best.predictedCtr ? v : best),
    result.variants[0]
  )

  return {
    articleId,
    primaryKeyword: article.primaryKeyword ?? '',
    currentTitle: article.title ?? '',
    currentCtr,
    variants: result.variants,
    bestVariant,
    competitorTitles: result.competitorTitles,
    avoidWords: result.avoidWords,
    powerWords: result.powerWords,
    ctriImprovementPotential: result.ctriImprovementPotential,
  }
}

export async function applyWinningTitle(
  articleId: string,
  variantId: string
): Promise<void> {
  const variant = await prisma.titleVariant.findUniqueOrThrow({
    where: { id: variantId },
  })

  await prisma.$transaction([
    prisma.titleVariant.updateMany({
      where: { articleId },
      data: { isActive: false, isWinner: false },
    }),
    prisma.titleVariant.update({
      where: { id: variantId },
      data: { isActive: true, isWinner: true },
    }),
    prisma.article.update({
      where: { id: articleId },
      data: {
        title: variant.title,
        metaTitle: variant.metaTitle,
      },
    }),
  ])
}

export async function updateVariantPerformance(
  articleId: string,
  query: string,
  siteId: string
): Promise<void> {
  const recent = await prisma.performance.findFirst({
    where: { siteId, query },
    orderBy: { date: 'desc' },
  })

  if (!recent) return

  const activeVariant = await prisma.titleVariant.findFirst({
    where: { articleId, isActive: true },
  })

  if (!activeVariant) return

  await prisma.titleVariant.update({
    where: { id: activeVariant.id },
    data: {
      actualCtr: recent.ctr,
      impressions: recent.impressions,
      clicks: recent.clicks,
    },
  })

  // Auto-select winner: if actual CTR > predicted by >20%, mark as winner
  const allVariants = await prisma.titleVariant.findMany({
    where: { articleId },
    orderBy: { actualCtr: 'desc' },
  })

  const topPerformer = allVariants[0]
  if (topPerformer && topPerformer.actualCtr && topPerformer.impressions > 200) {
    await prisma.titleVariant.update({
      where: { id: topPerformer.id },
      data: { isWinner: true, isActive: true },
    })
  }
}

export function predictCtr(
  position: number,
  titleLength: number,
  hasPowerWord: boolean,
  intent: string,
  hasNumber: boolean
): number {
  // Base CTR by position (industry average)
  const baseCtrByPosition: Record<number, number> = {
    1: 28.5, 2: 15.7, 3: 11.0, 4: 8.0, 5: 7.2,
    6: 5.1, 7: 4.0, 8: 3.2, 9: 2.8, 10: 2.5,
  }
  const pos = Math.min(Math.max(Math.round(position), 1), 10)
  let ctr = baseCtrByPosition[pos] ?? 2.0

  // Modifiers
  if (hasPowerWord) ctr *= 1.15
  if (hasNumber) ctr *= 1.12
  if (titleLength >= 50 && titleLength <= 60) ctr *= 1.08
  if (titleLength > 65) ctr *= 0.92
  if (intent === 'transactional') ctr *= 1.2
  if (intent === 'navigational') ctr *= 0.85

  return Math.min(parseFloat(ctr.toFixed(2)), 35)
}
