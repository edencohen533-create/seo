import { NextRequest, NextResponse } from 'next/server'
import { optimizeForAiSearch } from '@/modules/geo-engine'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const articleId = req.nextUrl.searchParams.get('articleId')
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  const existing = await prisma.geoOptimization.findUnique({ where: { articleId } })
  if (existing) return NextResponse.json(existing)

  const result = await optimizeForAiSearch(articleId)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { articleId } = await req.json()
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  const result = await optimizeForAiSearch(articleId)
  return NextResponse.json(result)
}
