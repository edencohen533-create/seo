import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      site: { select: { name: true, domain: true, niche: true, brandTone: true } },
      images: { orderBy: { order: 'asc' } },
      opportunity: { select: { query: true, priority: true, type: true } },
    },
  })
  return NextResponse.json(article)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json()
  const article = await prisma.article.update({
    where: { id: params.id },
    data,
  })
  return NextResponse.json(article)
}
