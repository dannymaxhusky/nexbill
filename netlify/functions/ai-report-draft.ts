import type { Handler } from '@netlify/functions'

type ReportType = 'team_leads' | 'stakeholders' | 'executive'

interface GovernanceItemPayload {
  id: string
  module: string
  itemCode: string
  title: string
  summary: string
  status: string
  priority?: string
  ragStatus?: string
  workstream?: string
  ownerName?: string
  dueDate?: string
  lastUpdatedAt: string
  sourceRef?: {
    workbook?: string
    sheet?: string
    row?: number
    sourceId?: string
  }
}

interface OpenAiConfig {
  apiKey: string
  model: string
  baseUrl: string
}

const reportLabels: Record<ReportType, string> = {
  team_leads: 'Team Leads Operational View',
  stakeholders: 'Stakeholder / SME View',
  executive: 'Executive SteerCo View',
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const payload = JSON.parse(event.body ?? '{}') as {
      reportType?: ReportType
      items?: GovernanceItemPayload[]
      user?: { fullName?: string; role?: string }
    }

    const reportType = payload.reportType ?? 'executive'
    const items = (payload.items ?? []).slice(0, 80)
    const openAiConfig = readOpenAiConfig()
    const draft = openAiConfig
      ? await generateOpenAiDraft(reportType, items, openAiConfig)
      : generateDeterministicDraft(reportType, items)

    return json(draft)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to generate report' }, 500)
  }
}

async function generateOpenAiDraft(reportType: ReportType, items: GovernanceItemPayload[], config: OpenAiConfig) {
  const prompt = [
    'You are the NexBill program governance reporting assistant.',
    'Generate a concise governance report draft in strict JSON.',
    'Rules: do not invent facts; cite item codes; keep AI as draft-only; every risk, decision, and next step must come from supplied records.',
    `Report type: ${reportLabels[reportType]}`,
    `Records: ${JSON.stringify(items.map(toCompactItem))}`,
    'Return JSON with title, summary, risks[], decisions[], nextSteps[], confidenceNotes.',
  ].join('\n')

  const parsed = await requestStructuredJson(config, prompt, 'nexbill_report_draft', {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' } },
      decisions: { type: 'array', items: { type: 'string' } },
      nextSteps: { type: 'array', items: { type: 'string' } },
      confidenceNotes: { type: 'string' },
    },
    required: ['title', 'summary', 'risks', 'decisions', 'nextSteps', 'confidenceNotes'],
  }) as {
    title?: string
    summary?: string
    risks?: string[]
    decisions?: string[]
    nextSteps?: string[]
    confidenceNotes?: string
  }

  return {
    id: `ai-${Date.now()}`,
    type: reportType,
    title: parsed.title ?? `${reportLabels[reportType]} - AI draft`,
    summary: parsed.summary ?? '',
    risks: parsed.risks ?? [],
    decisions: parsed.decisions ?? [],
    nextSteps: parsed.nextSteps ?? [],
    citations: items.slice(0, 10).map((item) => ({
      itemCode: item.itemCode,
      module: item.module,
      title: item.title,
      source: item.sourceRef,
    })),
    createdAt: new Date().toISOString(),
    confidenceNotes: parsed.confidenceNotes ?? `Generated through ${describeBaseUrl(config.baseUrl)}.`,
  }
}

async function requestStructuredJson(config: OpenAiConfig, prompt: string, schemaName: string, schema: Record<string, unknown>) {
  try {
    return await requestResponsesJson(config, prompt, schemaName, schema)
  } catch (error) {
    if (!shouldTryChatCompletions(error)) throw error
    return requestChatCompletionsJson(config, prompt, schemaName, schema)
  }
}

async function requestResponsesJson(config: OpenAiConfig, prompt: string, schemaName: string, schema: Record<string, unknown>) {
  const response = await fetch(resolveEndpoint(config.baseUrl, 'responses'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema,
        },
      },
    }),
  })

  if (!response.ok) throw createOpenAiError('responses', response.status, await safeResponseText(response))

  const data = (await response.json()) as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
  }
  const outputText = data.output_text ?? data.output?.[0]?.content?.[0]?.text
  if (!outputText) throw new Error('OpenAI response did not include output text')
  return JSON.parse(outputText)
}

async function requestChatCompletionsJson(config: OpenAiConfig, prompt: string, schemaName: string, schema: Record<string, unknown>) {
  const response = await fetch(resolveEndpoint(config.baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'Return only valid JSON matching the requested schema.' },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema,
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) throw createOpenAiError('chat/completions', response.status, await safeResponseText(response))

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const outputText = data.choices?.[0]?.message?.content
  if (!outputText) throw new Error('OpenAI chat response did not include message content')
  return JSON.parse(outputText)
}

function generateDeterministicDraft(reportType: ReportType, items: GovernanceItemPayload[]) {
  const sorted = [...items].sort((a, b) => priorityScore(b) - priorityScore(a))
  const risks = sorted.filter((item) => ['risks', 'issues'].includes(item.module) || priorityScore(item) >= 3).slice(0, 4)
  const decisions = sorted.filter((item) => ['decisions', 'scope_changes'].includes(item.module)).slice(0, 4)
  const nextSteps = sorted.slice(0, 5)

  return {
    id: `local-${Date.now()}`,
    type: reportType,
    title: `${reportLabels[reportType]} - draft`,
    summary: `Current view contains ${items.length} source-backed governance records. Attention should focus on ${risks.length} risk or issue records, ${decisions.length} decision or scope records, and owner updates for near-term deliverables.`,
    risks: risks.map((item) => `${item.itemCode}: ${item.title}`),
    decisions: decisions.map((item) => `${item.itemCode}: ${item.title}`),
    nextSteps: nextSteps.map((item) => `Confirm latest status and next owner action for ${item.itemCode} (${item.ownerName ?? 'unassigned'}).`),
    citations: sorted.slice(0, 10).map((item) => ({
      itemCode: item.itemCode,
      module: item.module,
      title: item.title,
      source: item.sourceRef,
    })),
    createdAt: new Date().toISOString(),
    confidenceNotes: 'Generated without external AI because OPENAI_API_KEY or OPENAI_MODEL is not configured.',
  }
}

function readOpenAiConfig(): OpenAiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_MODEL?.trim()
  if (!apiKey || !model) return null
  return {
    apiKey,
    model,
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL),
  }
}

function normalizeBaseUrl(value?: string) {
  return (value?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
}

function resolveEndpoint(baseUrl: string, path: 'responses' | 'chat/completions') {
  if (baseUrl.endsWith('/responses') || baseUrl.endsWith('/chat/completions')) return baseUrl
  return `${baseUrl}/${path}`
}

function shouldTryChatCompletions(error: unknown) {
  return error instanceof Error && /OpenAI responses request failed: (400|404|405|501)/.test(error.message)
}

function createOpenAiError(api: string, status: number, detail: string) {
  return new Error(`OpenAI ${api} request failed: ${status}${detail ? ` ${detail.slice(0, 220)}` : ''}`)
}

async function safeResponseText(response: Response) {
  return response.text().catch(() => '')
}

function describeBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return 'configured OpenAI-compatible endpoint'
  }
}

function toCompactItem(item: GovernanceItemPayload) {
  return {
    code: item.itemCode,
    module: item.module,
    title: item.title,
    summary: item.summary,
    status: item.status,
    priority: item.priority ?? item.ragStatus,
    owner: item.ownerName,
    dueDate: item.dueDate,
    source: item.sourceRef,
  }
}

function priorityScore(item: GovernanceItemPayload) {
  const text = `${item.priority ?? ''} ${item.ragStatus ?? ''}`.toLowerCase()
  if (text.includes('critical') || text.includes('red') || text.includes('very high')) return 4
  if (text.includes('high') || text.includes('amber')) return 3
  if (text.includes('medium')) return 2
  if (text.includes('low') || text.includes('green')) return 1
  return 0
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
