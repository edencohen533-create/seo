import { NextRequest, NextResponse } from 'next/server'
import { generateTitleVariants, applyWinningTitle, updateVariantPerformance } from '@/modules/ctr-engine'

export async function POST(req: NextRequest) {
  const { articleId, action, variantId, query, siteId } = await req.json()
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  if (action === 'apply' && variantId) {
    await applyWinningTitle(articleId, variantId)
    return NextResponse.json({ success: true })
  }

  if (action === 'measure' && query && siteId) {
    await updateVariantPerformance(articleId, query, siteId)
    return NextResponse.json({ success: true })
  }

  const result = await generateTitleVariants(articleId)
  return NextResponse.json(result)
}

export async function GET(req: NextRequest) {
  const articleId = req.nextUrl.searchParams.get('articleId')
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  const { prisma } = await import('@/lib/prisma')
  const variants = await prisma.titleVariant.findMany({
    where: { articleId },
    orderBy: { predictedCtr: 'desc' },
  })
  return NextResponse.json(variants)
}
