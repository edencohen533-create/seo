import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { planImages, generateAllImages } from '@/modules/image-engine'
import type { ContentBrief } from '@/modules/content-brief'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: params.id },
  })

  if (!article.content || !article.contentBrief) {
    return NextResponse.json({ error: 'Article not written yet' }, { status: 400 })
  }

  const brief = article.contentBrief as unknown as ContentBrief

  const dummyAltTexts = [
    { position: 'hero', text: `${brief.primaryKeyword} — תמונה ראשית` },
    { position: 'h2-1', text: `${brief.primaryKeyword} — המחשה` },
    { position: 'h2-2', text: `${brief.secondaryKeywords[0] ?? brief.primaryKeyword}` },
    { position: 'h2-3', text: `${brief.secondaryKeywords[1] ?? brief.primaryKeyword}` },
  ]

  await planImages(params.id, article.content, brief.primaryKeyword, dummyAltTexts)
  await generateAllImages(params.id)

  const images = await prisma.articleImage.findMany({
    where: { articleId: params.id },
    orderBy: { order: 'asc' },
  })

  return NextResponse.json({ images })
}
