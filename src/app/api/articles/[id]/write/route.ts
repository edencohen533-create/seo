import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeArticle, saveArticleDraft } from '@/modules/article-writer'
import type { ContentBrief } from '@/modules/content-brief'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: params.id },
    include: { site: true },
  })

  if (!article.contentBrief) {
    return NextResponse.json({ error: 'Brief not generated yet' }, { status: 400 })
  }

  const existingArticles = await prisma.article.findMany({
    where: { siteId: article.siteId, status: 'published', wpPostUrl: { not: null } },
    select: { wpPostUrl: true },
    take: 20,
  })

  const internalLinks = existingArticles
    .map((a) => a.wpPostUrl)
    .filter(Boolean) as string[]

  const output = await writeArticle(
    article.contentBrief as unknown as ContentBrief,
    {
      name: article.site.name,
      domain: article.site.domain,
      niche: article.site.niche,
      brandTone: article.site.brandTone,
    },
    internalLinks
  )

  await saveArticleDraft(params.id, output)

  return NextResponse.json({
    title: output.title,
    slug: output.slug,
    wordCount: output.wordCount,
    metaTitle: output.metaTitle,
    metaDescription: output.metaDescription,
  })
}
