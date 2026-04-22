import { NextRequest, NextResponse } from 'next/server'
import { createExperiment, measureExperiment, getSiteExperiments, learnFromExperiments } from '@/modules/experiment-engine'
import type { ExperimentType } from '@/modules/experiment-engine'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  const experimentId = req.nextUrl.searchParams.get('id')

  if (experimentId) {
    const result = await measureExperiment(experimentId)
    return NextResponse.json(result)
  }

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const [experiments, insights] = await Promise.all([
    getSiteExperiments(siteId),
    learnFromExperiments(siteId),
  ])
  return NextResponse.json({ experiments, insights })
}

export async function POST(req: NextRequest) {
  const { siteId, articleId, type, hypothesis, variantA, variantB } = await req.json()
  if (!siteId || !articleId || !type) {
    return NextResponse.json({ error: 'siteId, articleId, type required' }, { status: 400 })
  }

  const id = await createExperiment(siteId, articleId, type as ExperimentType, hypothesis, variantA, variantB)
  return NextResponse.json({ id })
}
