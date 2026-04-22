import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildSiteModel, getSiteModel } from '@/modules/learning-engine'

const schema = z.object({
  siteId: z.string(),
  action: z.enum(['build', 'get']),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())

    if (body.action === 'build') {
      const model = await buildSiteModel(body.siteId)
      return NextResponse.json(model)
    }

    const model = await getSiteModel(body.siteId)
    return NextResponse.json(model ?? { patterns: [], keyInsights: [] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
