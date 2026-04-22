import { prisma } from '@/lib/prisma'
import { generateJson } from '@/lib/claude'

export interface LinkSuggestion {
  sourcePageId: string
  sourceUrl: string
  targetPageId: string
  targetUrl: string
  targetTitle: string
  anchorText: string
  context: string
  confidence: number
}

export async function findOrphanPages(siteId: string): Promise<{ id: string; url: string; title: string | null }[]> {
  const pages = await prisma.page.findMany({ where: { siteId } })

  const linkedUrls = new Set<string>()

  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published', content: { not: null } },
    select: { content: true },
  })

  for (const article of articles) {
    if (!article.content) continue
    const matches = article.content.matchAll(/href="([^"]+)"/g)
    for (const match of matches) {
      linkedUrls.add(match[1])
    }
  }

  return pages
    .filter((p) => !linkedUrls.has(p.url) && p.url !== '/')
    .map((p) => ({ id: p.id, url: p.url, title: p.title }))
}

export async function suggestInternalLinks(
  siteId: string,
  targetArticleId: string
): Promise<LinkSuggestion[]> {
  const targetArticle = await prisma.article.findUniqueOrThrow({
    where: { id: targetArticleId },
    include: { page: true },
  })

  const otherArticles = await prisma.article.findMany({
    where: {
      siteId,
      status: 'published',
      id: { not: targetArticleId },
    },
    include: { page: true },
    take: 20,
  })

  if (otherArticles.length === 0) return []

  const prompt = `
אתה מומחה SEO. זהה הזדמנויות קישורים פנימיים.

**מאמר יעד:**
כותרת: ${targetArticle.title}
מילת מפתח: ${targetArticle.primaryKeyword}
URL: ${targetArticle.page?.url ?? targetArticle.wpPostUrl ?? 'N/A'}

**מאמרים קיימים:**
${otherArticles.map((a, i) => `${i + 1}. כותרת: "${a.title}" | מילת מפתח: "${a.primaryKeyword}" | URL: ${a.page?.url ?? a.wpPostUrl ?? 'N/A'}`).join('\n')}

החזר JSON — רשימת הצעות קישורים:
[
  {
    "sourceIndex": number (אינדקס מ-1 של המאמר המקור),
    "anchorText": "טקסט הקישור הטבעי",
    "context": "המשפט/הפסקה שבה הקישור מתאים",
    "confidence": 0.0-1.0
  }
]

קריטריונים:
- רלוונטיות נושאית
- כוונת חיפוש משלימה
- anchor text טבעי בעברית
- confidence גבוה = קישור טבעי מאוד
`

  const suggestions = await generateJson<{
    sourceIndex: number
    anchorText: string
    context: string
    confidence: number
  }[]>(prompt, { model: 'claude-haiku-4-5-20251001', maxTokens: 1500 })

  return suggestions
    .filter((s) => s.confidence >= 0.6)
    .map((s) => {
      const source = otherArticles[s.sourceIndex - 1]
      return {
        sourcePageId: source?.pageId ?? '',
        sourceUrl: source?.page?.url ?? source?.wpPostUrl ?? '',
        targetPageId: targetArticle.pageId ?? '',
        targetUrl: targetArticle.page?.url ?? targetArticle.wpPostUrl ?? '',
        targetTitle: targetArticle.title ?? '',
        anchorText: s.anchorText,
        context: s.context,
        confidence: s.confidence,
      }
    })
    .filter((s) => s.sourceUrl && s.targetUrl)
}
