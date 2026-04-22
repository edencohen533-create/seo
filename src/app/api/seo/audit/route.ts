import { NextRequest, NextResponse } from 'next/server'
import { auditWithAiRecommendations } from '@/modules/seo-audit'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const result = await auditWithAiRecommendations(url)
  return NextResponse.json(result)
}
