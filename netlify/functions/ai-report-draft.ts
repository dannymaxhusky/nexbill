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
    const draft = process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
      ? await generateOpenAiDraft(reportType, items)
      : generateDeterministicDraft(reportType, items)

    return json(draft)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to generate report' }, 500)
  }
}

async function generateOpenAiDraft(reportType: ReportType, items: GovernanceItemPayload[]) {
  const prompt = [
    'You are the NexBill program governance reporting assistant.',
    'Generate a concise governance report draft in strict JSON.',
    'Rules: do not invent facts; cite item codes; keep AI as draft-only; every risk, decision, and next step must come from supplied records.',
    `Report type: ${reportLabels[reportType]}`,
    `Records: ${JSON.stringify(items.map(toCompactItem))}`,
    'Return JSON with title, summary, risks[], decisions[], nextSteps[], confidenceNotes.',
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'nexbill_report_draft',
          schema: {
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
          },
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
  }
  const outputText = data.output_text ?? data.output?.[0]?.content?.[0]?.text
  if (!outputText) throw new Error('OpenAI response did not include output text')
  const parsed = JSON.parse(outputText)

  return {
    id: `ai-${Date.now()}`,
    type: reportType,
    title: parsed.title,
    summary: parsed.summary,
    risks: parsed.risks,
    decisions: parsed.decisions,
    nextSteps: parsed.nextSteps,
    citations: items.slice(0, 10).map((item) => ({
      itemCode: item.itemCode,
      module: item.module,
      title: item.title,
      source: item.sourceRef,
    })),
    createdAt: new Date().toISOString(),
    confidenceNotes: parsed.confidenceNotes,
  }
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
