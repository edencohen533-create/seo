import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gsc'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const url = getAuthUrl()
  const stateUrl = new URL(url)
  stateUrl.searchParams.set('state', siteId)

  return NextResponse.redirect(stateUrl.toString())
}
