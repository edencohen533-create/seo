import { NextRequest, NextResponse } from 'next/server'
import { buildTopicMap, getTopicMap, getNextToWrite } from '@/modules/topical-authority'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const map = await getTopicMap(siteId)
  const nextToWrite = await getNextToWrite(siteId, 5)
  return NextResponse.json({ map, nextToWrite })
}

export async function POST(req: NextRequest) {
  const { siteId } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const result = await buildTopicMap(siteId)
  return NextResponse.json(result)
}
