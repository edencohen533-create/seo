import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateContentBrief, generateBriefForKeyword } from '@/modules/content-brief'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: params.id },
    include: { site: true, opportunity: true },
  })

  let brief
  if (article.opportunityId) {
    brief = await generateContentBrief(article.opportunityId, article.site.niche ?? '')
  } else {
    brief = await generateBriefForKeyword(
      article.primaryKeyword ?? '',
      `${article.site.name} — ${article.site.niche ?? ''}`
    )
  }

  await prisma.article.update({
    where: { id: params.id },
    data: {
      contentBrief: brief as object,
      primaryKeyword: brief.primaryKeyword as string,
      secondaryKeywords: brief.secondaryKeywords as string[],
      status: 'writing',
    },
  })

  return NextResponse.json({ brief })
}
