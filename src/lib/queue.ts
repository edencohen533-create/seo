import { Queue, Worker, Job } from 'bullmq'
import { redis } from './redis'

const connection = { host: 'localhost', port: 6379 }

export const queues = {
  opportunities: new Queue('opportunities', { connection }),
  articles: new Queue('articles', { connection }),
  images: new Queue('images', { connection }),
  publisher: new Queue('publisher', { connection }),
  feedback: new Queue('feedback', { connection }),
}

export type OpportunityJobData = {
  siteId: string
}

export type ArticleJobData = {
  articleId: string
  siteId: string
  step: 'brief' | 'write' | 'images' | 'publish'
}

export type FeedbackJobData = {
  siteId: string
}

export async function enqueueOpportunityScan(siteId: string) {
  return queues.opportunities.add('scan', { siteId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })
}

export async function enqueueArticlePipeline(articleId: string, siteId: string) {
  return queues.articles.add('pipeline', { articleId, siteId, step: 'brief' }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })
}

export async function enqueueFeedbackLoop(siteId: string) {
  return queues.feedback.add('loop', { siteId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  })
}
