import { generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export interface ContentBrief {
  [key: string]: unknown
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional'
  articleType: 'guide' | 'listicle' | 'comparison' | 'review' | 'faq' | 'how-to'
  h1: string
  structure: HeadingNode[]
  faqQuestions: string[]
  entities: string[]
  internalLinkSuggestions: string[]
  recommendedLength: number
  tone: string
  targetAudience: string
  competitorGap: string
}

export interface HeadingNode {
  [key: string]: unknown
  level: 'H2' | 'H3'
  text: string
  keyPoints?: string[]
  children?: HeadingNode[]
}

export async function generateContentBrief(
  opportunityId: string,
  siteContext?: string
): Promise<ContentBrief> {
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: { site: true },
  })

  const prompt = `
אתה מומחה SEO ישראלי בכיר. בנה בריף תוכן מלא עבור המילת מפתח הזו.

**מילת מפתח:** ${opportunity.query}
**חשיפות:** ${opportunity.impressions}
**CTR:** ${(opportunity.ctr * 100).toFixed(1)}%
**מיקום:** ${opportunity.position.toFixed(1)}
**סוג הזדמנות:** ${opportunity.type}
**אתר/נישה:** ${opportunity.site.name} — ${opportunity.site.niche ?? 'כללי'}
${siteContext ? `**הקשר:** ${siteContext}` : ''}

החזר JSON בפורמט:
{
  "primaryKeyword": string,
  "secondaryKeywords": string[5-8],
  "searchIntent": "informational" | "navigational" | "commercial" | "transactional",
  "articleType": "guide" | "listicle" | "comparison" | "review" | "faq" | "how-to",
  "h1": "כותרת H1 אטרקטיבית עם מילת המפתח",
  "structure": [
    {
      "level": "H2",
      "text": "כותרת H2",
      "keyPoints": ["נקודה 1", "נקודה 2"],
      "children": [
        { "level": "H3", "text": "כותרת H3" }
      ]
    }
  ],
  "faqQuestions": string[5-7],
  "entities": string[5-10],
  "internalLinkSuggestions": string[3-5],
  "recommendedLength": number,
  "tone": string,
  "targetAudience": string,
  "competitorGap": string
}

כללים:
- מינימום 5 H2
- כל H2 עם לפחות 2 נקודות מפתח
- FAQ ממש בסוף
- שפה עברית זורמת ואנושית
- כוונת חיפוש חייבת להתאים למבנה
`

  const brief = await generateJson<ContentBrief>(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 4000,
  })

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { brief: brief as object },
  })

  return brief
}

export async function generateBriefForKeyword(
  keyword: string,
  siteContext: string = ''
): Promise<ContentBrief> {
  const prompt = `
אתה מומחה SEO ישראלי בכיר. בנה בריף תוכן מלא עבור המילת מפתח הזו.

**מילת מפתח:** ${keyword}
**הקשר האתר:** ${siteContext || 'אתר מידע כללי'}

החזר JSON בפורמט ContentBrief מלא עם כל השדות הנדרשים.
אתה חייב להחזיר ONLY valid JSON.

{
  "primaryKeyword": "${keyword}",
  "secondaryKeywords": [],
  "searchIntent": "informational",
  "articleType": "guide",
  "h1": "",
  "structure": [],
  "faqQuestions": [],
  "entities": [],
  "internalLinkSuggestions": [],
  "recommendedLength": 1500,
  "tone": "אנושי, חם, מקצועי",
  "targetAudience": "",
  "competitorGap": ""
}
`

  return generateJson<ContentBrief>(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 3000,
  })
}
