/**
 * Revenue Engine
 *
 * מעבר מ"אין חיבור לכסף" ל"SEO = כסף":
 * - חיבור WooCommerce: משיכת הזמנות + attribution
 * - שיוך מאמרים להכנסות לפי referrer URL
 * - חישוב Revenue Per Visit לכל מאמר
 * - זיהוי מאמרים שמוכרים בפועל
 * - LTV חישוב לפי content path
 * - תעדוף הזדמנויות SEO לפי פוטנציאל הכנסה
 * - Dashboard פיננסי מלא
 * - המלצה: מה להרחיב כדי למקסם הכנסות
 */

import axios, { AxiosInstance } from 'axios'
import { prisma } from '@/lib/prisma'
import { generateJson } from '@/lib/claude'
import { subDays, format } from 'date-fns'

export interface WooOrder {
  id: number
  total: string
  date_created: string
  status: string
  line_items: { name: string; total: string }[]
  meta_data: { key: string; value: string }[]
  _links: { self: { href: string }[] }
}

export interface ArticleRevenueStats {
  articleId: string
  title: string
  url: string
  primaryKeyword: string
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  conversionRate: number
  revenuePerVisit: number
  clicks: number
  impressions: number
  position: number
  revenuePerImpression: number
  revenuePotential: number
  recommendation: string
}

export interface RevenueDashboard {
  totalRevenue: number
  totalOrders: number
  revenueFromSeo: number
  seoRevenueShare: number
  topArticlesByRevenue: ArticleRevenueStats[]
  topArticlesByPotential: ArticleRevenueStats[]
  revenueByMonth: { month: string; revenue: number; orders: number }[]
  bestKeywords: { keyword: string; revenue: number; conversions: number }[]
  underperformingHighTraffic: ArticleRevenueStats[]
}

function createWooClient(wpUrl: string, consumerKey: string, consumerSecret: string): AxiosInstance {
  const base = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
  return axios.create({
    baseURL: `${wpUrl.replace(/\/$/, '')}/wp-json/wc/v3`,
    headers: { Authorization: `Basic ${base}` },
    timeout: 30000,
  })
}

export async function syncWooOrders(
  siteId: string,
  wooKey: string,
  wooSecret: string,
  days = 90
): Promise<number> {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } })
  const client = createWooClient(site.wpUrl, wooKey, wooSecret)

  const afterDate = format(subDays(new Date(), days), "yyyy-MM-dd'T'00:00:00")
  let page = 1
  let synced = 0

  while (true) {
    const res = await client.get<WooOrder[]>('/orders', {
      params: { after: afterDate, status: 'completed,processing', per_page: 100, page },
    })

    const orders = res.data
    if (!orders.length) break

    for (const order of orders) {
      const revenue = parseFloat(order.total)
      const date = new Date(order.date_created)

      // Extract referrer from order meta
      const referrer = order.meta_data.find(
        (m) => m.key === '_order_attribution_source_url' || m.key === 'wpf_url'
      )?.value ?? ''

      // Match referrer to article
      let articleId: string | null = null
      if (referrer) {
        const article = await prisma.article.findFirst({
          where: {
            siteId,
            wpPostUrl: { contains: new URL(referrer).pathname },
          },
        })
        articleId = article?.id ?? null
      }

      await prisma.revenueData.upsert({
        where: {
          id: `woo-${order.id}`,
        },
        create: {
          id: `woo-${order.id}`,
          siteId,
          date,
          orderId: String(order.id),
          revenue,
          product: order.line_items[0]?.name,
          sourceUrl: referrer,
          articleId,
        },
        update: { revenue, articleId },
      })
      synced++
    }

    if (orders.length < 100) break
    page++
  }

  // Recalculate article revenue stats
  await recalculateArticleRevenues(siteId)

  return synced
}

async function recalculateArticleRevenues(siteId: string): Promise<void> {
  const articles = await prisma.article.findMany({
    where: { siteId, status: 'published' },
    include: {
      revenueData: true,
    },
  })

  for (const article of articles) {
    const revenue = article.revenueData
    if (!revenue.length) continue

    const totalRevenue = revenue.reduce((sum, r) => sum + r.revenue, 0)
    const totalOrders = revenue.length
    const avgOrderValue = totalRevenue / totalOrders

    // Get clicks from performance
    const perfData = await prisma.performance.findMany({
      where: { siteId, query: article.primaryKeyword ?? '' },
      orderBy: { date: 'desc' },
      take: 30,
    })
    const totalClicks = perfData.reduce((sum, p) => sum + p.clicks, 0)
    const conversionRate = totalClicks > 0 ? totalOrders / totalClicks : 0
    const revenuePerVisit = totalClicks > 0 ? totalRevenue / totalClicks : 0

    await prisma.articleRevenue.upsert({
      where: { articleId: article.id },
      create: {
        articleId: article.id,
        siteId,
        totalRevenue,
        totalOrders,
        avgOrderValue,
        conversionRate,
        revenuePerVisit,
      },
      update: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        conversionRate,
        revenuePerVisit,
        lastCalculated: new Date(),
      },
    })
  }
}

export async function getRevenueDashboard(siteId: string): Promise<RevenueDashboard> {
  const [totalData, articleRevenues, monthlyRevenue] = await Promise.all([
    prisma.revenueData.aggregate({
      where: { siteId },
      _sum: { revenue: true },
      _count: { id: true },
    }),
    prisma.articleRevenue.findMany({
      where: { siteId },
      include: {
        article: {
          select: {
            title: true,
            wpPostUrl: true,
            primaryKeyword: true,
          },
        },
      },
      orderBy: { totalRevenue: 'desc' },
    }),
    prisma.$queryRaw<{ month: string; revenue: number; orders: number }[]>`
      SELECT
        TO_CHAR(date, 'YYYY-MM') as month,
        SUM(revenue) as revenue,
        COUNT(*) as orders
      FROM "RevenueData"
      WHERE "siteId" = ${siteId}
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `,
  ])

  const topByRevenue = articleRevenues.slice(0, 10).map((ar) => ({
    articleId: ar.articleId,
    title: ar.article.title ?? '',
    url: ar.article.wpPostUrl ?? '',
    primaryKeyword: ar.article.primaryKeyword ?? '',
    totalRevenue: ar.totalRevenue,
    totalOrders: ar.totalOrders,
    avgOrderValue: ar.avgOrderValue,
    conversionRate: ar.conversionRate,
    revenuePerVisit: ar.revenuePerVisit,
    clicks: 0,
    impressions: 0,
    position: 0,
    revenuePerImpression: 0,
    revenuePotential: 0,
    recommendation: '',
  }))

  // Find high-traffic articles with low revenue (underperformers)
  const performances = await prisma.performance.groupBy({
    by: ['query'],
    where: { siteId },
    _sum: { clicks: true, impressions: true },
    _avg: { position: true },
    orderBy: { _sum: { clicks: 'desc' } },
    take: 20,
  })

  const underperformers: ArticleRevenueStats[] = []
  for (const perf of performances) {
    const article = await prisma.article.findFirst({
      where: { siteId, primaryKeyword: perf.query },
      include: { articleRevenue: true },
    })
    if (!article) continue
    if (!article.articleRevenue || article.articleRevenue.totalRevenue < 100) {
      underperformers.push({
        articleId: article.id,
        title: article.title ?? '',
        url: article.wpPostUrl ?? '',
        primaryKeyword: perf.query,
        totalRevenue: article.articleRevenue?.totalRevenue ?? 0,
        totalOrders: article.articleRevenue?.totalOrders ?? 0,
        avgOrderValue: article.articleRevenue?.avgOrderValue ?? 0,
        conversionRate: article.articleRevenue?.conversionRate ?? 0,
        revenuePerVisit: article.articleRevenue?.revenuePerVisit ?? 0,
        clicks: perf._sum.clicks ?? 0,
        impressions: perf._sum.impressions ?? 0,
        position: perf._avg.position ?? 0,
        revenuePerImpression: 0,
        revenuePotential: (perf._sum.clicks ?? 0) * 0.02 * 150,
        recommendation: 'תוכן עם טראפיק גבוה שלא ממיר — שפר CTA ורלוונטיות מסחרית',
      })
    }
  }

  return {
    totalRevenue: totalData._sum.revenue ?? 0,
    totalOrders: totalData._count.id,
    revenueFromSeo: articleRevenues.reduce((s, ar) => s + ar.totalRevenue, 0),
    seoRevenueShare:
      (totalData._sum.revenue ?? 0) > 0
        ? (articleRevenues.reduce((s, ar) => s + ar.totalRevenue, 0) /
            (totalData._sum.revenue ?? 1)) *
          100
        : 0,
    topArticlesByRevenue: topByRevenue,
    topArticlesByPotential: underperformers.slice(0, 5),
    revenueByMonth: monthlyRevenue.map((m) => ({
      month: m.month,
      revenue: Number(m.revenue),
      orders: Number(m.orders),
    })),
    bestKeywords: [],
    underperformingHighTraffic: underperformers.slice(0, 5),
  }
}

export interface ArticleLTV {
  articleId: string
  title: string
  url: string
  firstOrderRevenue: number
  repeatOrderRevenue: number
  ltv: number
  repeatRate: number
  avgRepeatOrders: number
  ltvRatio: number
  tier: 'platinum' | 'gold' | 'silver' | 'bronze'
}

export interface ArticleROI {
  articleId: string
  title: string
  totalRevenue: number
  estimatedProductionCost: number
  roi: number
  paybackMonths: number
  monthlyRevenue: number
  recommendation: string
}

export async function calculateArticleLTV(siteId: string): Promise<ArticleLTV[]> {
  const revenueData = await prisma.revenueData.findMany({
    where: { siteId, articleId: { not: null } },
    include: { article: { select: { id: true, title: true, wpPostUrl: true } } },
    orderBy: { date: 'asc' },
  })

  const articleOrders = new Map<string, { firstOrder: number; repeatOrders: number[]; orderId: Set<string> }>()
  const customerFirstTouch = new Map<string, string>() // orderId → articleId

  for (const row of revenueData) {
    if (!row.articleId) continue
    const orderId = row.orderId ?? row.id

    if (!customerFirstTouch.has(orderId)) {
      customerFirstTouch.set(orderId, row.articleId)
    }

    const existing = articleOrders.get(row.articleId) ?? { firstOrder: 0, repeatOrders: [], orderId: new Set() }
    if (!existing.orderId.has(orderId)) {
      existing.orderId.add(orderId)
      if (customerFirstTouch.get(orderId) === row.articleId) {
        existing.firstOrder += row.revenue
      } else {
        existing.repeatOrders.push(row.revenue)
      }
    }
    articleOrders.set(row.articleId, existing)
  }

  const results: ArticleLTV[] = []

  for (const [articleId, data] of articleOrders) {
    const article = revenueData.find((r) => r.articleId === articleId)?.article
    if (!article) continue

    const totalOrders = data.orderId.size
    const repeatOrderRevenue = data.repeatOrders.reduce((s, r) => s + r, 0)
    const ltv = data.firstOrder + repeatOrderRevenue
    const repeatRate = totalOrders > 1 ? (data.repeatOrders.length / totalOrders) : 0
    const ltvRatio = data.firstOrder > 0 ? ltv / data.firstOrder : 1
    const tier: ArticleLTV['tier'] = ltvRatio > 3 ? 'platinum' : ltvRatio > 2 ? 'gold' : ltvRatio > 1.5 ? 'silver' : 'bronze'

    results.push({
      articleId,
      title: article.title ?? '',
      url: article.wpPostUrl ?? '',
      firstOrderRevenue: data.firstOrder,
      repeatOrderRevenue,
      ltv,
      repeatRate,
      avgRepeatOrders: totalOrders > 0 ? data.repeatOrders.length / totalOrders : 0,
      ltvRatio,
      tier,
    })
  }

  return results.sort((a, b) => b.ltv - a.ltv)
}

export async function calculateArticleROI(siteId: string): Promise<ArticleROI[]> {
  const articleRevenues = await prisma.articleRevenue.findMany({
    where: { siteId },
    include: { article: { select: { id: true, title: true, wpPostUrl: true, wordCount: true, publishedAt: true } } },
  })

  const results: ArticleROI[] = []

  for (const ar of articleRevenues) {
    const wordCount = ar.article.wordCount ?? 1000
    const estimatedHours = wordCount / 500
    const hourlyRate = 150
    const estimatedProductionCost = estimatedHours * hourlyRate

    const monthsSincePublish = ar.article.publishedAt
      ? Math.max(1, (Date.now() - ar.article.publishedAt.getTime()) / (30 * 86400000))
      : 12

    const monthlyRevenue = ar.totalRevenue / monthsSincePublish
    const roi = estimatedProductionCost > 0 ? ((ar.totalRevenue - estimatedProductionCost) / estimatedProductionCost) * 100 : 0
    const paybackMonths = monthlyRevenue > 0 ? estimatedProductionCost / monthlyRevenue : 999

    let recommendation = 'Performing well'
    if (roi < 0) recommendation = 'Not yet profitable — needs traffic boost or CTA optimization'
    else if (roi < 100) recommendation = 'Low ROI — expand content or add internal links from high-traffic pages'
    else if (roi > 500) recommendation = 'Star performer — create supporting cluster articles'

    results.push({
      articleId: ar.articleId,
      title: ar.article.title ?? '',
      totalRevenue: ar.totalRevenue,
      estimatedProductionCost,
      roi: parseFloat(roi.toFixed(1)),
      paybackMonths: parseFloat(paybackMonths.toFixed(1)),
      monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
      recommendation,
    })
  }

  return results.sort((a, b) => b.roi - a.roi)
}

export async function getRevenueRecommendations(siteId: string): Promise<string> {
  const dashboard = await getRevenueDashboard(siteId)

  const prompt = `
אתה מומחה SEO ואסטרטגיית תוכן מסחרית. נתח את הנתונים ותן המלצות אסטרטגיות.

**נתוני הכנסות:**
- סה"כ הכנסות: ${dashboard.totalRevenue.toFixed(0)} ₪
- הכנסות מ-SEO: ${dashboard.revenueFromSeo.toFixed(0)} ₪ (${dashboard.seoRevenueShare.toFixed(1)}%)
- סה"כ הזמנות: ${dashboard.totalOrders}

**מאמרים מובילים בהכנסות:**
${dashboard.topArticlesByRevenue.slice(0, 5).map((a) =>
  `- "${a.title}" → ${a.totalRevenue.toFixed(0)} ₪ | ${a.conversionRate.toFixed(2)}% המרה`
).join('\n')}

**מאמרים עם פוטנציאל לא ממומש (טראפיק גבוה, הכנסות נמוכות):**
${dashboard.underperformingHighTraffic.slice(0, 3).map((a) =>
  `- "${a.title}" — ${a.clicks} קליקים, ${a.totalRevenue.toFixed(0)} ₪ בלבד`
).join('\n')}

תן 5 המלצות אסטרטגיות קונקרטיות (לא כלליות) לשיפור הכנסות מ-SEO.
פורמט: נקודות קצרות, ישירות, עם פעולה ברורה.
`

  return generateJson<string>(prompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 800,
  })
}
