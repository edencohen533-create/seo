import Anthropic from '@anthropic-ai/sdk'
import { SEO_SYSTEM_PROMPT } from './systemPrompt'
import { buildPrompt, type TemplateType, type TemplateInput } from './templates'

export type OutputFormat = 'text' | 'json' | 'markdown'

export interface CallClaudeOptions {
  templateType: TemplateType
  input: TemplateInput
  outputFormat?: OutputFormat
  maxTokens?: number
  model?: string
  overrideSystemPrompt?: string
}

export interface CallClaudeResult<T = string> {
  data: T
  templateType: TemplateType
  estimatedTokensSent: number
  model: string
}

function getClient(): Anthropic {
  const apiKey =
    process.env.CLAUDE_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.seo
  if (!apiKey) {
    throw new Error(
      'Missing AI API key. Set CLAUDE_API_KEY in environment variables.'
    )
  }
  return new Anthropic({ apiKey })
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function callClaude<T = string>(
  options: CallClaudeOptions
): Promise<CallClaudeResult<T>> {
  const client = getClient()

  const model = options.model ?? 'claude-sonnet-4-6'
  const systemPrompt = options.overrideSystemPrompt ?? SEO_SYSTEM_PROMPT
  const userPrompt = buildPrompt(options.templateType, options.input)

  const totalText = systemPrompt + userPrompt
  const estimatedTokensSent = estimateTokens(totalText)

  const jsonInstruction =
    options.outputFormat === 'json'
      ? '\n\nהחזר ONLY valid JSON, ללא markdown, ללא הסבר.'
      : ''

  console.log(`[callClaude] template=${options.templateType} model=${model} ~tokens=${estimatedTokensSent}`)

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 8000,
    system: systemPrompt + jsonInstruction,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')

  let data: T

  if (options.outputFormat === 'json') {
    const cleaned = block.text
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .trim()
    data = JSON.parse(cleaned) as T
  } else {
    data = block.text as unknown as T
  }

  return { data, templateType: options.templateType, estimatedTokensSent, model }
}

export async function callClaudeText(
  templateType: TemplateType,
  input: TemplateInput,
  options?: Partial<Omit<CallClaudeOptions, 'templateType' | 'input' | 'outputFormat'>>
): Promise<string> {
  const result = await callClaude<string>({ templateType, input, outputFormat: 'text', ...options })
  return result.data
}

export async function callClaudeJson<T>(
  templateType: TemplateType,
  input: TemplateInput,
  options?: Partial<Omit<CallClaudeOptions, 'templateType' | 'input' | 'outputFormat'>>
): Promise<T> {
  const result = await callClaude<T>({ templateType, input, outputFormat: 'json', ...options })
  return result.data
}
