import { NextRequest, NextResponse } from 'next/server'
import { scanOpportunities } from '@/modules/opportunity-engine'

export async function POST(req: NextRequest) {
  const { siteId } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const created = await scanOpportunities(siteId)
  return NextResponse.json({ success: true, created })
}
