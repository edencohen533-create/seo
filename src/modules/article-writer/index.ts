import { generate, generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'
import type { ContentBrief } from '../content-brief'

export interface ArticleOutput {
  title: string
  slug: string
  content: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  schema: object
  altTexts: { position: string; text: string }[]
  wordCount: number
}

const SEO_SYSTEM_PROMPT = `אתה סופר תוכן SEO ישראלי מקצועי.
כתיבתך:
- אנושית, חמה, מעמיקה — לא רובוטית ולא שטחית
- ממוקדת קוראים אמיתיים שמחפשים תשובה לשאלה ספציפית
- כוללת מידע מדויק, דוגמאות ומספרים כשרלוונטי
- ממנעת טענות רפואיות מוגזמות
- עברית תקנית ונגישה

מבנה HTML:
- <h1> אחד בלבד בתחילת המאמר
- <h2> לכל חלק ראשי
- <h3> לחלקים משניים
- <p> לפסקאות — פסקאות מלאות, לא נקודות
- <strong> להדגשות חשובות
- <ul>/<ol> לרשימות
- <a href="..."> לקישורים פנימיים וחיצוניים
- FAQ בתגית <div class="faq"> בסוף`

export async function writeArticle(
  brief: ContentBrief,
  site: { name: string; domain: string; niche: string | null; brandTone: string | null },
  existingInternalLinks?: string[]
): Promise<ArticleOutput> {
  const structureText = brief.structure
    .map((h2) => {
      const children = h2.children?.map((h3) => `    <h3>${h3.text}</h3>`).join('\n') ?? ''
      const points = h2.keyPoints?.map((p) => `  - ${p}`).join('\n') ?? ''
      return `<h2>${h2.text}</h2>\n${points}\n${children}`
    })
    .join('\n\n')

  const internalLinks = existingInternalLinks?.length
    ? `קישורים פנימיים זמינים לשילוב:\n${existingInternalLinks.join('\n')}`
    : ''

  const prompt = `
כתוב מאמר SEO מלא בעברית עבור האתר "${site.name}".

**מילת מפתח ראשית:** ${brief.primaryKeyword}
**מילות מפתח משניות:** ${brief.secondaryKeywords.join(', ')}
**כוונת חיפוש:** ${brief.searchIntent}
**סוג מאמר:** ${brief.articleType}
**H1:** ${brief.h1}
**קהל יעד:** ${brief.targetAudience}
**טון:** ${brief.tone}
**אורך מומלץ:** ${brief.recommendedLength} מילים
**ישויות לשילוב:** ${brief.entities.join(', ')}
${internalLinks}

**מבנה נדרש:**
${structureText}

**שאלות FAQ לסוף:**
${brief.faqQuestions.map((q) => `- ${q}`).join('\n')}

**כללים:**
1. H1 בדיוק אחד: "${brief.h1}"
2. כל H2 צריך פסקאות מלאות (3-5 שורות לפחות)
3. שלב מילות מפתח באופן טבעי — אל תדחוס
4. FAQ ב: <div class="faq"><h2>שאלות נפוצות</h2>...</div>
5. קישורים חיצוניים לאתרי סמכות: Wikipedia, gov.il, מחקרים
6. אל תכלול markdown — רק HTML
7. תוכן עשיר, מעמיק, בעל ערך אמיתי
8. ${site.brandTone ?? 'כתיבה אנושית ומקצועית'}

כתוב את המאמר המלא עכשיו:
`

  const content = await generate(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 8000,
    system: SEO_SYSTEM_PROMPT,
  })

  const wordCount = content.replace(/<[^>]+>/g, '').split(/\s+/).length

  const metaPrompt = `
עבור המאמר על "${brief.primaryKeyword}", צור את המטא-דאטה הבאה:

החזר JSON:
{
  "metaTitle": "כותרת עמוד SEO עד 60 תווים — ממירת CTR",
  "metaDescription": "תיאור מטא עד 155 תווים — הסבר ערך ברור",
  "slug": "slug-in-english-or-hebrew-no-spaces",
  "excerpt": "תמצית 2-3 משפטים לקורא",
  "altTexts": [
    { "position": "hero", "text": "alt text לתמונה ראשית" },
    { "position": "h2-1", "text": "alt text לתמונה אחרי H2 ראשון" },
    { "position": "h2-2", "text": "alt text לתמונה אחרי H2 שני" },
    { "position": "h2-3", "text": "alt text לתמונה אחרי H2 שלישי" }
  ]
}

H1: ${brief.h1}
Primary keyword: ${brief.primaryKeyword}
`

  const meta = await generateJson<{
    metaTitle: string
    metaDescription: string
    slug: string
    excerpt: string
    altTexts: { position: string; text: string }[]
  }>(metaPrompt, { model: 'claude-haiku-4-5-20251001', maxTokens: 1000 })

  const schema = buildArticleSchema({
    title: brief.h1,
    description: meta.metaDescription,
    url: `https://${site.domain}/${meta.slug}`,
    faqQuestions: brief.faqQuestions,
  })

  return {
    title: brief.h1,
    slug: meta.slug,
    content,
    excerpt: meta.excerpt,
    metaTitle: meta.metaTitle,
    metaDescription: meta.metaDescription,
    schema,
    altTexts: meta.altTexts,
    wordCount,
  }
}

function buildArticleSchema(opts: {
  title: string
  description: string
  url: string
  faqQuestions: string[]
}): object {
  const schemas: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: opts.title,
      description: opts.description,
      url: opts.url,
      inLanguage: 'he',
      author: { '@type': 'Organization', name: 'Solina' },
    },
  ]

  if (opts.faqQuestions.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: opts.faqQuestions.map((q) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `תשובה מקיפה ל: ${q}`,
        },
      })),
    })
  }

  return schemas
}

export async function saveArticleDraft(articleId: string, output: ArticleOutput) {
  return prisma.article.update({
    where: { id: articleId },
    data: {
      title: output.title,
      slug: output.slug,
      content: output.content,
      excerpt: output.excerpt,
      metaTitle: output.metaTitle,
      metaDescription: output.metaDescription,
      schema: output.schema,
      wordCount: output.wordCount,
      status: 'images',
    },
  })
}
