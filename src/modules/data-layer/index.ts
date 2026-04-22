/**
 * Data Layer — Historical GSC Storage + Change Tracking + BI
 *
 * Beyond Google's 16-month limit: we snapshot daily performance per page.
 * Every content change is logged with before/after for attribution analysis.
 * BI layer aggregates patterns: what word counts, intents, angles win.
 */

import { prisma } from '@/lib/prisma'
import { fetchSearchAnalytics, fetchTopPages } from '@/lib/gsc'
import { generateJson } from '@/lib/claude'
import { format, subDays, startOfDay } from 'date-fns'

export interface SnapshotResult {
  siteId: string
  date: string
  pagesSnapshotted: number
  totalImpressions: number
  totalClicks: number
}

export interface ChangeRecord {
  articleId: string
  changeType: 'title' | 'content' | 'meta_description' | 'structure' | 'keyword'
  field: string
  valueBefore: string
  valueAfter: string
  metadata?: Record<string, unknown>
}

export interface BIReport {
  siteId: string
  date: string
  wordCountAnalysis: { range: string; avgCtr: number; avgPosition: number; count: number }[]
  intentAnalysis: { intent: string; avgCtr: number; avgPosition: number; count: number }[]
  titleLengthAnalysis: { range: string; avgCtr: number; count: number }[]
  topicCoverage: { pillar: string; coverageScore: number; avgPosition: number }[]
  publishingCadenceImpact: { articlesPerMonth: number; avgPositionGain: number }[]
  insights: string[]
}

export async function snapshotDailyPerformance(siteId: string): Promise<SnapshotResult> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    select: { gscSiteUrl: true },
  })

  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  const rows = await fetchSearchAnalytics(siteId, site.gscSiteUrl, {
    startDate: yesterday,
    endDate: yesterday,
    dimensions: ['page'],
    rowLimit: 500,
  })

  let snapped = 0
  for (const row of rows) {
    const page = await prisma.page.findFirst({
      where: { siteId, url: { contains: row.page.replace(/^https?:\/\/[^/]+/, '') } },
    })

    await prisma.performanceSnapshot.upsert({
      where: {
        siteId_url_snapshotDate_period: {
          siteId,
          url: row.page,
          snapshotDate: new Date(yesterday),
          period: 'daily',
        },
      },
      create: {
        siteId,
        pageId: page?.id,
        url: row.page,
        snapshotDate: new Date(yesterday),
        period: 'daily',
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
    snapped++
  }

  // Weekly rollup every Sunday
  if (new Date().getDay() === 0) {
    await rollupWeeklySnapshots(siteId)
  }

  return {
    siteId,
    date: yesterday,
    pagesSnapshotted: snapped,
    totalImpressions: rows.reduce((s, r) => s + r.impressions, 0),
    totalClicks: rows.reduce((s, r) => s + r.clicks, 0),
  }
}

async function rollupWeeklySnapshots(siteId: string) {
  const weekAgo = subDays(new Date(), 7)
  const dailySnapshots = await prisma.performanceSnapshot.groupBy({
    by: ['url', 'pageId'],
    where: { siteId, period: 'daily', snapshotDate: { gte: weekAgo } },
    _sum: { impressions: true, clicks: true },
    _avg: { position: true, ctr: true },
  })

  for (const s of dailySnapshots) {
    await prisma.performanceSnapshot.upsert({
      where: {
        siteId_url_snapshotDate_period: {
          siteId,
          url: s.url,
          snapshotDate: startOfDay(weekAgo),
          period: 'weekly',
        },
      },
      create: {
        siteId,
        pageId: s.pageId,
        url: s.url,
        snapshotDate: startOfDay(weekAgo),
        period: 'weekly',
        impressions: s._sum.impressions ?? 0,
        clicks: s._sum.clicks ?? 0,
        ctr: s._avg.ctr ?? 0,
        position: s._avg.position ?? 0,
      },
      update: {
        impressions: s._sum.impressions ?? 0,
        clicks: s._sum.clicks ?? 0,
        ctr: s._avg.ctr ?? 0,
        position: s._avg.position ?? 0,
      },
    })
  }
}

export async function trackChange(siteId: string, change: ChangeRecord): Promise<void> {
  await prisma.changeLog.create({
    data: {
      siteId,
      articleId: change.articleId,
      changeType: change.changeType,
      field: change.field,
      valueBefore: change.valueBefore,
      valueAfter: change.valueAfter,
      metadata: change.metadata as object,
    },
  })
}

export async function measureChangeImpact(
  changeLogId: string,
  windowDays = 14
): Promise<{ ctrChange: number; positionChange: number; clicksChange: number }> {
  const log = await prisma.changeLog.findUniqueOrThrow({ where: { id: changeLogId } })
  if (!log.articleId) return { ctrChange: 0, positionChange: 0, clicksChange: 0 }

  const article = await prisma.article.findUnique({
    where: { id: log.articleId },
    select: { wpPostUrl: true },
  })

  if (!article?.wpPostUrl) return { ctrChange: 0, positionChange: 0, clicksChange: 0 }

  const changeDate = log.createdAt
  const before = await prisma.performanceSnapshot.findMany({
    where: {
      siteId: log.siteId,
      url: { contains: article.wpPostUrl },
      snapshotDate: {
        gte: subDays(changeDate, windowDays),
        lt: changeDate,
      },
    },
  })

  const after = await prisma.performanceSnapshot.findMany({
    where: {
      siteId: log.siteId,
      url: { contains: article.wpPostUrl },
      snapshotDate: {
        gte: changeDate,
        lt: new Date(changeDate.getTime() + windowDays * 86400000),
      },
    },
  })

  const avgBefore = average(before, 'ctr')
  const avgAfter = average(after, 'ctr')
  const posBefore = average(before, 'position')
  const posAfter = average(after, 'position')
  const clicksBefore = sum(before, 'clicks')
  const clicksAfter = sum(after, 'clicks')

  const impact = {
    ctrChange: avgBefore > 0 ? ((avgAfter - avgBefore) / avgBefore) * 100 : 0,
    positionChange: posBefore - posAfter,
    clicksChange: clicksBefore > 0 ? ((clicksAfter - clicksBefore) / clicksBefore) * 100 : 0,
  }

  await prisma.changeLog.update({
    where: { id: changeLogId },
    data: {
      performanceImpact: impact as object,
      measuredAt: new Date(),
    },
  })

  return impact
}

function average(rows: { ctr?: number; position?: number; clicks?: number; impressions?: number }[], field: 'ctr' | 'position'): number {
  if (rows.length === 0) return 0
  return rows.reduce((s, r) => s + (r[field] ?? 0), 0) / rows.length
}

function sum(rows: { clicks?: number; impressions?: number }[], field: 'clicks' | 'impressions'): number {
  return rows.reduce((s, r) => s + (r[field] ?? 0), 0)
}

export async function generateBIReport(siteId: string): Promise<BIReport> {
  const today = format(new Date(), 'yyyy-MM-dd')

  // Pull all published articles with their performance
  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published' },
    select: {
      id: true,
      title: true,
      wordCount: true,
      primaryKeyword: true,
      wpPostUrl: true,
      contentBrief: true,
      publishedAt: true,
    },
  })

  // Get performance snapshots for each article
  const snapshots = await prisma.performanceSnapshot.findMany({
    where: {
      siteId,
      snapshotDate: { gte: subDays(new Date(), 30) },
      period: 'daily',
    },
  })

  const urlPerf: Map<string, { impressions: number; clicks: number; ctr: number; position: number; count: number }> = new Map()
  for (const snap of snapshots) {
    const existing = urlPerf.get(snap.url) ?? { impressions: 0, clicks: 0, ctr: 0, position: 0, count: 0 }
    urlPerf.set(snap.url, {
      impressions: existing.impressions + snap.impressions,
      clicks: existing.clicks + snap.clicks,
      ctr: existing.ctr + snap.ctr,
      position: existing.position + snap.position,
      count: existing.count + 1,
    })
  }

  // Word count analysis
  const wcBuckets: Record<string, { ctrSum: number; posSum: number; count: number }> = {}
  for (const art of articles) {
    const wc = art.wordCount ?? 0
    const bucket = wc < 500 ? '<500' : wc < 1000 ? '500-1000' : wc < 2000 ? '1000-2000' : wc < 3000 ? '2000-3000' : '3000+'
    const perf = urlPerf.get(art.wpPostUrl ?? '')
    if (!perf || perf.count === 0) continue
    const b = wcBuckets[bucket] ?? { ctrSum: 0, posSum: 0, count: 0 }
    wcBuckets[bucket] = {
      ctrSum: b.ctrSum + (perf.ctr / perf.count),
      posSum: b.posSum + (perf.position / perf.count),
      count: b.count + 1,
    }
  }

  const wordCountAnalysis = Object.entries(wcBuckets).map(([range, data]) => ({
    range,
    avgCtr: data.count > 0 ? (data.ctrSum / data.count) * 100 : 0,
    avgPosition: data.count > 0 ? data.posSum / data.count : 0,
    count: data.count,
  }))

  // Title length analysis
  const titleBuckets: Record<string, { ctrSum: number; count: number }> = {}
  for (const art of articles) {
    const len = (art.title ?? '').length
    const bucket = len < 40 ? '<40' : len < 50 ? '40-50' : len < 60 ? '50-60' : '60+'
    const perf = urlPerf.get(art.wpPostUrl ?? '')
    if (!perf || perf.count === 0) continue
    const b = titleBuckets[bucket] ?? { ctrSum: 0, count: 0 }
    titleBuckets[bucket] = { ctrSum: b.ctrSum + (perf.ctr / perf.count), count: b.count + 1 }
  }

  const titleLengthAnalysis = Object.entries(titleBuckets).map(([range, data]) => ({
    range,
    avgCtr: data.count > 0 ? (data.ctrSum / data.count) * 100 : 0,
    count: data.count,
  }))

  const report: BIReport = {
    siteId,
    date: today,
    wordCountAnalysis,
    intentAnalysis: [],
    titleLengthAnalysis,
    topicCoverage: [],
    publishingCadenceImpact: [],
    insights: [],
  }

  // Claude generates insights from patterns
  if (articles.length >= 5) {
    const insightPrompt = `
אתה אנליסט SEO. בדוק נתוני ביצועים ותן insights.

**ניתוח לפי אורך מאמר:**
${wordCountAnalysis.map((w) => `- ${w.range} מילים: CTR ${w.avgCtr.toFixed(2)}%, מיקום ${w.avgPosition.toFixed(1)}, ${w.count} מאמרים`).join('\n')}

**ניתוח לפי אורך כותרת:**
${titleLengthAnalysis.map((t) => `- ${t.range} תווים: CTR ${t.avgCtr.toFixed(2)}%, ${t.count} מאמרים`).join('\n')}

החזר JSON של 5-8 insights:
["insight1", "insight2", ...]
    `

    try {
      const insights = await generateJson<string[]>(insightPrompt, {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 800,
      })
      report.insights = insights
    } catch {
      // skip
    }
  }

  await prisma.siteBI.upsert({
    where: { siteId_reportDate_reportType: { siteId, reportDate: new Date(today), reportType: 'daily_bi' } },
    create: { siteId, reportDate: new Date(today), reportType: 'daily_bi', data: report as object, insights: { insights: report.insights } },
    update: { data: report as object, insights: { insights: report.insights } },
  })

  return report
}

export async function getPageHistory(
  siteId: string,
  url: string,
  months = 6
): Promise<{ date: string; impressions: number; clicks: number; ctr: number; position: number; changes: string[] }[]> {
  const since = subDays(new Date(), months * 30)

  const [snapshots, changeLogs] = await Promise.all([
    prisma.performanceSnapshot.findMany({
      where: { siteId, url: { contains: url }, snapshotDate: { gte: since }, period: 'weekly' },
      orderBy: { snapshotDate: 'asc' },
    }),
    prisma.changeLog.findMany({
      where: { siteId, createdAt: { gte: since } },
      include: { article: { select: { wpPostUrl: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const changesByWeek: Map<string, string[]> = new Map()
  for (const log of changeLogs) {
    if (!log.article?.wpPostUrl?.includes(url)) continue
    const week = format(log.createdAt, 'yyyy-MM-dd')
    const existing = changesByWeek.get(week) ?? []
    existing.push(`${log.changeType}: ${log.field}`)
    changesByWeek.set(week, existing)
  }

  return snapshots.map((s) => ({
    date: format(s.snapshotDate, 'yyyy-MM-dd'),
    impressions: s.impressions,
    clicks: s.clicks,
    ctr: s.ctr * 100,
    position: s.position,
    changes: changesByWeek.get(format(s.snapshotDate, 'yyyy-MM-dd')) ?? [],
  }))
}
