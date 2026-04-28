export type TemplateType =
  | 'seo_article'
  | 'keyword_research'
  | 'content_optimization'
  | 'meta_title_description'
  | 'faq_generation'
  | 'regulatory_review'
  | 'image_prompt'
  | 'extract_metadata'

export interface TemplateInput {
  // seo_article
  topic?: string
  mainKeyword?: string
  secondaryKeywords?: string[]
  audience?: string
  productContext?: string
  desiredLength?: number
  // keyword_research
  niche?: string
  seedKeyword?: string
  // content_optimization
  existingContent?: string
  targetKeyword?: string
  pageGoal?: string
  // meta_title_description
  keyword?: string
  pageType?: string
  // faq_generation
  keywords?: string[]
  // regulatory_review
  content?: string
  // image_prompt
  articleTitle?: string
  imageStyle?: string
  // extract_metadata
  articleContent?: string
}

const TEMPLATES: Record<TemplateType, (input: TemplateInput) => string> = {
  seo_article: (i) => `
כתוב מאמר SEO מלא בעברית.

**נושא:** ${i.topic}
**מילת מפתח ראשית:** ${i.mainKeyword}
**מילות מפתח משניות:** ${(i.secondaryKeywords ?? []).join(', ')}
**קהל יעד:** ${i.audience ?? 'קהל כללי'}
**הקשר מוצר:** ${i.productContext ?? 'ללא מוצר ספציפי'}
**אורך מבוקש:** ${i.desiredLength ?? 1200} מילים

פורמט HTML בלבד (ללא markdown):
- <h1> אחד בלבד עם מילת המפתח הראשית
- <h2> לכל חלק ראשי
- <h3> לחלקים משניים
- <p> לפסקאות מלאות
- <strong> להדגשות
- <ul>/<ol> לרשימות
- <div class="faq"> לשאלות נפוצות בסוף

בנה לפי המבנה: פתיח רגשי → הסבר הבעיה → מדע בגובה עיניים → גורמים → פתרונות טבעיים → שילוב עדין של מוצר → סיכום → FAQ.
`,

  keyword_research: (i) => `
בצע מחקר מילות מפתח עבור:
**נישה:** ${i.niche}
**מילת זרע:** ${i.seedKeyword}
**קהל:** ${i.audience ?? 'כללי'}

החזר JSON עם מערך של מילות מפתח, כל אחת עם:
{
  "keywords": [
    {
      "keyword": "",
      "searchIntent": "informational|commercial|transactional|navigational",
      "estimatedDifficulty": "נמוך|בינוני|גבוה",
      "recommendedPageType": "מאמר|דף מוצר|FAQ|קטגוריה",
      "contentAngle": "",
      "suitableFor": "article|product|faq"
    }
  ]
}
`,

  content_optimization: (i) => `
שפר את התוכן הבא לצורך SEO.

**מילת מפתח יעד:** ${i.targetKeyword}
**מטרת הדף:** ${i.pageGoal ?? 'מידע כללי'}

**תוכן קיים:**
${i.existingContent}

החזר JSON:
{
  "seoTitle": "",
  "metaDescription": "",
  "h1": "",
  "suggestedH2s": [],
  "paragraphImprovements": [{"original": "", "improved": ""}],
  "missingContent": [],
  "faqsToAdd": [{"question": "", "answer": ""}],
  "regulatoryWarnings": []
}
`,

  meta_title_description: (i) => `
צור 10 וריאציות של meta title ו-meta description עבור:
**נושא:** ${i.topic}
**מילת מפתח:** ${i.keyword}
**סוג דף:** ${i.pageType ?? 'מאמר'}

החזר JSON:
{
  "variants": [
    {
      "seoTitle": "עד 60 תווים",
      "metaDescription": "עד 155 תווים",
      "angle": "רגשי|מסחרי|אינפורמטיבי|שאלה"
    }
  ]
}
`,

  faq_generation: (i) => `
צור 20 שאלות ותשובות SEO עבור:
**נושא:** ${i.topic}
**מילות מפתח:** ${(i.keywords ?? []).join(', ')}
**קהל:** ${i.audience ?? 'כללי'}

כל תשובה: 2-3 שורות, רגולטורית, טבעית, לא רפואית מדי.

החזר JSON:
{
  "faqs": [
    {"question": "", "answer": ""}
  ]
}
`,

  regulatory_review: (i) => `
בדוק את התוכן הבא לבעיות רגולציה בתחום תוספי תזונה בישראל:

**תוכן לבדיקה:**
${i.content}

החזר JSON:
{
  "issues": [
    {
      "problematicPhrase": "",
      "reason": "",
      "safeAlternative": "",
      "riskLevel": "נמוך|בינוני|גבוה"
    }
  ],
  "overallRisk": "נמוך|בינוני|גבוה",
  "summary": ""
}
`,

  image_prompt: (i) => `
צור prompt לתמונה עבור מאמר SEO על תוספי תזונה.

**כותרת מאמר:** ${i.articleTitle}
**נושא:** ${i.topic}
**קהל יעד:** ${i.audience ?? 'נשים בגיל 35-55'}

כללים לתמונה:
- טבעית, נקייה, אמינה, פרימיום
- ללא טקסט על התמונה
- ללא בקבוק/מוצר ביד
- ללא לפני/אחרי
- ללא תמונות רפואיות/גרפיות
- מתאים למותג תוספי תזונה נשי, טבעי, פרימיום
- סגנון צילום: natural light, lifestyle, high quality
${i.imageStyle ? `- סגנון נוסף: ${i.imageStyle}` : ''}

החזר רק את ה-prompt באנגלית, בשורה אחת, ללא הסבר.
`,

  extract_metadata: (i) => `
חלץ מטאדאטה מהמאמר הבא לצורך פרסום בוורדפרס.

**תוכן המאמר:**
${(i.articleContent ?? '').substring(0, 3000)}...

החזר JSON:
{
  "title": "כותרת H1 מהמאמר",
  "metaTitle": "עד 60 תווים",
  "metaDescription": "עד 155 תווים",
  "slug": "english-slug-with-hyphens",
  "excerpt": "2-3 משפטים",
  "category": "קטגוריה מומלצת",
  "tags": ["תגית1", "תגית2", "תגית3"],
  "imagePromptContext": "תיאור קצר של הנושא הוויזואלי המתאים"
}
`,
}

export function buildPrompt(type: TemplateType, input: TemplateInput): string {
  const builder = TEMPLATES[type]
  if (!builder) throw new Error(`Unknown template type: ${type}`)
  return builder(input).trim()
}
