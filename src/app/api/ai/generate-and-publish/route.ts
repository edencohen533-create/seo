import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callClaudeText, callClaudeJson } from '@/lib/ai/callClaude'
import { generateImage } from '@/lib/images'

interface GenerateRequest {
  topic: string
  mainKeyword: string
  secondaryKeywords?: string[]
  audience?: string
  productContext?: string
  desiredLength?: number
  publishStatus?: 'draft' | 'pending' | 'publish' | 'future'
  generateImage?: boolean
  siteId?: string
}

interface ArticleMetadata {
  title: string
  metaTitle: string
  metaDescription: string
  slug: string
  excerpt: string
  category: string
  tags: string[]
  imagePromptContext: string
}

export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json()
  const {
    topic,
    mainKeyword,
    secondaryKeywords = [],
    audience = 'קהל כללי',
    productContext = '',
    desiredLength = 1500,
    generateImage: shouldGenerateImage = true,
    siteId = process.env.DEFAULT_SITE_ID ?? process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? '',
  } = body

  if (!topic || !mainKeyword) {
    return NextResponse.json({ error: 'topic and mainKeyword are required' }, { status: 400 })
  }

  const logs: string[] = []

  // Resolve siteId — find/create default site from env if none provided
  let resolvedSiteId = siteId
  if (!resolvedSiteId) {
    let site = await prisma.site.findFirst({ select: { id: true } })
    if (!site) {
      const wpUrl = process.env.WORDPRESS_URL ?? 'https://example.com'
      const wpUser = process.env.WORDPRESS_USERNAME ?? 'admin'
      const wpPass = process.env.WORDPRESS_APP_PASSWORD ?? ''
      site = await prisma.site.create({
        data: {
          name: 'Default Site',
          domain: new URL(wpUrl).hostname,
          wpUrl,
          wpUser,
          wpAppPassword: wpPass,
          gscSiteUrl: wpUrl,
          niche: 'health',
        },
        select: { id: true },
      })
    }
    resolvedSiteId = site.id
  }

  // Create article record in 'generating' state
  const article = await prisma.article.create({
    data: {
      siteId: resolvedSiteId,
      primaryKeyword: mainKeyword,
      secondaryKeywords,
      audience,
      status: 'generating',
    },
  })

  logs.push('article_record_created')

  try {
    // Step 1: Generate article content
    const content = await callClaudeText('seo_article', {
      topic,
      mainKeyword,
      secondaryKeywords,
      audience,
      productContext,
      desiredLength,
    })
    logs.push('article_generated')

    // Step 2: Extract metadata
    const meta = await callClaudeJson<ArticleMetadata>('extract_metadata', {
      topic,
      mainKeyword,
      articleContent: content,
    })
    logs.push('metadata_extracted')

    const wordCount = content.replace(/<[^>]+>/g, '').split(/\s+/).length

    // Step 3: Generate image prompt
    const imagePromptRaw = await callClaudeText('image_prompt', {
      topic,
      mainKeyword,
      articleTitle: meta.title,
      audience,
    })
    const imagePrompt = imagePromptRaw.trim()
    logs.push('image_prompt_created')

    // Step 4: Generate image
    let imageUrl: string | null = null
    const imageHistoryEntry: { url: string; prompt: string; createdAt: string }[] = []

    if (shouldGenerateImage) {
      try {
        const imgResult = await generateImage({ prompt: imagePrompt, width: 1200, height: 630 })
        imageUrl = imgResult.url
        imageHistoryEntry.push({ url: imageUrl, prompt: imagePrompt, createdAt: new Date().toISOString() })
        logs.push('image_generated')
      } catch (err) {
        console.warn('[generate-and-publish] Image generation failed:', err)
        logs.push('image_generation_failed')
      }
    }

    // Step 5: Save to DB with status 'reviewing'
    const updated = await prisma.article.update({
      where: { id: article.id },
      data: {
        title: meta.title,
        slug: meta.slug,
        content,
        excerpt: meta.excerpt,
        metaTitle: meta.metaTitle,
        metaDescription: meta.metaDescription,
        wordCount,
        primaryKeyword: mainKeyword,
        secondaryKeywords,
        audience,
        imagePrompt,
        imageHistory: imageHistoryEntry,
        status: 'reviewing',
      },
    })

    logs.push('saved_for_review')

    return NextResponse.json({
      success: true,
      article: {
        id: updated.id,
        title: updated.title,
        slug: updated.slug,
        content: updated.content,
        excerpt: updated.excerpt,
        metaTitle: updated.metaTitle,
        metaDescription: updated.metaDescription,
        wordCount: updated.wordCount,
        status: updated.status,
        category: meta.category,
        tags: meta.tags,
      },
      image: imageUrl ? { url: imageUrl, prompt: imagePrompt } : null,
      wordpress: null,
      logs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.article.update({
      where: { id: article.id },
      data: { status: 'failed', errorLog: message },
    })
    logs.push('failed')
    return NextResponse.json({ success: false, error: message, logs }, { status: 500 })
  }
}
