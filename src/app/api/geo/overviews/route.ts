import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { findAIOverviewOpportunities, optimizeForAIOverview } from '@/modules/geo-engine'

const schema = z.object({
  siteId: z.string(),
  articleId: z.string().optional(),
  query: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())

    if (body.articleId && body.query) {
      const snippet = await optimizeForAIOverview(body.articleId, body.query)
      return NextResponse.json({ snippet })
    }

    const opportunities = await findAIOverviewOpportunities(body.siteId)
    return NextResponse.json(opportunities)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
