import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callClaudeText } from '@/lib/ai/callClaude'
import { generateImage } from '@/lib/images'

export async function POST(req: NextRequest) {
  const { articleId, currentImagePrompt, feedback, topic, audience, brandStyle } = await req.json()

  if (!articleId || !feedback) {
    return NextResponse.json({ error: 'articleId and feedback are required' }, { status: 400 })
  }

  const logs: string[] = []

  // Build improved prompt based on feedback
  const improvedPrompt = await callClaudeText('image_prompt', {
    topic: topic ?? '',
    audience: audience ?? 'נשים בגיל 35-55',
    articleTitle: `שיפור לפי משוב: ${feedback}`,
    imageStyle: `
שפר את ה-prompt הקיים: "${currentImagePrompt}"
בהתאם להערות: "${feedback}"
${brandStyle ? `סגנון מותג: ${brandStyle}` : ''}
שמור על: טבעי, פרימיום, ללא טקסט, ללא לפני/אחרי, ללא תמונות רפואיות.
    `.trim(),
  })
  logs.push('improved_prompt_generated')

  // Generate new image
  let newImageUrl: string | null = null
  try {
    const result = await generateImage({ prompt: improvedPrompt, width: 1200, height: 630 })
    newImageUrl = result.url
    logs.push('new_image_generated')
  } catch (err) {
    console.warn('[regenerate-image] Failed:', err)
    logs.push('image_generation_failed')
    return NextResponse.json({ success: false, error: 'Image generation failed', logs }, { status: 500 })
  }

  // Append to imageHistory
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { imageHistory: true } })
  const existingHistory = (article?.imageHistory as { url: string; prompt: string; createdAt: string }[] | null) ?? []

  await prisma.article.update({
    where: { id: articleId },
    data: {
      imagePrompt: improvedPrompt,
      imageHistory: [
        ...existingHistory,
        { url: newImageUrl, prompt: improvedPrompt, createdAt: new Date().toISOString() },
      ],
    },
  })
  logs.push('history_updated')

  return NextResponse.json({
    success: true,
    newImageUrl,
    newImagePrompt: improvedPrompt,
    logs,
  })
}
