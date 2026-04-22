import { NextRequest, NextResponse } from 'next/server'
import { analyzeIntent } from '@/modules/intent-engine'

export async function POST(req: NextRequest) {
  const { query, siteId } = await req.json()
  if (!query || !siteId) return NextResponse.json({ error: 'query + siteId required' }, { status: 400 })

  const result = await analyzeIntent(query, siteId)
  return NextResponse.json(result)
}

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  const query = req.nextUrl.searchParams.get('query')
  if (!query || !siteId) return NextResponse.json({ error: 'query + siteId required' }, { status: 400 })

  const { prisma } = await import('@/lib/prisma')
  const existing = await prisma.intentAnalysis.findUnique({
    where: { siteId_query: { siteId, query } },
  })

  if (existing) return NextResponse.json(existing)
  const result = await analyzeIntent(query, siteId)
  return NextResponse.json(result)
}
