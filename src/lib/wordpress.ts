import axios, { AxiosInstance } from 'axios'
import FormData from 'form-data'
import sharp from 'sharp'
import fs from 'fs'

export function createWpClient(wpUrl: string, wpUser: string, wpAppPassword: string): AxiosInstance {
  const base64 = Buffer.from(`${wpUser}:${wpAppPassword}`).toString('base64')
  return axios.create({
    baseURL: `${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2`,
    headers: {
      Authorization: `Basic ${base64}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  })
}

export interface WpPostData {
  title: string
  content: string
  excerpt?: string
  slug?: string
  status?: 'draft' | 'publish' | 'private'
  categories?: number[]
  tags?: number[]
  featuredMediaId?: number
  metaTitle?: string
  metaDescription?: string
  schema?: object
}

export interface WpPost {
  id: number
  link: string
  slug: string
  status: string
}

export async function createPost(client: AxiosInstance, data: WpPostData): Promise<WpPost> {
  const body: Record<string, unknown> = {
    title: data.title,
    content: data.content,
    excerpt: data.excerpt ?? '',
    slug: data.slug,
    status: data.status ?? 'draft',
    categories: data.categories ?? [],
    tags: data.tags ?? [],
  }

  if (data.featuredMediaId) {
    body.featured_media = data.featuredMediaId
  }

  if (data.metaTitle || data.metaDescription) {
    body.meta = {
      ...(data.metaTitle && { _yoast_wpseo_title: data.metaTitle }),
      ...(data.metaDescription && { _yoast_wpseo_metadesc: data.metaDescription }),
      ...(data.schema && { _yoast_wpseo_schema_article_type: 'Article' }),
    }
    body.yoast_head_json = {
      title: data.metaTitle,
      description: data.metaDescription,
    }
  }

  const res = await client.post('/posts', body)
  return res.data
}

export async function updatePost(
  client: AxiosInstance,
  postId: number,
  data: Partial<WpPostData>
): Promise<WpPost> {
  const body: Record<string, unknown> = {}
  if (data.title) body.title = data.title
  if (data.content) body.content = data.content
  if (data.excerpt) body.excerpt = data.excerpt
  if (data.status) body.status = data.status
  if (data.featuredMediaId) body.featured_media = data.featuredMediaId
  if (data.metaTitle || data.metaDescription) {
    body.meta = {
      ...(data.metaTitle && { _yoast_wpseo_title: data.metaTitle }),
      ...(data.metaDescription && { _yoast_wpseo_metadesc: data.metaDescription }),
    }
  }

  const res = await client.post(`/posts/${postId}`, body)
  return res.data
}

export interface WpMedia {
  id: number
  source_url: string
  slug: string
}

export async function uploadImageFromUrl(
  client: AxiosInstance,
  imageUrl: string,
  filename: string,
  altText: string
): Promise<WpMedia> {
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(imgRes.data)

  const optimized = await sharp(buffer)
    .webp({ quality: 80 })
    .toBuffer()

  const form = new FormData()
  form.append('file', optimized, {
    filename: filename.replace(/\.[^.]+$/, '.webp'),
    contentType: 'image/webp',
  })
  form.append('alt_text', altText)
  form.append('caption', altText)

  const res = await client.post('/media', form, {
    headers: form.getHeaders(),
  })
  return res.data
}

export async function uploadImageFromBuffer(
  client: AxiosInstance,
  buffer: Buffer,
  filename: string,
  altText: string
): Promise<WpMedia> {
  const optimized = await sharp(buffer)
    .webp({ quality: 80 })
    .toBuffer()

  const form = new FormData()
  form.append('file', optimized, {
    filename: filename.replace(/\.[^.]+$/, '.webp'),
    contentType: 'image/webp',
  })
  form.append('alt_text', altText)

  const res = await client.post('/media', form, {
    headers: form.getHeaders(),
  })
  return res.data
}

export async function getCategories(client: AxiosInstance): Promise<{ id: number; name: string }[]> {
  const res = await client.get('/categories?per_page=100')
  return res.data
}

export async function createCategory(client: AxiosInstance, name: string): Promise<number> {
  const res = await client.post('/categories', { name })
  return res.data.id
}

export async function getOrCreateCategory(client: AxiosInstance, name: string): Promise<number> {
  const categories = await getCategories(client)
  const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing.id
  return createCategory(client, name)
}
