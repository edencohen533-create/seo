import { NextRequest, NextResponse } from 'next/server'
import { diagnoseContent, applySurgicalFix, runFullRefresh } from '@/modules/refresh-engine'
import type { SurgicalRecommendation } from '@/modules/refresh-engine'

export async function GET(req: NextRequest) {
  const articleId = req.nextUrl.searchParams.get('articleId')
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  const diagnosis = await diagnoseContent(articleId)
  return NextResponse.json(diagnosis)
}

export async function POST(req: NextRequest) {
  const { articleId, action, recommendation } = await req.json()
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  if (action === 'full_refresh') {
    const result = await runFullRefresh(articleId)
    return NextResponse.json(result)
  }

  if (action === 'apply_fix' && recommendation) {
    const updated = await applySurgicalFix(articleId, recommendation as SurgicalRecommendation)
    return NextResponse.json({ success: true, contentLength: updated.length })
  }

  const diagnosis = await diagnoseContent(articleId)
  return NextResponse.json(diagnosis)
}
