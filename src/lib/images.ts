import axios from 'axios'
import sharp from 'sharp'

export interface ImageGenerationOptions {
  prompt: string
  width?: number
  height?: number
  style?: string
  negativePrompt?: string
}

export interface GeneratedImage {
  url: string
  buffer?: Buffer
}

export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const apiKey = process.env.NANO_BANANA_API_KEY
  const apiUrl = process.env.NANO_BANANA_API_URL ?? 'https://api.nanobanana.io/v1'

  if (!apiKey) {
    return generatePlaceholderImage(options)
  }

  try {
    const res = await axios.post(
      `${apiUrl}/generate`,
      {
        prompt: options.prompt,
        negative_prompt: options.negativePrompt ?? 'text, watermark, blurry, low quality, nsfw',
        width: options.width ?? 1200,
        height: options.height ?? 630,
        style: options.style ?? 'photorealistic',
        num_inference_steps: 30,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    )

    return { url: res.data.url ?? res.data.image_url }
  } catch {
    console.warn('Image generation failed, using placeholder')
    return generatePlaceholderImage(options)
  }
}

async function generatePlaceholderImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const width = options.width ?? 1200
  const height = options.height ?? 630

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0ea5e9"/>
      <text x="${width / 2}" y="${height / 2}"
            font-family="Arial" font-size="24" fill="white"
            text-anchor="middle" dominant-baseline="middle">
        ${options.prompt.substring(0, 60)}
      </text>
    </svg>`

  const buffer = await sharp(Buffer.from(svg))
    .webp({ quality: 80 })
    .toBuffer()

  const base64 = `data:image/webp;base64,${buffer.toString('base64')}`
  return { url: base64, buffer }
}

export async function optimizeImage(buffer: Buffer, options?: { width?: number; quality?: number }): Promise<Buffer> {
  return sharp(buffer)
    .resize(options?.width ?? 1200, undefined, { withoutEnlargement: true })
    .webp({ quality: options?.quality ?? 80 })
    .toBuffer()
}

export function generateSeoFilename(keyword: string, index: number, type: string): string {
  const slug = keyword
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()

  return `${slug}-${type}-${index + 1}`
}
