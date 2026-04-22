/**
 * GEO Engine — Generative Engine Optimization
 *
 * מעבר מ"SEO רגיל" ל"הופעה ב-AI Search":
 * - ChatGPT, Perplexity, Claude, Google AI Overviews
 * - כתיבת תשובות ישירות (direct answers) שנאספות על ידי AI
 * - Entity optimization — להיות ה"מקור הסמכותי" לנושא
 * - Citation structure — מה גורם ל-AI לצטט אותך
 * - Structured Q&A content — פורמט שAI אוהב
 * - Featured snippet optimization
 * - Knowledge graph integration
 * - מעקב הופעות ב-AI Search
 */

import { generate, generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'
import * as cheerio from 'cheerio'

export interface DirectAnswer {
  question: string
  answer: string
  confidence: number
  format: 'sentence' | 'list' | 'table' | 'definition'
  entities: string[]
  citations: string[]
}

export interface EntityProfile {
  entity: string
  type: 'person' | 'place' | 'concept' | 'product' | 'organization' | 'event'
  description: string
  attributes: Record<string, string>
  relatedEntities: string[]
  prominence: number
}

export interface GeoOptimizationResult {
  articleId: string
  aiReadabilityScore: number
  citationScore: number
  directAnswers: DirectAnswer[]
  entityMap: EntityProfile[]
  structuredQA: { q: string; a: string }[]
  featuredSnippetCandidate: string
  aiSearchSignals: AiSignal[]
  recommendations: GeoRecommendation[]
  optimizedContent: string
}

export interface AiSignal {
  signal: string
  strength: 'strong' | 'medium' | 'weak'
  present: boolean
  impact: string
}

export interface GeoRecommendation {
  type: 'add_direct_answer' | 'improve_entity' | 'add_citation' | 'restructure_qa' | 'add_definition' | 'improve_snippet'
  priority: number
  description: string
  implementation: string
  estimatedImpact: string
}

export async function optimizeForAiSearch(articleId: string): Promise<GeoOptimizationResult> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { site: true },
  })

  const content = article.content ?? ''
  const cleanText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const $ = cheerio.load(content)

  // Extract existing Q&A from FAQ section
  const existingFaqs: { q: string; a: string }[] = []
  $('div.faq h3, .faq .question').each((_, el) => {
    const q = $(el).text().trim()
    const a = $(el).next().text().trim()
    if (q && a) existingFaqs.push({ q, a })
  })

  const prompt = `
אתה מומחה GEO (Generative Engine Optimization) — התאמת תוכן להופעה ב-ChatGPT, Perplexity ו-Google AI Overviews.

**מאמר:** "${article.title}"
**מילת מפתח:** ${article.primaryKeyword}
**נישה:** ${article.site.niche ?? 'כללי'}

**תוכן הנוכחי (1500 מילים ראשונות):**
${cleanText.substring(0, 2000)}

**FAQ קיים:** ${existingFaqs.length} שאלות

נתח ובצע אופטימיזציה ל-AI Search. החזר JSON:
{
  "aiReadabilityScore": 0-100,
  "citationScore": 0-100,
  "directAnswers": [
    {
      "question": "שאלה שAI יחפש תשובה לה",
      "answer": "תשובה ישירה 1-3 משפטים, עובדתית, ברורה",
      "confidence": 0.0-1.0,
      "format": "sentence" | "list" | "table" | "definition",
      "entities": ["ישות 1", "ישות 2"],
      "citations": ["מקור אמין לציטוט"]
    }
  ],
  "entityMap": [
    {
      "entity": "שם הישות",
      "type": "person" | "place" | "concept" | "product" | "organization" | "event",
      "description": "תיאור קצר וסמכותי",
      "attributes": { "property": "value" },
      "relatedEntities": ["ישות קשורה"],
      "prominence": 1-10
    }
  ],
  "structuredQA": [
    { "q": "שאלה חדשה שצריך להוסיף", "a": "תשובה אידיאלית ל-AI" }
  ],
  "featuredSnippetCandidate": "פסקה אחת מושלמת לפיצ'ר סניפט — 40-60 מילים, עובדתית, ישירה",
  "aiSearchSignals": [
    {
      "signal": "שם הסיגנל",
      "strength": "strong" | "medium" | "weak",
      "present": true | false,
      "impact": "מה ההשפעה על הופעה ב-AI Search"
    }
  ],
  "recommendations": [
    {
      "type": "add_direct_answer" | "improve_entity" | "add_citation" | "restructure_qa" | "add_definition" | "improve_snippet",
      "priority": 1,
      "description": "מה לשנות",
      "implementation": "איך לבצע בדיוק",
      "estimatedImpact": "השפעה צפויה"
    }
  ]
}

AI Search Signals שחשובים:
1. Direct answers — תשובות ישירות לשאלות
2. Entity authority — ציון ישויות עם תכונות
3. Factual density — צפיפות עובדות ומספרים
4. Citation-worthy content — תוכן שמגיע ממקור סמכותי
5. Structured Q&A — שאלות ותשובות ברורות
6. Definition blocks — הגדרות מדויקות
7. Comparative statements — השוואות עם מסקנות
8. Temporal signals — מידע עדכני עם תאריכים
`

  const result = await generateJson<Omit<GeoOptimizationResult, 'articleId' | 'optimizedContent'>>(
    prompt,
    { model: 'claude-sonnet-4-6', maxTokens: 5000 }
  )

  // Generate optimized content additions
  const optimizedAdditions = await buildGeoOptimizedContent(
    article.primaryKeyword ?? '',
    result.directAnswers,
    result.structuredQA,
    result.featuredSnippetCandidate,
    result.entityMap
  )

  // Inject into content
  const updatedContent = injectGeoContent(content, optimizedAdditions, result.featuredSnippetCandidate)

  // Save to DB
  await prisma.geoOptimization.upsert({
    where: { articleId },
    create: {
      articleId,
      siteId: article.siteId,
      directAnswers: result.directAnswers as object,
      entityMap: result.entityMap as object,
      structuredQA: result.structuredQA as object,
      featuredSnippet: result.featuredSnippetCandidate,
      aiSearchSignals: result.aiSearchSignals as object,
      aiReadabilityScore: result.aiReadabilityScore,
      citationScore: result.citationScore,
    },
    update: {
      directAnswers: result.directAnswers as object,
      entityMap: result.entityMap as object,
      structuredQA: result.structuredQA as object,
      featuredSnippet: result.featuredSnippetCandidate,
      aiSearchSignals: result.aiSearchSignals as object,
      aiReadabilityScore: result.aiReadabilityScore,
      citationScore: result.citationScore,
      lastAnalyzed: new Date(),
    },
  })

  if (updatedContent !== content) {
    await prisma.article.update({
      where: { id: articleId },
      data: { content: updatedContent },
    })
  }

  return {
    ...result,
    articleId,
    optimizedContent: updatedContent,
  }
}

async function buildGeoOptimizedContent(
  keyword: string,
  directAnswers: DirectAnswer[],
  structuredQA: { q: string; a: string }[],
  featuredSnippet: string,
  entities: EntityProfile[]
): Promise<string> {
  const topAnswers = directAnswers.slice(0, 3)
  const topQA = structuredQA.slice(0, 5)
  const topEntities = entities.filter((e) => e.prominence >= 7).slice(0, 3)

  let html = ''

  // Featured snippet block (right after H1)
  if (featuredSnippet) {
    html += `\n<div class="featured-answer" itemscope itemtype="https://schema.org/Answer">
  <meta itemprop="text" content="${featuredSnippet.replace(/"/g, '&quot;')}" />
  <p class="direct-answer"><strong>${keyword}:</strong> ${featuredSnippet}</p>
</div>\n`
  }

  // Entity definitions block
  if (topEntities.length > 0) {
    html += `\n<div class="entity-definitions">\n`
    for (const entity of topEntities) {
      html += `<div itemscope itemtype="https://schema.org/Thing">
  <span itemprop="name">${entity.entity}</span>:
  <span itemprop="description">${entity.description}</span>
</div>\n`
    }
    html += `</div>\n`
  }

  // Additional Q&A
  if (topQA.length > 0) {
    html += `\n<div class="ai-qa-section">\n`
    for (const qa of topQA) {
      html += `<div itemscope itemtype="https://schema.org/Question">
  <h3 itemprop="name">${qa.q}</h3>
  <div itemscope itemtype="https://schema.org/Answer" itemprop="acceptedAnswer">
    <p itemprop="text">${qa.a}</p>
  </div>
</div>\n`
    }
    html += `</div>\n`
  }

  return html
}

function injectGeoContent(
  originalContent: string,
  geoAdditions: string,
  featuredSnippet: string
): string {
  if (!geoAdditions) return originalContent

  // Inject featured answer right after H1
  const h1End = originalContent.indexOf('</h1>')
  if (h1End > -1) {
    const snippetBlock = featuredSnippet
      ? `\n<div class="featured-answer"><p>${featuredSnippet}</p></div>\n`
      : ''
    return (
      originalContent.slice(0, h1End + 5) +
      snippetBlock +
      originalContent.slice(h1End + 5)
    )
  }

  return originalContent + '\n' + geoAdditions
}

export function buildFaqSchema(qaPairs: { q: string; a: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qaPairs.map((qa) => ({
      '@type': 'Question',
      name: qa.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: qa.a,
      },
    })),
  }
}

export interface AIOverviewOpportunity {
  query: string
  currentPosition: number
  impressions: number
  hasAIOverview: boolean
  snippetQuality: 'optimal' | 'good' | 'needs-work'
  directAnswerPresent: boolean
  entityCoverage: number
  actionItems: string[]
  estimatedAppearanceChance: number
}

export async function findAIOverviewOpportunities(
  siteId: string
): Promise<AIOverviewOpportunity[]> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId }, select: { gscSiteUrl: true } })
  const { fetchSearchAnalytics } = await import('@/lib/gsc')
  const { format, subDays } = await import('date-fns')

  const endDate = format(new Date(), 'yyyy-MM-dd')
  const startDate = format(subDays(new Date(), 28), 'yyyy-MM-dd')

  const rows = await fetchSearchAnalytics(siteId, site.gscSiteUrl, {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 100,
  })

  // Focus on informational queries at positions 1-10 (likely AI Overview candidates)
  const candidates = rows
    .filter((r) => r.position <= 10 && r.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30)

  if (candidates.length === 0) return []

  const geoData = await prisma.geoOptimization.findMany({
    where: { siteId },
    select: { articleId: true, directAnswers: true, entityMap: true, featuredSnippet: true, citationScore: true },
  })

  const prompt = `
אתה מומחה Google AI Overviews. נתח אילו שאילתות מהרשימה הכי מתאימות להופעה ב-AI Overview.

**שאילתות (עם נתוני ביצועים):**
${candidates.slice(0, 20).map((r) => `- "${r.query}" | מיקום ${r.position.toFixed(1)} | ${r.impressions} חשיפות | CTR ${(r.ctr * 100).toFixed(1)}%`).join('\n')}

AI Overviews מופיעים בעיקר ל:
- שאילתות "מה זה", "איך ל", "למה", "מתי", "האם"
- שאילתות מידעיות עם תשובה ישירה
- שאילתות בריאות, פיננסים, חינוך
- שאילתות עם הרבה PAA (People Also Ask)

לכל שאילתה, נתח:
- האם יש AI Overview (likely/unlikely)
- איכות התוכן הנדרש
- פעולות לשיפור

החזר JSON:
[
  {
    "query": "שאילתה",
    "hasAIOverview": true | false,
    "snippetQuality": "optimal" | "good" | "needs-work",
    "directAnswerPresent": true | false,
    "entityCoverage": 0-100,
    "actionItems": ["פעולה 1", "פעולה 2"],
    "estimatedAppearanceChance": 0-100
  }
]
`

  const analysis = await generateJson<{
    query: string
    hasAIOverview: boolean
    snippetQuality: 'optimal' | 'good' | 'needs-work'
    directAnswerPresent: boolean
    entityCoverage: number
    actionItems: string[]
    estimatedAppearanceChance: number
  }[]>(prompt, { model: 'claude-haiku-4-5-20251001', maxTokens: 3000 })

  return analysis.map((a) => {
    const gscRow = candidates.find((r) => r.query === a.query)
    return {
      ...a,
      currentPosition: gscRow?.position ?? 0,
      impressions: gscRow?.impressions ?? 0,
    }
  }).sort((x, y) => y.estimatedAppearanceChance - x.estimatedAppearanceChance)
}

export async function optimizeForAIOverview(
  articleId: string,
  query: string
): Promise<string> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    select: { content: true, title: true, primaryKeyword: true },
  })

  const content = article.content ?? ''
  const cleanText = content.replace(/<[^>]+>/g, ' ').substring(0, 2000)

  const prompt = `
אתה מומחה Google AI Overviews. שפר את התוכן הזה להופעה ב-AI Overview עבור השאילתה.

**שאילתה:** "${query}"
**מאמר:** "${article.title}"

**תוכן נוכחי:**
${cleanText}

צור קטע HTML אחד (100-150 מילים) שמספק תשובה ישירה ומקיפה לשאילתה.
הקטע צריך:
1. להתחיל בתשובה הישירה (לא "במאמר זה נדון...")
2. לכלול עובדות ומספרים ספציפיים
3. להשתמש ב-Schema.org markup
4. להיות בפורמט שAI יכול לסרוק בקלות

החזר HTML בלבד, ללא הסבר.
`

  const snippet = await generate(prompt, { model: 'claude-sonnet-4-6', maxTokens: 500 })

  // Inject at top of content
  const h1End = content.indexOf('</h1>')
  const updatedContent = h1End > -1
    ? content.slice(0, h1End + 5) + '\n' + snippet + content.slice(h1End + 5)
    : content + '\n' + snippet

  await prisma.article.update({
    where: { id: articleId },
    data: { content: updatedContent },
  })

  return snippet
}

export function buildArticleSchema(
  title: string,
  description: string,
  url: string,
  publishedAt: Date,
  entities: EntityProfile[]
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    datePublished: publishedAt.toISOString(),
    dateModified: new Date().toISOString(),
    inLanguage: 'he',
    about: entities.slice(0, 5).map((e) => ({
      '@type': 'Thing',
      name: e.entity,
      description: e.description,
    })),
    author: { '@type': 'Organization', name: 'Solina' },
  }
}
