import { NextRequest, NextResponse } from 'next/server'
import { callClaudeText } from '@/lib/ai/callClaude'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { topic, mainKeyword, secondaryKeywords, audience, productContext, desiredLength } = body

  if (!topic || !mainKeyword) {
    return NextResponse.json({ error: 'topic and mainKeyword are required' }, { status: 400 })
  }

  const content = await callClaudeText('seo_article', {
    topic,
    mainKeyword,
    secondaryKeywords,
    audience,
    productContext,
    desiredLength,
  })

  return NextResponse.json({ content })
}
