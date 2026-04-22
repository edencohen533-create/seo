import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50')

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const opportunities = await prisma.opportunity.findMany({
    where: { siteId, status },
    orderBy: { priority: 'desc' },
    take: limit,
    include: { articles: { select: { id: true, status: true } } },
  })

  return NextResponse.json(opportunities)
}
