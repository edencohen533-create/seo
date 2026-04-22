import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from './prisma'

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl() {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/webmasters',
    ],
    prompt: 'consent',
  })
}

export async function exchangeCode(code: string) {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  return tokens
}

export async function getAuthenticatedClient(siteId: string): Promise<OAuth2Client> {
  const tokenRecord = await prisma.gscToken.findUnique({ where: { siteId } })
  if (!tokenRecord) throw new Error('GSC not connected for this site')

  const client = createOAuthClient()
  client.setCredentials({
    access_token: tokenRecord.accessToken,
    refresh_token: tokenRecord.refreshToken,
    expiry_date: tokenRecord.expiresAt.getTime(),
  })

  client.on('tokens', async (tokens) => {
    if (tokens.refresh_token || tokens.access_token) {
      await prisma.gscToken.update({
        where: { siteId },
        data: {
          accessToken: tokens.access_token ?? tokenRecord.accessToken,
          refreshToken: tokens.refresh_token ?? tokenRecord.refreshToken,
          expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        },
      })
    }
  })

  return client
}

export interface GscRow {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function fetchSearchAnalytics(
  siteId: string,
  gscSiteUrl: string,
  options: {
    startDate: string
    endDate: string
    dimensions?: string[]
    rowLimit?: number
  }
): Promise<GscRow[]> {
  const auth = await getAuthenticatedClient(siteId)
  const webmasters = google.webmasters({ version: 'v3', auth })

  const rows: GscRow[] = []
  let startRow = 0
  const rowLimit = options.rowLimit ?? 5000
  const dimensions = options.dimensions ?? ['query', 'page']

  while (true) {
    const res = await webmasters.searchanalytics.query({
      siteUrl: gscSiteUrl,
      requestBody: {
        startDate: options.startDate,
        endDate: options.endDate,
        dimensions,
        rowLimit: Math.min(rowLimit - rows.length, 5000),
        startRow,
      },
    })

    const batch = res.data.rows ?? []
    for (const row of batch) {
      rows.push({
        query: row.keys?.[0] ?? '',
        page: row.keys?.[1] ?? '',
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      })
    }

    if (batch.length < 5000 || rows.length >= rowLimit) break
    startRow += batch.length
  }

  return rows
}

export async function fetchTopPages(siteId: string, gscSiteUrl: string, days = 90): Promise<GscRow[]> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  return fetchSearchAnalytics(siteId, gscSiteUrl, {
    startDate,
    endDate,
    dimensions: ['page', 'query'],
    rowLimit: 10000,
  })
}

export async function fetchSitesList(siteId: string): Promise<string[]> {
  const auth = await getAuthenticatedClient(siteId)
  const webmasters = google.webmasters({ version: 'v3', auth })
  const res = await webmasters.sites.list()
  return (res.data.siteEntry ?? []).map((s) => s.siteUrl ?? '').filter(Boolean)
}
