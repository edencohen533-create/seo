import { NextRequest, NextResponse } from 'next/server'
import { buildLinkGraph, suggestLinkInjections } from '@/modules/internal-links/link-graph'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const suggestions = await suggestLinkInjections(siteId)
  return NextResponse.json({ suggestions })
}

export async function POST(req: NextRequest) {
  const { siteId } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const graph = await buildLinkGraph(siteId)
  return NextResponse.json(graph)
}
