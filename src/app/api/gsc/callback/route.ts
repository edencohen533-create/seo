import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/gsc'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const siteId = req.nextUrl.searchParams.get('state')

  if (!code || !siteId) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const tokens = await exchangeCode(code)

  await prisma.gscToken.upsert({
    where: { siteId },
    create: {
      siteId,
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600000),
    },
    update: {
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600000),
    },
  })

  return NextResponse.redirect(
    new URL(`/settings?connected=true&siteId=${siteId}`, process.env.NEXT_PUBLIC_APP_URL)
  )
}
