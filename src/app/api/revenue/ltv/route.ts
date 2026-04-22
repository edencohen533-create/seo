import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { calculateArticleLTV, calculateArticleROI } from '@/modules/revenue-engine'

const schema = z.object({
  siteId: z.string(),
  type: z.enum(['ltv', 'roi']).default('ltv'),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())

    if (body.type === 'roi') {
      const result = await calculateArticleROI(body.siteId)
      return NextResponse.json(result)
    }

    const result = await calculateArticleLTV(body.siteId)
    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
