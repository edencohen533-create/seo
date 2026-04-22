import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { snapshotDailyPerformance, generateBIReport, getPageHistory } from '@/modules/data-layer'

const schema = z.object({
  siteId: z.string(),
  action: z.enum(['snapshot', 'bi_report', 'page_history']),
  url: z.string().optional(),
  months: z.number().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())

    if (body.action === 'snapshot') {
      const result = await snapshotDailyPerformance(body.siteId)
      return NextResponse.json(result)
    }

    if (body.action === 'bi_report') {
      const result = await generateBIReport(body.siteId)
      return NextResponse.json(result)
    }

    if (body.action === 'page_history') {
      if (!body.url) return NextResponse.json({ error: 'url required' }, { status: 400 })
      const result = await getPageHistory(body.siteId, body.url, body.months ?? 6)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
