import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { subDays, format } from 'date-fns'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '28')

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const since = subDays(new Date(), days)

  const [totals, topQueries, topPages] = await Promise.all([
    prisma.performance.aggregate({
      where: { siteId, date: { gte: since } },
      _sum: { impressions: true, clicks: true },
      _avg: { ctr: true, position: true },
    }),
    prisma.performance.groupBy({
      by: ['query'],
      where: { siteId, date: { gte: since } },
      _sum: { impressions: true, clicks: true },
      orderBy: { _sum: { clicks: 'desc' } },
      take: 10,
    }),
    prisma.performance.groupBy({
      by: ['pageId'],
      where: { siteId, date: { gte: since } },
      _sum: { impressions: true, clicks: true },
      orderBy: { _sum: { clicks: 'desc' } },
      take: 10,
    }),
  ])

  return NextResponse.json({
    totals: {
      impressions: totals._sum.impressions ?? 0,
      clicks: totals._sum.clicks ?? 0,
      avgCtr: totals._avg.ctr ?? 0,
      avgPosition: totals._avg.position ?? 0,
    },
    topQueries,
    topPages,
  })
}
