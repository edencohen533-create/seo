import Anthropic from '@anthropic-ai/sdk'

export type ClaudeModel = 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001'

export interface GenerateOptions {
  model?: ClaudeModel
  maxTokens?: number
  system?: string
  temperature?: number
}

function getClient(): Anthropic {
  const apiKey =
    process.env.CLAUDE_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.seo
  if (!apiKey) throw new Error('Missing API key: set CLAUDE_API_KEY in environment variables.')
  return new Anthropic({ apiKey })
}

export async function generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const client = getClient()
  const response = await client.messages.create({
    model: options.model ?? 'claude-sonnet-4-6',
    max_tokens: options.maxTokens ?? 8000,
    system: options.system,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}

export async function generateJson<T>(prompt: string, options: GenerateOptions = {}): Promise<T> {
  const text = await generate(prompt, {
    ...options,
    system: (options.system ?? '') + '\nReturn ONLY valid JSON, no markdown, no explanation.',
  })

  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(cleaned) as T
}

export async function* generateStream(
  prompt: string,
  options: GenerateOptions = {}
): AsyncGenerator<string> {
  const client = getClient()
  const stream = await client.messages.stream({
    model: options.model ?? 'claude-sonnet-4-6',
    max_tokens: options.maxTokens ?? 8000,
    system: options.system,
    messages: [{ role: 'user', content: prompt }],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}
