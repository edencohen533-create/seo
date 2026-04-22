/**
 * Intent Engine v2
 *
 * מעבר מ"זיהוי intent בסיסי" ל"ניתוח עומק מלא של כוונת החיפוש":
 * - ניתוח SERP אמיתי (מה גוגל מחזיר עכשיו)
 * - תתי-כוונות בתוך אותה שאילתה
 * - שלב במסע הקנייה (awareness / consideration / decision)
 * - זוויות רגשיות שמניעות CTR
 * - פורמט שגוגל מדרג (רשימה / מדריך / שאלה / סיפור)
 * - פערים ממתחרים ב-SERP
 * - outline שמנצח תוצאות קיימות
 * - hook פתיחה מותאם intent
 * - אופטימיזציה למובייל
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { generateJson, generate } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export interface SubIntent {
  intent: string
  percentage: number
  contentSignal: string
}

export interface EmotionalAngle {
  angle: string
  power: 'high' | 'medium' | 'low'
  example: string
}

export interface CompetitorGap {
  missingTopic: string
  reason: string
  opportunity: string
}

export interface IntentAnalysisResult {
  query: string
  primaryIntent: 'informational' | 'navigational' | 'commercial' | 'transactional'
  subIntents: SubIntent[]
  journeyStage: 'awareness' | 'consideration' | 'decision' | 'retention'
  emotionalAngles: EmotionalAngle[]
  dominantFormat: 'guide' | 'listicle' | 'comparison' | 'faq' | 'how-to' | 'story' | 'review'
  competitorGaps: CompetitorGap[]
  winningOutline: WinningOutlineSection[]
  serpFeatures: string[]
  mobilePriority: boolean
  hookSuggestion: string
  estimatedReadTime: number
  contentDepth: 'shallow' | 'medium' | 'deep' | 'comprehensive'
}

export interface WinningOutlineSection {
  level: 'H2' | 'H3'
  text: string
  whyItWins: string
  wordTarget: number
  mustInclude: string[]
}

export interface SerpResult {
  title: string
  url: string
  snippet: string
  type: 'organic' | 'featured_snippet' | 'people_also_ask' | 'video' | 'image' | 'local'
  position: number
}

async function fetchSerpData(query: string): Promise<SerpResult[]> {
  // Use a SERP scraping approach via Google search
  // In production, replace with a real SERP API (ValueSERP, DataForSEO, etc.)
  try {
    const encoded = encodeURIComponent(query)
    const res = await axios.get(
      `https://www.google.com/search?q=${encoded}&hl=he&gl=il&num=10`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        timeout: 10000,
      }
    )

    const $ = cheerio.load(res.data)
    const results: SerpResult[] = []

    // Organic results
    $('div.g').each((i, el) => {
      const title = $(el).find('h3').first().text().trim()
      const url = $(el).find('a[href^="http"]').first().attr('href') ?? ''
      const snippet = $(el).find('.VwiC3b, .s3v9rd, .IsZvec').first().text().trim()

      if (title && url) {
        results.push({ title, url, snippet, type: 'organic', position: i + 1 })
      }
    })

    // Featured snippet
    const featuredSnippet = $('div.xpdopen, div[data-tts="answers"]').first().text().trim()
    if (featuredSnippet) {
      results.unshift({
        title: 'Featured Snippet',
        url: '',
        snippet: featuredSnippet.substring(0, 300),
        type: 'featured_snippet',
        position: 0,
      })
    }

    // People also ask
    $('div[jsname="yEVEwb"] span').each((i, el) => {
      const q = $(el).text().trim()
      if (q && q.length > 5 && q.length < 100) {
        results.push({ title: q, url: '', snippet: '', type: 'people_also_ask', position: i })
      }
    })

    return results.slice(0, 15)
  } catch {
    // Fallback: return empty SERP (Claude will work with keyword alone)
    return []
  }
}

export async function analyzeIntent(
  query: string,
  siteId: string
): Promise<IntentAnalysisResult> {
  const serpResults = await fetchSerpData(query)

  const serpContext = serpResults.length > 0
    ? serpResults
        .filter((r) => r.type === 'organic' || r.type === 'featured_snippet')
        .slice(0, 8)
        .map((r, i) => `${i + 1}. [${r.type}] "${r.title}" — ${r.snippet.substring(0, 120)}`)
        .join('\n')
    : 'לא נמצאו תוצאות SERP'

  const paaQuestions = serpResults
    .filter((r) => r.type === 'people_also_ask')
    .map((r) => r.title)
    .join(', ')

  const serpFeatures = Array.from(
    new Set(serpResults.map((r) => r.type).filter((t) => t !== 'organic'))
  )

  const prompt = `
אתה מומחה SEO ברמה עולמית. נתח לעומק את כוונת החיפוש של השאילתה הבאה.

**שאילתה:** "${query}"

**תוצאות SERP נוכחיות:**
${serpContext}

**שאלות People Also Ask:**
${paaQuestions || 'לא זוהו'}

**תכונות SERP שזוהו:** ${serpFeatures.join(', ') || 'תוצאות אורגניות רגילות'}

ניתוח נדרש — החזר JSON מדויק:
{
  "primaryIntent": "informational" | "navigational" | "commercial" | "transactional",
  "subIntents": [
    {
      "intent": "תת-כוונה ספציפית",
      "percentage": 35,
      "contentSignal": "מה תוכן צריך לכלול כדי לספק אותה"
    }
  ],
  "journeyStage": "awareness" | "consideration" | "decision" | "retention",
  "emotionalAngles": [
    {
      "angle": "פחד מ... / רצון ל... / צורך ב...",
      "power": "high" | "medium" | "low",
      "example": "דוגמה לכותרת שמשתמשת בזווית זו"
    }
  ],
  "dominantFormat": "guide" | "listicle" | "comparison" | "faq" | "how-to" | "story" | "review",
  "competitorGaps": [
    {
      "missingTopic": "נושא חסר בתוצאות SERP",
      "reason": "למה מתחרים לא מכסים אותו",
      "opportunity": "איך לנצל את הפער"
    }
  ],
  "winningOutline": [
    {
      "level": "H2",
      "text": "כותרת H2 שתנצח את המתחרים",
      "whyItWins": "למה זה עדיף על מה שיש",
      "wordTarget": 250,
      "mustInclude": ["נקודה קריטית 1", "נקודה קריטית 2"]
    }
  ],
  "serpFeatures": ${JSON.stringify(serpFeatures)},
  "mobilePriority": true | false,
  "hookSuggestion": "פסקת פתיחה מנצחת בדיוק 3 משפטים שתואמת את הכוונה ותגרום לגלילה",
  "estimatedReadTime": 8,
  "contentDepth": "shallow" | "medium" | "deep" | "comprehensive"
}

כללים:
- subIntents: בין 3-5, הסכום חייב להיות 100%
- emotionalAngles: בין 3-4, מהגבוה לנמוך
- competitorGaps: בין 3-5 פערים אמיתיים ומנצלים
- winningOutline: מינימום 6 H2, כל H2 עם wordTarget ו-mustInclude
- hookSuggestion: בעברית, אנושי, לא מלאכותי, מותאם intent
`

  const analysis = await generateJson<IntentAnalysisResult>(prompt, {
    model: 'claude-sonnet-4-6',
    maxTokens: 4000,
  })

  // Save to DB
  await prisma.intentAnalysis.upsert({
    where: { siteId_query: { siteId, query } },
    create: {
      siteId,
      query,
      primaryIntent: analysis.primaryIntent,
      subIntents: analysis.subIntents.map((s) => s.intent),
      journeyStage: analysis.journeyStage,
      emotionalAngles: analysis.emotionalAngles as object,
      dominantFormat: analysis.dominantFormat,
      competitorGaps: analysis.competitorGaps as object,
      winningOutline: analysis.winningOutline as object,
      serpFeatures: analysis.serpFeatures,
      mobilePriority: analysis.mobilePriority,
      hookSuggestion: analysis.hookSuggestion,
    },
    update: {
      primaryIntent: analysis.primaryIntent,
      subIntents: analysis.subIntents.map((s) => s.intent),
      journeyStage: analysis.journeyStage,
      emotionalAngles: analysis.emotionalAngles as object,
      dominantFormat: analysis.dominantFormat,
      competitorGaps: analysis.competitorGaps as object,
      winningOutline: analysis.winningOutline as object,
      serpFeatures: analysis.serpFeatures,
      mobilePriority: analysis.mobilePriority,
      hookSuggestion: analysis.hookSuggestion,
    },
  })

  return { ...analysis, query }
}

export async function enrichBriefWithIntent(
  brief: Record<string, unknown>,
  intentAnalysis: IntentAnalysisResult
): Promise<Record<string, unknown>> {
  return {
    ...brief,
    searchIntent: intentAnalysis.primaryIntent,
    articleType: intentAnalysis.dominantFormat,
    h1: intentAnalysis.winningOutline[0]?.text ?? brief.h1,
    structure: intentAnalysis.winningOutline.map((s) => ({
      level: s.level,
      text: s.text,
      keyPoints: s.mustInclude,
      wordTarget: s.wordTarget,
    })),
    hookSuggestion: intentAnalysis.hookSuggestion,
    emotionalAngles: intentAnalysis.emotionalAngles,
    competitorGaps: intentAnalysis.competitorGaps,
    journeyStage: intentAnalysis.journeyStage,
    contentDepth: intentAnalysis.contentDepth,
  }
}
