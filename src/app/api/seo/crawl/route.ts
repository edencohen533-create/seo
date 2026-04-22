import { NextRequest, NextResponse } from 'next/server'
import { crawlSite } from '@/modules/seo-audit/crawler'

export async function POST(req: NextRequest) {
  const { siteId, maxPages } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const report = await crawlSite(siteId, maxPages ?? 50)
  return NextResponse.json(report)
}
