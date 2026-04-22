/**
 * Refresh Engine v2 — Surgical Content Improvement
 *
 * מעבר מ"המלצה לעדכן" ל"ניתוח כירורגי + תיקון אוטומטי":
 * - זיהוי מדויק: אילו queries לא מכוסים
 * - ניתוח פסקאות חלשות (קצר מדי, שטחי, לא ממיר)
 * - זיהוי בעיות מבנה (H2 חסרים, כותרות לא ממירות)
 * - גלוי חוסר עומק (מתחרים כותבים יותר על X)
 * - עדכון אוטומטי של חלקים — לא rewrite מלא
 * - השוואה לפני/אחרי
 * - מעקב מדידת שיפור ב-GSC
 */

import { generate, generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'
import { fetchSearchAnalytics } from '@/lib/gsc'
import { format, subDays } from 'date-fns'
import * as cheerio from 'cheerio'
import { createWpClient, updatePost } from '@/lib/wordpress'

export interface ContentDiagnosis {
  articleId: string
  url: string
  overallScore: number
  issues: ContentIssue[]
  queryGaps: QueryGap[]
  weakParagraphs: WeakParagraph[]
  structureIssues: StructureIssue[]
  depthGaps: DepthGap[]
  recommendations: SurgicalRecommendation[]
  estimatedImpact: 'high' | 'medium' | 'low'
}

export interface ContentIssue {
  type: string
  severity: 'critical' | 'warning' | 'info'
  description: string
  location: string
}

export interface QueryGap {
  query: string
  impressions: number
  clicks: number
  position: number
  coverage: 'missing' | 'partial' | 'thin'
  suggestedSection: string
}

export interface WeakParagraph {
  heading: string
  issue: 'too_short' | 'no_data' | 'shallow' | 'off_topic' | 'no_cta'
  currentLength: number
  suggestedLength: number
  improvementPrompt: string
}

export interface StructureIssue {
  type: 'missing_h2' | 'duplicate_h2' | 'wrong_hierarchy' | 'missing_faq' | 'no_conclusion'
  description: string
  fix: string
}

export interface DepthGap {
  topic: string
  currentCoverage: 'none' | 'minimal' | 'partial'
  competitorCoverage: 'detailed' | 'comprehensive'
  suggestedAddition: string
  wordTarget: number
}

export interface SurgicalRecommendation {
  action: 'add_section' | 'expand_paragraph' | 'rewrite_paragraph' | 'add_faq' | 'update_title' | 'add_data'
  target: string
  instruction: string
  priority: number
  estimatedMinutes: number
  newContent?: string
}

export async function diagnoseContent(articleId: string): Promise<ContentDiagnosis> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { site: true, page: true },
  })

  // Fetch GSC queries for this page
  const endDate = format(new Date(), 'yyyy-MM-dd')
  const startDate = format(subDays(new Date(), 56), 'yyyy-MM-dd')

  let queryData: { query: string; impressions: number; clicks: number; position: number; ctr: number }[] = []
  try {
    const gscData = await fetchSearchAnalytics(article.siteId, article.site.gscSiteUrl, {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 200,
    })
    const pageUrl = article.wpPostUrl ?? article.page?.url ?? ''
    queryData = gscData
      .filter((r) => r.page.includes(pageUrl.replace(/^https?:\/\/[^/]+/, '')))
      .map((r) => ({ query: r.query, impressions: r.impressions, clicks: r.clicks, position: r.position, ctr: r.ctr }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 30)
  } catch {
    // GSC not available, work with content only
  }

  // Parse content structure
  const content = article.content ?? ''
  const $ = cheerio.load(content)
  const h2s = $('h2').map((_, el) => $(el).text()).toArray()
  const wordCount = content.replace(/<[^>]+>/g, '').split(/\s+/).length
  const hasFaq = content.toLowerCase().includes('שאלות נפוצות') || $('div.faq').length > 0

  const prompt = `
אתה מומחה SEO ועורך תוכן כירורגי. נתח את המאמר הזה וזהה בעיות ספציפיות.

**מאמר:** "${article.title}"
**מילת מפתח ראשית:** ${article.primaryKeyword}
**מספר מילים:** ${wordCount}
**H2 קיימים:** ${h2s.join(' | ')}
**יש FAQ:** ${hasFaq ? 'כן' : 'לא'}

**שאילתות מ-GSC (קבלת טראפיק לפעמים, לא מכוסות בתוכן):**
${queryData.slice(0, 15).map((q) => `- "${q.query}" — ${q.impressions} חשיפות, CTR ${(q.ctr * 100).toFixed(1)}%, מיקום ${q.position.toFixed(1)}`).join('\n')}

**תוכן (1500 תווים ראשונים):**
${content.replace(/<[^>]+>/g, '').substring(0, 1500)}

נתח בעומק ו-החזר JSON:
{
  "overallScore": 0-100,
  "issues": [
    {
      "type": "thin_content" | "poor_structure" | "no_faq" | "shallow_intro" | "missing_cta" | "outdated_data",
      "severity": "critical" | "warning" | "info",
      "description": "תיאור הבעיה הספציפית",
      "location": "איפה בתוכן"
    }
  ],
  "queryGaps": [
    {
      "query": "שאילתה לא מכוסה",
      "coverage": "missing" | "partial" | "thin",
      "suggestedSection": "כותרת H2 מוצעת לכסות את הנושא"
    }
  ],
  "weakParagraphs": [
    {
      "heading": "H2 שחלש",
      "issue": "too_short" | "no_data" | "shallow" | "off_topic" | "no_cta",
      "currentLength": 150,
      "suggestedLength": 400,
      "improvementPrompt": "הוראה ספציפית לשיפור הפסקה"
    }
  ],
  "structureIssues": [
    {
      "type": "missing_h2" | "duplicate_h2" | "wrong_hierarchy" | "missing_faq" | "no_conclusion",
      "description": "בעיית מבנה ספציפית",
      "fix": "איך לתקן"
    }
  ],
  "depthGaps": [
    {
      "topic": "נושא שדורש עומק",
      "currentCoverage": "none" | "minimal" | "partial",
      "competitorCoverage": "detailed" | "comprehensive",
      "suggestedAddition": "מה להוסיף",
      "wordTarget": 300
    }
  ],
  "recommendations": [
    {
      "action": "add_section" | "expand_paragraph" | "rewrite_paragraph" | "add_faq" | "update_title" | "add_data",
      "target": "על מה הפעולה",
      "instruction": "הוראה מפורטת לביצוע",
      "priority": 1,
      "estimatedMinutes": 15
    }
  ],
  "estimatedImpact": "high" | "medium" | "low"
}
`

  const diagnosis = await generateJson<Omit<ContentDiagnosis, 'articleId' | 'url'>>(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 4000,
  })

  // Persist gaps to DB
  const gaps = [
    ...(diagnosis.queryGaps ?? []).map((q) => ({
      articleId,
      siteId: article.siteId,
      gapType: 'query_gap',
      query: q.query,
      missingSection: q.suggestedSection,
      priority: q.impressions ?? 50,
    })),
    ...(diagnosis.depthGaps ?? []).map((d) => ({
      articleId,
      siteId: article.siteId,
      gapType: 'depth_gap',
      query: d.topic,
      missingSection: d.suggestedAddition,
      priority: d.currentCoverage === 'none' ? 80 : 40,
    })),
  ]

  if (gaps.length > 0) {
    await prisma.contentGap.deleteMany({
      where: { articleId, status: 'pending' },
    })
    await prisma.contentGap.createMany({ data: gaps.map((g) => ({ ...g, priority: Number(g.priority) })) })
  }

  return {
    ...diagnosis,
    articleId,
    url: article.wpPostUrl ?? article.page?.url ?? '',
    queryGaps: diagnosis.queryGaps.map((q) => ({
      ...q,
      impressions: queryData.find((d) => d.query === q.query)?.impressions ?? 0,
      clicks: queryData.find((d) => d.query === q.query)?.clicks ?? 0,
      position: queryData.find((d) => d.query === q.query)?.position ?? 0,
    })),
  }
}

export async function applySurgicalFix(
  articleId: string,
  recommendation: SurgicalRecommendation
): Promise<string> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { site: true },
  })

  const content = article.content ?? ''

  const fixPrompt = `
אתה עורך תוכן SEO מקצועי. בצע תיקון כירורגי ספציפי במאמר.

**מאמר:** "${article.title}"
**מילת מפתח:** ${article.primaryKeyword}

**פעולה:** ${recommendation.action}
**יעד:** ${recommendation.target}
**הוראה:** ${recommendation.instruction}

**תוכן קיים:**
${content.replace(/<[^>]+>/g, '').substring(0, 2000)}

החזר אך ורק את הקטע החדש/המשופר ב-HTML.
- אם add_section: החזר H2 + פסקאות חדשות
- אם expand_paragraph: החזר הפסקה המורחבת
- אם add_faq: החזר <div class="faq"><h2>שאלות נפוצות</h2>...</div>
- אם add_data: החזר הפסקה עם הנתונים החדשים

כתוב בעברית, אנושי, SEO-optimized.
לא להחזיר הסבר — רק HTML.
`

  const newContent = await generate(fixPrompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 2000,
  })

  // Inject into content based on action
  let updatedContent = content
  const $ = cheerio.load(content)

  if (recommendation.action === 'add_section' || recommendation.action === 'add_faq') {
    // Add before closing or at end
    updatedContent = content.replace('</article>', newContent + '</article>')
    if (!updatedContent.includes(newContent)) {
      updatedContent = content + '\n' + newContent
    }
  } else if (recommendation.action === 'expand_paragraph' || recommendation.action === 'rewrite_paragraph') {
    // Find the target H2 and replace the paragraph after it
    const targetH2 = $('h2').filter((_, el) =>
      $(el).text().toLowerCase().includes(recommendation.target.toLowerCase().substring(0, 10))
    ).first()

    if (targetH2.length) {
      const h2Html = $.html(targetH2)
      updatedContent = content.replace(h2Html, h2Html + '\n' + newContent)
    } else {
      updatedContent = content + '\n' + newContent
    }
  }

  // Save updated content
  await prisma.article.update({
    where: { id: articleId },
    data: { content: updatedContent },
  })

  // Update WordPress if published
  if (article.wpPostId && article.site.wpUrl) {
    const wpClient = createWpClient(
      article.site.wpUrl,
      article.site.wpUser,
      article.site.wpAppPassword
    )
    await updatePost(wpClient, article.wpPostId, { content: updatedContent })
  }

  return updatedContent
}

export async function runFullRefresh(articleId: string): Promise<ContentDiagnosis> {
  const diagnosis = await diagnoseContent(articleId)

  // Auto-apply top 3 high-priority recommendations
  const topRecs = diagnosis.recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .filter((r) => r.action !== 'update_title') // Title handled by CTR engine

  for (const rec of topRecs) {
    try {
      await applySurgicalFix(articleId, rec)
    } catch (err) {
      console.error(`Failed to apply fix: ${rec.action}`, err)
    }
  }

  return diagnosis
}
