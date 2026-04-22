import { generateImage, generateSeoFilename } from '@/lib/images'
import { generateJson } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export interface ImagePlan {
  hero: ImageRequest
  contentImages: ImageRequest[]
}

export interface ImageRequest {
  type: 'hero' | 'content'
  position: string
  prompt: string
  altText: string
  filename: string
  width: number
  height: number
}

export async function planImages(
  articleId: string,
  content: string,
  primaryKeyword: string,
  altTexts: { position: string; text: string }[]
): Promise<ImagePlan> {
  const prompt = `
אתה מומחה SEO ומיתוג ויזואלי. נתח את המאמר הזה וצור תכנית תמונות.

**מילת מפתח:** ${primaryKeyword}
**תוכן (קטוע):** ${content.substring(0, 1000)}...

צור prompts לתמונות בסגנון lifestyle/wellness אנושי ואמיתי.
חשוב: ללא מוצרים, ללא טקסט בתמונה, ללא לוגו.

החזר JSON:
{
  "hero": {
    "prompt": "תיאור מפורט באנגלית לתמונת הכותרת",
    "style": "photorealistic, natural light, lifestyle"
  },
  "contentImages": [
    {
      "position": "h2-1",
      "prompt": "תיאור לתמונה לאחר H2 הראשון",
      "style": "photorealistic, natural light"
    },
    {
      "position": "h2-2",
      "prompt": "תיאור לתמונה לאחר H2 השני",
      "style": "photorealistic, natural light"
    },
    {
      "position": "h2-3",
      "prompt": "תיאור לתמונה לאחר H2 השלישי",
      "style": "photorealistic, natural light"
    }
  ]
}

עקרונות prompt:
- "Natural, authentic lifestyle image"
- תאר אנשים אמיתיים בסביבה טבעית
- תאורה חמה ורכה
- ללא מוצרים, ללא טקסט, ללא לוגו
- מותג wellness/wellbeing
`

  const plan = await generateJson<{
    hero: { prompt: string; style: string }
    contentImages: { position: string; prompt: string; style: string }[]
  }>(prompt, { model: 'claude-haiku-4-5-20251001', maxTokens: 1500 })

  const altMap = new Map(altTexts.map((a) => [a.position, a.text]))

  const heroAlt = altMap.get('hero') ?? `${primaryKeyword} - תמונת כותרת`
  const heroFilename = generateSeoFilename(primaryKeyword, 0, 'hero')

  const imagePlan: ImagePlan = {
    hero: {
      type: 'hero',
      position: 'hero',
      prompt: `${plan.hero.prompt}, ${plan.hero.style}`,
      altText: heroAlt,
      filename: heroFilename,
      width: 1200,
      height: 630,
    },
    contentImages: plan.contentImages.map((img, i) => ({
      type: 'content' as const,
      position: img.position,
      prompt: `${img.prompt}, ${img.style}`,
      altText: altMap.get(img.position) ?? `${primaryKeyword} — תמונה ${i + 1}`,
      filename: generateSeoFilename(primaryKeyword, i, 'content'),
      width: 800,
      height: 500,
    })),
  }

  await prisma.articleImage.deleteMany({ where: { articleId } })

  await prisma.articleImage.createMany({
    data: [imagePlan.hero, ...imagePlan.contentImages].map((img, i) => ({
      articleId,
      type: img.type,
      position: img.position,
      prompt: img.prompt,
      altText: img.altText,
      filename: img.filename,
      order: i,
    })),
  })

  return imagePlan
}

export async function generateAllImages(articleId: string): Promise<void> {
  const images = await prisma.articleImage.findMany({
    where: { articleId },
    orderBy: { order: 'asc' },
  })

  for (const img of images) {
    try {
      const result = await generateImage({
        prompt: img.prompt ?? '',
        width: img.type === 'hero' ? 1200 : 800,
        height: img.type === 'hero' ? 630 : 500,
      })

      await prisma.articleImage.update({
        where: { id: img.id },
        data: { url: result.url },
      })
    } catch (err) {
      console.error(`Image generation failed for ${img.id}:`, err)
    }
  }

  await prisma.article.update({
    where: { id: articleId },
    data: { status: 'publishing' },
  })
}

export function injectImagesIntoContent(
  content: string,
  images: { position: string; wpMediaId?: number | null; url?: string | null; altText?: string | null }[]
): string {
  let result = content

  const heroImage = images.find((i) => i.position === 'hero')
  if (heroImage && (heroImage.url || heroImage.wpMediaId)) {
    const imgSrc = heroImage.url ?? ''
    const imgTag = `<img src="${imgSrc}" alt="${heroImage.altText ?? ''}" class="wp-post-image" loading="eager" />`
    result = imgTag + '\n' + result
  }

  const contentImages = images.filter((i) => i.position !== 'hero')

  for (const img of contentImages) {
    if (!img.url && !img.wpMediaId) continue

    const h2Match = img.position.match(/h2-(\d+)/)
    if (!h2Match) continue

    const h2Index = parseInt(h2Match[1]) - 1
    const h2Matches = [...result.matchAll(/<h2[^>]*>/gi)]

    if (h2Matches[h2Index]) {
      const h2End = result.indexOf('</h2>', h2Matches[h2Index].index!) + 5
      const imgSrc = img.url ?? ''
      const imgTag = `\n<figure class="wp-block-image"><img src="${imgSrc}" alt="${img.altText ?? ''}" loading="lazy" /></figure>\n`
      result = result.slice(0, h2End) + imgTag + result.slice(h2End)
    }
  }

  return result
}
