import { prisma } from '@/lib/prisma'
import { createWpClient, createPost, uploadImageFromUrl, getOrCreateCategory } from '@/lib/wordpress'
import { injectImagesIntoContent } from '../image-engine'

export async function publishArticleToDraft(articleId: string): Promise<string> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { site: true, images: { orderBy: { order: 'asc' } } },
  })

  const { site } = article
  const client = createWpClient(site.wpUrl, site.wpUser, site.wpAppPassword)

  let featuredMediaId: number | undefined

  for (const img of article.images) {
    if (!img.url) continue

    try {
      const media = await uploadImageFromUrl(
        client,
        img.url,
        `${img.filename ?? 'image'}.webp`,
        img.altText ?? ''
      )

      await prisma.articleImage.update({
        where: { id: img.id },
        data: { wpMediaId: media.id, url: media.source_url },
      })

      if (img.type === 'hero' && !featuredMediaId) {
        featuredMediaId = media.id
      }
    } catch (err) {
      console.error(`Upload failed for image ${img.id}:`, err)
    }
  }

  const updatedImages = await prisma.articleImage.findMany({
    where: { articleId },
    orderBy: { order: 'asc' },
  })

  const contentWithImages = injectImagesIntoContent(
    article.content ?? '',
    updatedImages.map((i) => ({
      position: i.position ?? '',
      wpMediaId: i.wpMediaId,
      url: i.url,
      altText: i.altText,
    }))
  )

  const categoryId = site.niche
    ? await getOrCreateCategory(client, site.niche)
    : undefined

  const schemaScript = article.schema
    ? `\n<script type="application/ld+json">${JSON.stringify(article.schema)}</script>`
    : ''

  const post = await createPost(client, {
    title: article.title ?? '',
    content: contentWithImages + schemaScript,
    excerpt: article.excerpt ?? '',
    slug: article.slug ?? undefined,
    status: 'draft',
    categories: categoryId ? [categoryId] : [],
    featuredMediaId,
    metaTitle: article.metaTitle ?? undefined,
    metaDescription: article.metaDescription ?? undefined,
  })

  await prisma.article.update({
    where: { id: articleId },
    data: {
      wpPostId: post.id,
      wpPostUrl: post.link,
      status: 'published',
      publishedAt: new Date(),
    },
  })

  return post.link
}
