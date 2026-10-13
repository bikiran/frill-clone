// Model abstraction for the Agent Engine.
//
// The engine talks to models only through ModelClient, in a provider-neutral
// message format. The model supplies intelligence; Colvy owns the engine,
// memory, actions, permissions and history. Adding another provider (or a
// locally hosted model) means adding one class here.

import Anthropic from '@anthropic-ai/sdk'
import { modelFor, trackAi, type AiJob } from '@/lib/ai-models'

export type NeutralBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: any }
  | { type: 'tool_result'; id: string; content: string; isError?: boolean }

export type NeutralMessage = { role: 'user' | 'assistant'; content: NeutralBlock[] }

export type ToolSpec = { name: string; description: string; input_schema: any }

export type ModelRequest = {
  tier: 'fast' | 'smart'
  system: string
  messages: NeutralMessage[]
  tools?: ToolSpec[]
  maxTokens?: number
  companyId?: string | null       // whose run this is, for the AI usage numbers
  job?: AiJob                     // bill and pick the model as this job instead of the tier's
}

export type ModelResponse = {
  text: string
  toolCalls: { id: string; name: string; input: any }[]
  content: NeutralBlock[]              // the assistant turn, to append to history
  stop: 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'
  usage: { in: number; out: number }
  model: string
}

export interface ModelClient {
  readonly provider: string
  generate(req: ModelRequest): Promise<ModelResponse>
}

// ── Anthropic ────────────────────────────────────────────────────────────────

function toAnthropic(messages: NeutralMessage[]): any[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content.map(b => {
      if (b.type === 'text') return { type: 'text', text: b.text }
      if (b.type === 'tool_call') return { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} }
      return { type: 'tool_result', tool_use_id: b.id, content: b.content, ...(b.isError ? { is_error: true } : {}) }
    }),
  }))
}

export class AnthropicModel implements ModelClient {
  readonly provider = 'anthropic'
  private client = new Anthropic()

  async generate(req: ModelRequest): Promise<ModelResponse> {
    // Picked per job on Platform admin → AI models (lib/ai-models.ts).
    const job: AiJob = req.job || (req.tier === 'smart' ? 'agent_smart' : 'agent_fast')
    const model = await modelFor(job)
    const response: any = await (this.client as any).beta.messages.create({
      model,
      max_tokens: req.maxTokens || 8000,
      // Agent steps are short decisions; low effort keeps a customer waiting less.
      output_config: { effort: 'low' },
      // If a safety classifier declines, the API retries on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The role prompt + tools are identical every step of a run — cache them.
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      ...(req.tools?.length ? { tools: req.tools } : {}),
      messages: toAnthropic(req.messages),
    })

    await trackAi(job, req.companyId, response)
    const content: NeutralBlock[] = []
    const toolCalls: ModelResponse['toolCalls'] = []
    for (const b of response.content || []) {
      if (b.type === 'text' && b.text) content.push({ type: 'text', text: b.text })
      if (b.type === 'tool_use') {
        content.push({ type: 'tool_call', id: b.id, name: b.name, input: b.input })
        toolCalls.push({ id: b.id, name: b.name, input: b.input })
      }
    }
    const stopMap: Record<string, ModelResponse['stop']> = { end_turn: 'end', tool_use: 'tool_use', max_tokens: 'max_tokens', refusal: 'refusal' }
    return {
      text: content.filter(b => b.type === 'text').map(b => (b as any).text).join('').trim(),
      toolCalls,
      content,
      stop: stopMap[response.stop_reason] || 'other',
      usage: { in: Number(response.usage?.input_tokens || 0), out: Number(response.usage?.output_tokens || 0) },
      model: response.model || model,
    }
  }
}

/** The configured model client. One place to switch providers. */
export function getModelClient(): ModelClient {
  return new AnthropicModel()
}
