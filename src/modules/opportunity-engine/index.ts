import { prisma } from '@/lib/prisma'
import { fetchSearchAnalytics, GscRow } from '@/lib/gsc'
import { subDays, format } from 'date-fns'

export type OpportunityType =
  | 'new_article'
  | 'upgrade_article'
  | 'ctr_improvement'
  | 'internal_links'
  | 'declining_page'

export interface OpportunityCandidate {
  query: string
  page: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  type: OpportunityType
  priority: number
  reason: string
}

export async function scanOpportunities(siteId: string): Promise<number> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } })

  const endDate = format(new Date(), 'yyyy-MM-dd')
  const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd')

  const rows = await fetchSearchAnalytics(siteId, site.gscSiteUrl, {
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: 10000,
  })

  await prisma.performance.deleteMany({
    where: { siteId, date: { gte: new Date(startDate) } },
  })

  for (const row of rows) {
    let page = await prisma.page.findFirst({ where: { siteId, url: row.page } })
    if (!page) {
      page = await prisma.page.create({
        data: { siteId, url: row.page, title: '' },
      })
    }

    await prisma.performance.upsert({
      where: { siteId_query_date: { siteId, query: row.query, date: new Date(endDate) } },
      create: {
        siteId,
        pageId: page.id,
        query: row.query,
        date: new Date(endDate),
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        position: row.position,
      },
      update: {
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        position: row.position,
      },
    })
  }

  const candidates = identifyOpportunities(rows)

  let created = 0
  for (const candidate of candidates) {
    const existing = await prisma.opportunity.findFirst({
      where: { siteId, query: candidate.query, status: { in: ['pending', 'in_progress'] } },
    })
    if (existing) continue

    await prisma.opportunity.create({
      data: {
        siteId,
        type: candidate.type,
        priority: candidate.priority,
        query: candidate.query,
        impressions: candidate.impressions,
        clicks: candidate.clicks,
        ctr: candidate.ctr,
        position: candidate.position,
        notes: candidate.reason,
      },
    })
    created++
  }

  return created
}

function identifyOpportunities(rows: GscRow[]): OpportunityCandidate[] {
  const pageMap = new Map<string, GscRow[]>()
  for (const row of rows) {
    const existing = pageMap.get(row.page) ?? []
    existing.push(row)
    pageMap.set(row.page, existing)
  }

  const candidates: OpportunityCandidate[] = []

  for (const row of rows) {
    if (row.impressions < 10) continue

    if (row.position >= 5 && row.position <= 20 && row.impressions >= 100) {
      candidates.push({
        ...row,
        type: 'upgrade_article',
        priority: calcPriority(row, 'quick_win'),
        reason: `מיקום ${row.position.toFixed(1)} — פוטנציאל לעמוד ראשון עם שיפור תוכן`,
      })
      continue
    }

    if (row.impressions >= 200 && row.ctr < 0.02) {
      candidates.push({
        ...row,
        type: 'ctr_improvement',
        priority: calcPriority(row, 'ctr'),
        reason: `CTR נמוך (${(row.ctr * 100).toFixed(1)}%) למרות ${row.impressions} חשיפות`,
      })
      continue
    }

    if (row.position > 20 && row.impressions >= 500 && row.page === '') {
      candidates.push({
        ...row,
        type: 'new_article',
        priority: calcPriority(row, 'new'),
        reason: `שאילתה בעלת נפח גבוה (${row.impressions} חשיפות) ללא עמוד מתאים`,
      })
    }
  }

  const queryMap = new Map<string, GscRow[]>()
  for (const row of rows) {
    const existing = queryMap.get(row.query) ?? []
    existing.push(row)
    queryMap.set(row.query, existing)
  }

  for (const [query, queryRows] of queryMap.entries()) {
    if (queryRows.length > 2) {
      const sorted = queryRows.sort((a, b) => b.impressions - a.impressions)
      const top = sorted[0]
      candidates.push({
        ...top,
        type: 'internal_links',
        priority: calcPriority(top, 'cannibalization') * 0.7,
        reason: `קניבליזציה: ${queryRows.length} עמודים מתחרים על "${query}"`,
      })
    }
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 100)
}

type PriorityMode = 'quick_win' | 'ctr' | 'new' | 'cannibalization'

function calcPriority(row: GscRow, mode: PriorityMode): number {
  const impressionScore = Math.min(row.impressions / 1000, 1) * 30
  const ctrScore = mode === 'ctr' ? (1 - row.ctr) * 20 : 10
  const positionScore = mode === 'quick_win'
    ? (1 - (row.position - 5) / 15) * 40
    : mode === 'new'
    ? 20
    : 15
  const clickScore = Math.min(row.clicks / 100, 1) * 10

  return Math.round(impressionScore + ctrScore + positionScore + clickScore)
}

export async function getTopOpportunities(siteId: string, limit = 20) {
  return prisma.opportunity.findMany({
    where: { siteId, status: 'pending' },
    orderBy: { priority: 'desc' },
    take: limit,
    include: { keyword: true },
  })
}
