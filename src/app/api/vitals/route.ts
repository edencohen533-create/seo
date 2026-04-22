import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { measureCoreWebVitals, auditSiteWebVitals } from '@/modules/seo-audit/crawler'

const schema = z.object({
  siteId: z.string(),
  url: z.string().optional(),
  device: z.enum(['mobile', 'desktop']).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())

    if (body.url) {
      const result = await measureCoreWebVitals(body.siteId, body.url, body.device ?? 'mobile')
      return NextResponse.json(result)
    }

    const report = await auditSiteWebVitals(body.siteId)
    return NextResponse.json(report)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
