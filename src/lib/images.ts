import { GoogleGenAI } from '@google/genai'
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

function getAspectRatio(width: number, height: number): string {
  const ratio = width / height
  if (ratio >= 1.7) return '16:9'
  if (ratio >= 1.2) return '4:3'
  if (ratio >= 0.9) return '1:1'
  if (ratio >= 0.7) return '3:4'
  return '9:16'
}

export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const apiKey = process.env.NANO_BANANA_API_KEY ?? process.env.nanobanana

  if (!apiKey) {
    return generatePlaceholderImage(options)
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const aspectRatio = getAspectRatio(options.width ?? 1200, options.height ?? 630)

    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt: options.prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio,
      },
    })

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes
    if (!imageBytes) throw new Error('No image returned from Imagen')

    const buffer = Buffer.from(imageBytes, 'base64')
    const base64 = `data:image/jpeg;base64,${imageBytes}`
    return { url: base64, buffer }
  } catch (err) {
    console.warn('Image generation failed, using placeholder:', err)
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
