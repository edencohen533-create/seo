/**
 * Topical Authority Engine
 *
 * מעבר מ"מאמרים בודדים" ל"שליטה מלאה בנישה":
 * - בניית Topic Map מלא: pillars + clusters + long-tail
 * - סדר כתיבה אסטרטגי (למי כותבים קודם ולמה)
 * - גרף קישורים פנימיים מתוכנן מראש
 * - מדידת "כמה % מהנישה מכוסה"
 * - זיהוי חורים: קיימים vs. חסרים
 * - התאמה בין מאמרים קיימים לחדשים
 * - חישוב Authority Score לפי נושא
 */

import { generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export interface TopicPillar {
  id: string
  keyword: string
  h1: string
  description: string
  searchVolumeTier: 'high' | 'medium' | 'low'
  competitionTier: 'high' | 'medium' | 'low'
  clusters: TopicCluster[]
}

export interface TopicCluster {
  id: string
  pillarId: string
  keyword: string
  type: 'supporting' | 'long-tail' | 'faq' | 'comparison' | 'local'
  searchVolumeTier: 'high' | 'medium' | 'low'
  writingPriority: number
  existingArticleId?: string
  status: 'planned' | 'in_progress' | 'published'
  internalLinkTarget: string
}

export interface TopicMapResult {
  siteId: string
  niche: string
  pillars: TopicPillar[]
  totalArticlesNeeded: number
  totalArticlesExisting: number
  coverageScore: number
  missingTopics: string[]
  writingOrder: WritingOrderItem[]
  authorityByPillar: AuthorityScore[]
}

export interface WritingOrderItem {
  step: number
  keyword: string
  type: 'pillar' | 'cluster'
  pillarId: string
  reason: string
  estimatedImpact: 'high' | 'medium' | 'low'
}

export interface AuthorityScore {
  pillar: string
  score: number
  articlesPublished: number
  articlesNeeded: number
  coverageGap: number
}

export async function buildTopicMap(siteId: string): Promise<TopicMapResult> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } })

  const existingArticles = await prisma.article.findMany({
    where: { siteId, status: 'published' },
    select: { id: true, primaryKeyword: true, title: true, secondaryKeywords: true },
  })

  const existingKeywords = existingArticles
    .map((a) => a.primaryKeyword ?? '')
    .filter(Boolean)
    .join(', ')

  const prompt = `
אתה ארכיטקט SEO ברמה עולמית. בנה מפת נושאים מלאה לנישה הבאה.

**אתר:** ${site.name}
**נישה:** ${site.niche ?? 'כללי'}
**טון המותג:** ${site.brandTone ?? 'מקצועי ואנושי'}
**מאמרים קיימים (${existingArticles.length}):** ${existingKeywords || 'אין עדיין'}

המטרה: לבנות Topical Authority מלא — שגוגל יזהה את האתר כסמכות בתחום.

עקרונות:
1. Pillar pages: 3-5 נושאים ראשיים רחבים
2. כל pillar: 8-15 cluster articles
3. סה"כ: 40-60 מאמרים לכיסוי מלא
4. סדר כתיבה: מ-pillar ל-cluster, מהגבוה לנמוך בחיפושים
5. Long-tail: שאלות ספציפיות, השוואות, מדריכים

החזר JSON:
{
  "pillars": [
    {
      "id": "pillar-1",
      "keyword": "מילת מפתח ראשית של ה-pillar",
      "h1": "כותרת H1 מוצעת",
      "description": "מה הפילר מכסה ולמה הוא קריטי לסמכות",
      "searchVolumeTier": "high" | "medium" | "low",
      "competitionTier": "high" | "medium" | "low",
      "clusters": [
        {
          "id": "cluster-1-1",
          "pillarId": "pillar-1",
          "keyword": "מילת מפתח ספציפית",
          "type": "supporting" | "long-tail" | "faq" | "comparison" | "local",
          "searchVolumeTier": "high" | "medium" | "low",
          "writingPriority": 1,
          "status": "planned",
          "internalLinkTarget": "pillar-1"
        }
      ]
    }
  ],
  "totalArticlesNeeded": number,
  "missingTopics": ["נושא חסר 1", "נושא חסר 2"],
  "writingOrder": [
    {
      "step": 1,
      "keyword": "מה לכתוב ראשון",
      "type": "pillar" | "cluster",
      "pillarId": "pillar-1",
      "reason": "למה קודם לכתוב את זה",
      "estimatedImpact": "high"
    }
  ],
  "authorityByPillar": [
    {
      "pillar": "שם הפילר",
      "score": 0,
      "articlesPublished": 0,
      "articlesNeeded": 12,
      "coverageGap": 100
    }
  ]
}

כללים:
- פילר: מכסה נושא רחב, 1500-3000 מילים, יונח בשיאות
- cluster supporting: מכסה facet ספציפי, 1000-1800 מילים
- cluster long-tail: שאלות, 600-1200 מילים
- cluster faq: Q&A, 800-1500 מילים
- cluster comparison: X vs Y, 1200-2000 מילים
- writingPriority 1 = הכי דחוף
- כתיבה: קודם פילרים, אחר כך clusters לפי priority
`

  const result = await generateJson<{
    pillars: TopicPillar[]
    totalArticlesNeeded: number
    missingTopics: string[]
    writingOrder: WritingOrderItem[]
    authorityByPillar: AuthorityScore[]
  }>(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 6000,
  })

  // Match existing articles to clusters
  const allClusters = result.pillars.flatMap((p) => p.clusters)
  for (const article of existingArticles) {
    const kw = article.primaryKeyword?.toLowerCase() ?? ''
    const match = allClusters.find(
      (c) =>
        c.keyword.toLowerCase().includes(kw) ||
        kw.includes(c.keyword.toLowerCase())
    )
    if (match) {
      match.existingArticleId = article.id
      match.status = 'published'
    }
  }

  const totalExisting = allClusters.filter((c) => c.status === 'published').length

  const coverageScore = result.totalArticlesNeeded > 0
    ? Math.round((totalExisting / result.totalArticlesNeeded) * 100)
    : 0

  // Persist to DB
  const topicMap = await prisma.topicMap.upsert({
    where: { siteId },
    create: {
      siteId,
      niche: site.niche ?? 'כללי',
      pillars: result.pillars as object,
      clusters: allClusters as object,
      coverageScore,
      totalArticles: result.totalArticlesNeeded,
      missingTopics: result.missingTopics as object,
      writingOrder: result.writingOrder as object,
    },
    update: {
      pillars: result.pillars as object,
      clusters: allClusters as object,
      coverageScore,
      totalArticles: result.totalArticlesNeeded,
      missingTopics: result.missingTopics as object,
      writingOrder: result.writingOrder as object,
    },
  })

  // Persist topic articles
  await prisma.topicArticle.deleteMany({ where: { topicMapId: topicMap.id } })

  const topicArticles = allClusters.map((c, i) => ({
    topicMapId: topicMap.id,
    articleId: c.existingArticleId ?? null,
    keyword: c.keyword,
    type: c.type,
    pillarId: c.pillarId,
    cluster: c.pillarId,
    status: c.status,
    priority: c.writingPriority,
    writingOrder: result.writingOrder.find((w) => w.keyword === c.keyword)?.step ?? i + 10,
  }))

  await prisma.topicArticle.createMany({ data: topicArticles })

  return {
    siteId,
    niche: site.niche ?? 'כללי',
    pillars: result.pillars,
    totalArticlesNeeded: result.totalArticlesNeeded,
    totalArticlesExisting: totalExisting,
    coverageScore,
    missingTopics: result.missingTopics,
    writingOrder: result.writingOrder,
    authorityByPillar: result.authorityByPillar,
  }
}

export async function getTopicMap(siteId: string) {
  return prisma.topicMap.findUnique({
    where: { siteId },
    include: {
      articles: {
        include: { article: { select: { id: true, title: true, status: true, wpPostUrl: true } } },
        orderBy: { writingOrder: 'asc' },
      },
    },
  })
}

export async function getNextToWrite(siteId: string, count = 5) {
  return prisma.topicArticle.findMany({
    where: {
      topicMap: { siteId },
      status: 'planned',
      article: null,
    },
    orderBy: [{ priority: 'asc' }, { writingOrder: 'asc' }],
    take: count,
    include: {
      topicMap: { select: { niche: true } },
    },
  })
}

export async function analyzeClusterGaps(siteId: string): Promise<{
  pillar: string
  coveredClusters: number
  totalClusters: number
  gapScore: number
  priorityKeywords: string[]
  competitorAdvantage: string[]
}[]> {
  const topicMap = await prisma.topicMap.findUnique({
    where: { siteId },
    include: { articles: { where: { status: 'published' } } },
  })

  if (!topicMap) return []

  const pillars = topicMap.pillars as unknown as TopicPillar[]
  const publishedKeywords = new Set(topicMap.articles.map((a) => a.keyword.toLowerCase()))

  const gaps = pillars.map((pillar) => {
    const total = pillar.clusters.length
    const covered = pillar.clusters.filter((c) =>
      publishedKeywords.has(c.keyword.toLowerCase()) || c.existingArticleId
    ).length
    const uncovered = pillar.clusters.filter((c) =>
      !publishedKeywords.has(c.keyword.toLowerCase()) && !c.existingArticleId
    )

    return {
      pillar: pillar.keyword,
      coveredClusters: covered,
      totalClusters: total,
      gapScore: total > 0 ? Math.round(((total - covered) / total) * 100) : 0,
      priorityKeywords: uncovered
        .sort((a, b) => a.writingPriority - b.writingPriority)
        .slice(0, 5)
        .map((c) => c.keyword),
      competitorAdvantage: uncovered
        .filter((c) => c.type === 'comparison' || c.type === 'supporting')
        .slice(0, 3)
        .map((c) => c.keyword),
    }
  })

  return gaps.sort((a, b) => b.gapScore - a.gapScore)
}

export async function measurePillarAuthority(siteId: string): Promise<AuthorityScore[]> {
  const topicMap = await prisma.topicMap.findUnique({ where: { siteId } })
  if (!topicMap) return []

  const pillars = topicMap.pillars as unknown as TopicPillar[]
  const snapshots = await prisma.performanceSnapshot.groupBy({
    by: ['url'],
    where: { siteId, period: 'daily' },
    _avg: { position: true, ctr: true },
    _sum: { clicks: true },
  })

  const urlPerfMap = new Map(snapshots.map((s) => [
    s.url,
    { position: s._avg.position ?? 50, ctr: s._avg.ctr ?? 0, clicks: s._sum.clicks ?? 0 },
  ]))

  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published' },
    select: { id: true, primaryKeyword: true, wpPostUrl: true },
  })

  return pillars.map((pillar) => {
    const clusterKeywords = new Set(pillar.clusters.map((c) => c.keyword.toLowerCase()))
    const pillarArticles = articles.filter((a) =>
      clusterKeywords.has((a.primaryKeyword ?? '').toLowerCase()) ||
      (a.primaryKeyword ?? '').toLowerCase().includes(pillar.keyword.toLowerCase())
    )

    const published = pillarArticles.length
    const needed = pillar.clusters.length + 1
    const avgPosition = pillarArticles.length > 0
      ? pillarArticles.reduce((sum, art) => {
          const perf = urlPerfMap.get(art.wpPostUrl ?? '')
          return sum + (perf?.position ?? 50)
        }, 0) / pillarArticles.length
      : 50

    const score = Math.max(0, Math.min(100,
      (published / needed) * 50 +
      (Math.max(0, 50 - avgPosition) / 50) * 50
    ))

    return {
      pillar: pillar.keyword,
      score: Math.round(score),
      articlesPublished: published,
      articlesNeeded: needed,
      coverageGap: Math.max(0, needed - published),
    }
  })
}
