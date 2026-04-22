import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const SiteSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  wpUrl: z.string().url(),
  wpUser: z.string().min(1),
  wpAppPassword: z.string().min(1),
  gscSiteUrl: z.string().min(1),
  niche: z.string().optional(),
  brandTone: z.string().optional(),
})

export async function GET() {
  const sites = await prisma.site.findMany({
    include: { _count: { select: { articles: true, opportunities: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(sites)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const data = SiteSchema.parse(body)

  const site = await prisma.site.create({ data })
  return NextResponse.json(site, { status: 201 })
}
