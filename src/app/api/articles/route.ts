import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  const status = req.nextUrl.searchParams.get('status')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50')

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const articles = await prisma.article.findMany({
    where: { siteId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      images: { select: { id: true, type: true, url: true } },
      opportunity: { select: { query: true, priority: true } },
    },
  })

  return NextResponse.json(articles)
}

export async function POST(req: NextRequest) {
  const { siteId, opportunityId, primaryKeyword } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const article = await prisma.article.create({
    data: {
      siteId,
      opportunityId: opportunityId ?? null,
      primaryKeyword: primaryKeyword ?? null,
      status: 'pending',
    },
  })

  if (opportunityId) {
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: 'in_progress' },
    })
  }

  return NextResponse.json(article, { status: 201 })
}
