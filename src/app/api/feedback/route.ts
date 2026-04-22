import { NextRequest, NextResponse } from 'next/server'
import { runFeedbackLoop } from '@/modules/feedback-loop'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const recommendations = await runFeedbackLoop(siteId)
  return NextResponse.json(recommendations)
}

export async function POST(req: NextRequest) {
  const { siteId } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const recommendations = await runFeedbackLoop(siteId)
  return NextResponse.json(recommendations)
}
