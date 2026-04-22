import { NextRequest, NextResponse } from 'next/server'
import { getRevenueDashboard, syncWooOrders, getRevenueRecommendations } from '@/modules/revenue-engine'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const [dashboard, recommendations] = await Promise.all([
    getRevenueDashboard(siteId),
    getRevenueRecommendations(siteId),
  ])

  return NextResponse.json({ dashboard, recommendations })
}

export async function POST(req: NextRequest) {
  const { siteId, wooKey, wooSecret, days } = await req.json()
  if (!siteId || !wooKey || !wooSecret) {
    return NextResponse.json({ error: 'siteId, wooKey, wooSecret required' }, { status: 400 })
  }

  const synced = await syncWooOrders(siteId, wooKey, wooSecret, days ?? 90)
  return NextResponse.json({ success: true, synced })
}
