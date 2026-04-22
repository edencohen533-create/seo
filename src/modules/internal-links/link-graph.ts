/**
 * Internal Link Graph Engine
 *
 * שדרוג מ"הצעות בסיסיות" ל"גרף קישורים חכם":
 * - PageRank-style scoring לכל עמוד
 * - זיהוי עמודי כסף וחיזוקם בקישורים
 * - איזון קישורים (לא over/under-link)
 * - Semantic similarity בין עמודים
 * - הכנסת קישורים טבעית בטקסט
 * - crawlability analysis
 */

import { generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export interface PageRankScore {
  pageId: string
  url: string
  title: string | null
  score: number
  inboundLinks: number
  outboundLinks: number
  isOrphan: boolean
  isMoney: boolean
  recommendation: 'boost' | 'reduce' | 'maintain' | 'fix_orphan'
}

export interface LinkGraphAnalysis {
  totalPages: number
  totalLinks: number
  orphanPages: number
  avgLinksPerPage: number
  topPages: PageRankScore[]
  orphans: PageRankScore[]
  overLinked: PageRankScore[]
  underLinked: PageRankScore[]
  recommendations: LinkGraphRecommendation[]
}

export interface LinkGraphRecommendation {
  type: 'add_link' | 'remove_link' | 'fix_anchor' | 'boost_money_page'
  sourcePageId: string
  targetPageId: string
  anchorText: string
  context: string
  priority: number
  reason: string
}

export async function buildLinkGraph(siteId: string): Promise<LinkGraphAnalysis> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } })
  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published', content: { not: null } },
    include: { page: true },
  })

  const linkEdges: Map<string, Set<string>> = new Map()
  const pageInfo: Map<string, { url: string; title: string | null; pageId: string }> = new Map()

  for (const article of articles) {
    if (!article.pageId || !article.content) continue

    pageInfo.set(article.pageId, {
      url: article.wpPostUrl ?? article.page?.url ?? '',
      title: article.title,
      pageId: article.pageId,
    })

    const outLinks = new Set<string>()
    const matches = article.content.matchAll(/href="([^"]+)"/g)
    for (const match of matches) {
      const href = match[1]
      if (href.startsWith('/') || href.includes(site.domain)) {
        const targetPage = await prisma.page.findFirst({
          where: { siteId, url: { contains: href.replace(/^https?:\/\/[^/]+/, '') } },
        })
        if (targetPage && targetPage.id !== article.pageId) {
          outLinks.add(targetPage.id)
        }
      }
    }
    linkEdges.set(article.pageId, outLinks)
  }

  // PageRank-style scoring (simplified iterative)
  const pageIds = Array.from(pageInfo.keys())
  const scores: Map<string, number> = new Map(pageIds.map((id) => [id, 1.0]))

  const damping = 0.85
  const iterations = 10

  for (let i = 0; i < iterations; i++) {
    const newScores = new Map<string, number>()
    for (const pageId of pageIds) {
      let rank = (1 - damping)
      for (const [srcId, outLinks] of linkEdges) {
        if (outLinks.has(pageId)) {
          const srcScore = scores.get(srcId) ?? 1.0
          rank += damping * (srcScore / (outLinks.size || 1))
        }
      }
      newScores.set(pageId, rank)
    }
    for (const [id, score] of newScores) scores.set(id, score)
  }

  // Build result
  const pageScores: PageRankScore[] = pageIds.map((pageId) => {
    const info = pageInfo.get(pageId)!
    const inbound = Array.from(linkEdges.values()).filter((e) => e.has(pageId)).length
    const outbound = linkEdges.get(pageId)?.size ?? 0
    const score = scores.get(pageId) ?? 0

    return {
      pageId,
      url: info.url,
      title: info.title,
      score: parseFloat(score.toFixed(3)),
      inboundLinks: inbound,
      outboundLinks: outbound,
      isOrphan: inbound === 0,
      isMoney: score > 2.0 || (inbound > 5 && outbound < 3),
      recommendation:
        inbound === 0 ? 'fix_orphan' :
        score > 3.0 ? 'maintain' :
        inbound < 2 ? 'boost' :
        'maintain',
    }
  })

  const sorted = pageScores.sort((a, b) => b.score - a.score)
  const orphans = pageScores.filter((p) => p.isOrphan)
  const overLinked = pageScores.filter((p) => p.outboundLinks > 15)
  const underLinked = pageScores.filter((p) => p.inboundLinks < 2 && !p.isOrphan)

  // Persist to DB
  for (const edge of Array.from(linkEdges.entries())) {
    const [srcId, targets] = edge
    for (const tgtId of targets) {
      await prisma.linkEdge.upsert({
        where: { sourcePageId_targetPageId: { sourcePageId: srcId, targetPageId: tgtId } },
        create: {
          siteId,
          sourcePageId: srcId,
          targetPageId: tgtId,
          anchorText: '',
          pageRankFlow: (scores.get(tgtId) ?? 0) / (linkEdges.get(srcId)?.size ?? 1),
        },
        update: {
          pageRankFlow: (scores.get(tgtId) ?? 0) / (linkEdges.get(srcId)?.size ?? 1),
        },
      })
    }
  }

  // Mark orphans in DB
  await prisma.page.updateMany({
    where: { siteId, id: { in: orphans.map((o) => o.pageId) } },
    data: { isOrphan: true },
  })

  return {
    totalPages: pageIds.length,
    totalLinks: Array.from(linkEdges.values()).reduce((s, e) => s + e.size, 0),
    orphanPages: orphans.length,
    avgLinksPerPage: pageIds.length > 0
      ? Array.from(linkEdges.values()).reduce((s, e) => s + e.size, 0) / pageIds.length
      : 0,
    topPages: sorted.slice(0, 10),
    orphans: orphans.slice(0, 10),
    overLinked: overLinked.slice(0, 5),
    underLinked: underLinked.slice(0, 10),
    recommendations: [],
  }
}

export async function suggestLinkInjections(
  siteId: string,
  limit = 20
): Promise<LinkGraphRecommendation[]> {
  const [orphans, weakPages, articles] = await Promise.all([
    prisma.page.findMany({ where: { siteId, isOrphan: true }, take: 10 }),
    prisma.linkEdge.groupBy({
      by: ['targetPageId'],
      where: { siteId },
      _count: { id: true },
      orderBy: { _count: { id: 'asc' } },
      having: { id: { _count: { lt: 3 } } },
      take: 10,
    }),
    prisma.article.findMany({
      where: { siteId, status: 'published', content: { not: null } },
      select: { id: true, title: true, primaryKeyword: true, wpPostUrl: true, pageId: true },
      take: 30,
    }),
  ])

  if (articles.length < 2) return []

  const prompt = `
אתה מומחה SEO קישורים פנימיים. בנה תכנית קישורים חכמה.

**עמודים יתומים (ללא קישורים נכנסים):**
${orphans.map((p) => `- ${p.url} | ${p.title}`).join('\n') || 'אין'}

**מאמרים קיימים:**
${articles.map((a, i) => `${i + 1}. "${a.title}" | keyword: "${a.primaryKeyword}" | url: ${a.wpPostUrl}`).join('\n')}

צור ${limit} המלצות קישורים פנימיים.

החזר JSON:
[
  {
    "sourceIndex": number (מ-1, מאמר מקור),
    "targetIndex": number (מ-1, מאמר יעד),
    "anchorText": "טקסט הקישור הטבעי בעברית",
    "context": "המשפט שבו הקישור יוכנס",
    "priority": 1-10,
    "reason": "למה הקישור הזה חשוב"
  }
]

כללים:
- anchor text: טבעי, לא keyword stuffing
- context: משפט שמנמק את הקישור
- priority 1 = הכי דחוף
- תעדף עמודים יתומים
- לא יותר מ-2 קישורים לאותו יעד
`

  const suggestions = await generateJson<{
    sourceIndex: number
    targetIndex: number
    anchorText: string
    context: string
    priority: number
    reason: string
  }[]>(prompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 3000,
  })

  const mapped = suggestions
    .filter((s) => s.sourceIndex >= 1 && s.targetIndex >= 1)
    .map((s) => {
      const source = articles[s.sourceIndex - 1]
      const target = articles[s.targetIndex - 1]
      if (!source || !target || !source.pageId || !target.pageId) return null
      const rec: LinkGraphRecommendation = {
        type: 'add_link',
        sourcePageId: source.pageId,
        targetPageId: target.pageId,
        anchorText: s.anchorText,
        context: s.context,
        priority: s.priority,
        reason: s.reason,
      }
      return rec
    })
  return mapped.filter((s): s is LinkGraphRecommendation => s !== null)
}
