import 'dotenv/config'
import { Worker, Queue } from 'bullmq'
import { prisma } from '../src/lib/prisma'
import { scanOpportunities } from '../src/modules/opportunity-engine'
import { generateContentBrief } from '../src/modules/content-brief'
import { writeArticle, saveArticleDraft } from '../src/modules/article-writer'
import { planImages, generateAllImages } from '../src/modules/image-engine'
import { publishArticleToDraft } from '../src/modules/publisher'
import { runFeedbackLoop } from '../src/modules/feedback-loop'
import { snapshotDailyPerformance, generateBIReport } from '../src/modules/data-layer'
import { buildSiteModel } from '../src/modules/learning-engine'
import type { ContentBrief } from '../src/modules/content-brief'

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
}

const opportunityWorker = new Worker(
  'opportunities',
  async (job) => {
    const { siteId } = job.data
    console.log(`[opportunities] scanning site ${siteId}`)
    const count = await scanOpportunities(siteId)
    console.log(`[opportunities] created ${count} opportunities`)
    return { count }
  },
  { connection, concurrency: 2 }
)

const articleWorker = new Worker(
  'articles',
  async (job) => {
    const { articleId, siteId } = job.data

    const article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      include: { site: true },
    })

    try {
      if (article.status === 'pending' || article.status === 'brief') {
        console.log(`[articles] generating brief for ${articleId}`)
        await prisma.article.update({ where: { id: articleId }, data: { status: 'brief' } })

        let brief: ContentBrief
        if (article.opportunityId) {
          brief = await generateContentBrief(article.opportunityId, article.site.niche ?? '')
        } else {
          const { generateBriefForKeyword } = await import('../src/modules/content-brief')
          brief = await generateBriefForKeyword(
            article.primaryKeyword ?? '',
            `${article.site.name} — ${article.site.niche ?? ''}`
          )
        }

        await prisma.article.update({
          where: { id: articleId },
          data: {
            contentBrief: brief as object,
            primaryKeyword: brief.primaryKeyword as string,
            secondaryKeywords: brief.secondaryKeywords as string[],
            status: 'writing',
          },
        })
      }

      if (article.status === 'writing' || (await getStatus(articleId)) === 'writing') {
        console.log(`[articles] writing article ${articleId}`)
        const updated = await prisma.article.findUniqueOrThrow({
          where: { id: articleId },
          include: { site: true },
        })

        const existingLinks = await prisma.article.findMany({
          where: { siteId, status: 'published', wpPostUrl: { not: null } },
          select: { wpPostUrl: true },
          take: 20,
        })

        const output = await writeArticle(
          updated.contentBrief as unknown as ContentBrief,
          {
            name: updated.site.name,
            domain: updated.site.domain,
            niche: updated.site.niche,
            brandTone: updated.site.brandTone,
          },
          existingLinks.map((a) => a.wpPostUrl!).filter(Boolean)
        )

        await saveArticleDraft(articleId, output)
      }

      if ((await getStatus(articleId)) === 'images') {
        console.log(`[articles] generating images for ${articleId}`)
        const updated = await prisma.article.findUniqueOrThrow({ where: { id: articleId } })
        const brief = updated.contentBrief as unknown as ContentBrief

        const altTexts = [
          { position: 'hero', text: `${brief.primaryKeyword} — תמונה ראשית` },
          { position: 'h2-1', text: `${brief.secondaryKeywords[0] ?? brief.primaryKeyword}` },
          { position: 'h2-2', text: `${brief.secondaryKeywords[1] ?? brief.primaryKeyword}` },
          { position: 'h2-3', text: `${brief.secondaryKeywords[2] ?? brief.primaryKeyword}` },
        ]

        await planImages(articleId, updated.content ?? '', brief.primaryKeyword, altTexts)
        await generateAllImages(articleId)
      }

      if ((await getStatus(articleId)) === 'publishing') {
        console.log(`[articles] publishing ${articleId} to WordPress`)
        const url = await publishArticleToDraft(articleId)
        console.log(`[articles] published: ${url}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await prisma.article.update({
        where: { id: articleId },
        data: { status: 'failed', errorLog: message },
      })
      throw err
    }
  },
  { connection, concurrency: 3 }
)

const feedbackWorker = new Worker(
  'feedback',
  async (job) => {
    const { siteId } = job.data
    console.log(`[feedback] running loop for site ${siteId}`)
    const recs = await runFeedbackLoop(siteId)
    console.log(`[feedback] found ${recs.length} recommendations`)
    return { count: recs.length }
  },
  { connection, concurrency: 1 }
)

const dataWorker = new Worker(
  'data-snapshots',
  async (job) => {
    const { siteId, type } = job.data

    if (type === 'snapshot') {
      console.log(`[data] snapshotting performance for site ${siteId}`)
      const result = await snapshotDailyPerformance(siteId)
      console.log(`[data] snapshotted ${result.pagesSnapshotted} pages`)
      return result
    }

    if (type === 'bi_report') {
      console.log(`[data] generating BI report for site ${siteId}`)
      const report = await generateBIReport(siteId)
      return { insights: report.insights.length }
    }

    if (type === 'learn') {
      console.log(`[data] building site model for ${siteId}`)
      const model = await buildSiteModel(siteId)
      console.log(`[data] found ${model.patterns.length} patterns`)
      return { patterns: model.patterns.length }
    }
  },
  { connection, concurrency: 2 }
)

dataWorker.on('completed', (job) => console.log(`[data] job ${job.id} done`))
dataWorker.on('failed', (job, err) => console.error(`[data] job ${job?.id} failed:`, err.message))

// Schedule daily snapshots for all sites
async function scheduleDailySnapshots() {
  const sites = await prisma.site.findMany({ select: { id: true } })
  const dataQueue = new Queue('data-snapshots', { connection })

  for (const site of sites) {
    await dataQueue.add('snapshot', { siteId: site.id, type: 'snapshot' }, {
      repeat: { pattern: '0 3 * * *' },
      jobId: `snapshot-${site.id}`,
    })
    await dataQueue.add('learn', { siteId: site.id, type: 'learn' }, {
      repeat: { pattern: '0 4 * * 1' },
      jobId: `learn-${site.id}`,
    })
  }

  await dataQueue.close()
  console.log(`[data] scheduled snapshots for ${sites.length} sites`)
}

scheduleDailySnapshots().catch(console.error)

async function getStatus(articleId: string): Promise<string> {
  const a = await prisma.article.findUnique({ where: { id: articleId }, select: { status: true } })
  return a?.status ?? 'failed'
}

opportunityWorker.on('completed', (job) => console.log(`[opp] job ${job.id} done`))
opportunityWorker.on('failed', (job, err) => console.error(`[opp] job ${job?.id} failed:`, err.message))

articleWorker.on('completed', (job) => console.log(`[article] job ${job.id} done`))
articleWorker.on('failed', (job, err) => console.error(`[article] job ${job?.id} failed:`, err.message))

feedbackWorker.on('completed', (job) => console.log(`[feedback] job ${job.id} done`))
feedbackWorker.on('failed', (job, err) => console.error(`[feedback] job ${job?.id} failed:`, err.message))

process.on('SIGTERM', async () => {
  await Promise.all([
    opportunityWorker.close(),
    articleWorker.close(),
    feedbackWorker.close(),
    dataWorker.close(),
  ])
  process.exit(0)
})

console.log('Solina SEO Engine Workers running...')
