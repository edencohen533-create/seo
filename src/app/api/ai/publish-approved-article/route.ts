import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createWpClient, createPost, uploadImageFromBuffer } from '@/lib/wordpress'
import axios from 'axios'
import sharp from 'sharp'

type PublishStatus = 'draft' | 'pending' | 'publish' | 'future'

export async function POST(req: NextRequest) {
  const { articleId, publishStatus = 'draft' } = await req.json() as {
    articleId: string
    publishStatus?: PublishStatus
  }

  if (!articleId) {
    return NextResponse.json({ error: 'articleId is required' }, { status: 400 })
  }

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { site: true },
  })

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  if (article.status !== 'reviewing' && article.status !== 'approved') {
    return NextResponse.json(
      { error: `Article must be in reviewing or approved status. Current: ${article.status}` },
      { status: 400 }
    )
  }

  // Determine WP credentials — from site record or env vars
  const wpUrl = article.site.wpUrl || process.env.WORDPRESS_URL || ''
  const wpUser = article.site.wpUser || process.env.WORDPRESS_USERNAME || ''
  const wpPass = article.site.wpAppPassword || process.env.WORDPRESS_APP_PASSWORD || ''

  if (!wpUrl || !wpUser || !wpPass) {
    return NextResponse.json({ error: 'WordPress credentials not configured' }, { status: 400 })
  }

  const client = createWpClient(wpUrl, wpUser, wpPass)
  const logs: string[] = ['publish_started']

  // Upload featured image if available
  let featuredMediaId: number | undefined
  const currentImageUrl = ((article.imageHistory as { url: string }[] | null) ?? []).at(-1)?.url

  if (currentImageUrl) {
    try {
      let buffer: Buffer
      if (currentImageUrl.startsWith('data:')) {
        const base64Data = currentImageUrl.split(',')[1]
        buffer = Buffer.from(base64Data, 'base64')
      } else {
        const res = await axios.get(currentImageUrl, { responseType: 'arraybuffer' })
        buffer = Buffer.from(res.data)
      }

      const optimized = await sharp(buffer).webp({ quality: 80 }).toBuffer()
      const filename = `${article.slug ?? article.id}-hero.webp`
      const media = await uploadImageFromBuffer(client, optimized, filename, article.title ?? '')
      featuredMediaId = media.id
      logs.push('image_uploaded_to_wp')
    } catch (err) {
      console.warn('[publish-approved-article] Image upload failed:', err)
      logs.push('image_upload_failed_continuing')
    }
  }

  // Create WordPress post
  try {
    const post = await createPost(client, {
      title: article.title ?? '',
      content: article.content ?? '',
      excerpt: article.excerpt ?? undefined,
      slug: article.slug ?? undefined,
      status: publishStatus as 'draft' | 'publish' | 'private',
      featuredMediaId,
      metaTitle: article.metaTitle ?? undefined,
      metaDescription: article.metaDescription ?? undefined,
    })
    logs.push('post_created_in_wp')

    await prisma.article.update({
      where: { id: articleId },
      data: {
        wpPostId: post.id,
        wpPostUrl: post.link,
        status: publishStatus === 'publish' ? 'published' : publishStatus,
        publishedAt: publishStatus === 'publish' ? new Date() : undefined,
      },
    })

    return NextResponse.json({
      success: true,
      wordpressPostId: String(post.id),
      wordpressPostUrl: post.link,
      status: publishStatus,
      logs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.article.update({
      where: { id: articleId },
      data: { errorLog: message },
    })
    logs.push('wp_publish_failed')
    return NextResponse.json({ success: false, error: message, logs }, { status: 500 })
  }
}
