import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

type Severity = 'critical' | 'high' | 'medium' | 'low'

interface SourceRefPayload {
  workbook?: string
  sheet?: string
  row?: number
  sourceId?: string
  note?: string
}

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
  ownerEmail?: string
  supportName?: string
  supportEmail?: string
  dueDate?: string
  lastUpdatedAt: string
  sourceRef?: SourceRefPayload
  details?: Record<string, unknown>
}

interface TriageFinding {
  severity: Severity
  category: string
  itemCode: string
  finding: string
  whyItMatters: string
  suggestedFix: string
  sourceRef?: SourceRefPayload
}

interface TriageOutput {
  summary: string
  findings: TriageFinding[]
  recommendedFixes: string[]
  confidenceNotes: string
  createdAt: string
}

interface OpenAiConfig {
  apiKey: string
  model: string
  models: string[]
  baseUrl: string
}

const triageRoles = new Set(['super_admin', 'program_manager', 'ctm'])

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' }, 500)
    }

    const token = readBearerToken(event.headers.authorization ?? event.headers.Authorization)
    if (!token) return json({ error: 'Missing Supabase access token.' }, 401)

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) return json({ error: 'Invalid or expired Supabase session.' }, 401)

    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    if (roleError) throw roleError
    if (!roles?.some((role) => triageRoles.has(String(role.role)))) {
      return json({ error: 'AI governance triage requires Super Admin, Program Manager, or CTM access.' }, 403)
    }

    const payload = JSON.parse(event.body ?? '{}') as {
      scope?: string
      filters?: Record<string, unknown>
      items?: GovernanceItemPayload[]
    }
    const items = (payload.items ?? []).map(normalizeItem).filter(Boolean).slice(0, 100) as GovernanceItemPayload[]
    if (!items.length) return json({ error: 'No records were supplied for AI governance triage.' }, 400)

    const openAiConfig = readOpenAiConfig()
    const output = openAiConfig
      ? await generateOpenAiTriage(payload.scope ?? 'current_register_view', payload.filters ?? {}, items, openAiConfig)
      : generateDeterministicTriage(items)

    return json(output)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'AI governance triage failed' }, 500)
  }
}

async function generateOpenAiTriage(scope: string, filters: Record<string, unknown>, items: GovernanceItemPayload[], config: OpenAiConfig): Promise<TriageOutput> {
  const prompt = [
    'You are the NexBill governance quality triage assistant.',
    'Inspect the supplied governance register records and return strict JSON only.',
    'Rules: do not invent facts; every finding must cite exactly one supplied itemCode; use sourceRef only from the supplied record; do not recommend automatic data changes.',
    'Check for missing owner/support/due date, weak summaries, overdue or due-soon open work, stale records, high priority records without mitigation/next steps/decision owner/target dates, missing source references, duplicates, and conflicts.',
    `Scope: ${scope}`,
    `Filters: ${JSON.stringify(filters)}`,
    `Records: ${JSON.stringify(items.map(toCompactItem))}`,
    'Return JSON with summary, findings[], recommendedFixes[], confidenceNotes, createdAt.',
  ].join('\n')

  const output = await requestStructuredJson(config, prompt, 'nexbill_governance_triage', {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            category: { type: 'string' },
            itemCode: { type: 'string' },
            finding: { type: 'string' },
            whyItMatters: { type: 'string' },
            suggestedFix: { type: 'string' },
            sourceRef: {
              type: 'object',
              additionalProperties: false,
              properties: {
                workbook: { type: 'string' },
                sheet: { type: 'string' },
                row: { type: 'number' },
                sourceId: { type: 'string' },
                note: { type: 'string' },
              },
            },
          },
          required: ['severity', 'category', 'itemCode', 'finding', 'whyItMatters', 'suggestedFix', 'sourceRef'],
        },
      },
      recommendedFixes: { type: 'array', items: { type: 'string' } },
      confidenceNotes: { type: 'string' },
      createdAt: { type: 'string' },
    },
    required: ['summary', 'findings', 'recommendedFixes', 'confidenceNotes', 'createdAt'],
  }) as Partial<TriageOutput>

  return cleanTriageOutput({
    ...output,
    confidenceNotes: normalizeText(output.confidenceNotes) || `Generated through ${describeBaseUrl(config.baseUrl)}.`,
    createdAt: normalizeText(output.createdAt) || new Date().toISOString(),
  }, items)
}

async function requestStructuredJson(config: OpenAiConfig, prompt: string, schemaName: string, schema: Record<string, unknown>) {
  const modelErrors: string[] = []

  for (const model of config.models) {
    const modelConfig = { ...config, model }
    try {
      try {
        return await requestResponsesJson(modelConfig, prompt, schemaName, schema)
      } catch (error) {
        if (!shouldTryChatCompletions(error)) throw error
        return await requestChatCompletionsJson(modelConfig, prompt, schemaName, schema)
      }
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error
      modelErrors.push(`${model}: ${readErrorMessage(error)}`)
    }
  }

  throw new Error(`All configured OpenAI models failed: ${modelErrors.join(' | ')}`)
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

function generateDeterministicTriage(items: GovernanceItemPayload[]): TriageOutput {
  const findings: TriageFinding[] = []
  const openItems = items.filter((item) => !isClosedStatus(item.status))

  for (const item of openItems) {
    if (!normalizeText(item.ownerName) && !normalizeText(item.ownerEmail)) {
      findings.push(createFinding('high', 'Missing owner', item, 'Owner is not set.', 'Unowned governance records are difficult to chase and escalate.', 'Assign a named owner and owner email.'))
    }
    if (!normalizeText(item.supportName) && !normalizeText(item.supportEmail)) {
      findings.push(createFinding('medium', 'Missing support', item, 'Support is not set.', 'Support coverage helps keep actions moving when the owner is unavailable.', 'Add a support contact or confirm no support is needed.'))
    }
    if (!normalizeText(item.dueDate)) {
      findings.push(createFinding('high', 'Missing due date', item, 'Due date is not set.', 'Open work without a due date cannot be reliably tracked for overdue or due-soon reporting.', 'Add a target due date.'))
    }
    if (normalizeText(item.summary).length < 25) {
      findings.push(createFinding('medium', 'Weak summary', item, 'Summary is too short or not actionable.', 'Management reporting depends on concise context, impact, and next action.', 'Rewrite the summary with context, impact, and the next owner action.'))
    }

    const dueDays = daysBetween(item.dueDate)
    if (dueDays < 0) {
      findings.push(createFinding('critical', 'Overdue open item', item, `Due date is ${Math.abs(dueDays)} days overdue.`, 'Overdue open work can block dependent milestones and makes status reporting unreliable.', 'Confirm the latest owner action, update status, and reset or close the due date.'))
    } else if (dueDays <= 7) {
      findings.push(createFinding('medium', 'Due soon', item, `Due date is within ${dueDays} day(s).`, 'Near-term work should have a clear next step before it becomes overdue.', 'Confirm readiness, next action, and whether escalation is needed.'))
    }

    const staleDays = daysSince(item.lastUpdatedAt)
    if (staleDays > 14) {
      findings.push(createFinding('medium', 'Stale record', item, `Last updated ${staleDays} days ago.`, 'Stale open records reduce trust in dashboard and SteerCo reporting.', 'Ask the owner for a current update and refresh last updated status.'))
    }

    if (priorityScore(item) >= 3 && !hasActionableDetail(item)) {
      findings.push(createFinding('high', 'High priority without plan', item, 'High or critical record lacks mitigation, next step, decision owner, or target date detail.', 'High-priority records need enough detail for governance follow-up and escalation.', 'Add mitigation, next step, decision owner, or target date in module details.'))
    }

    if (!hasTraceableSource(item.sourceRef)) {
      findings.push(createFinding('low', 'Missing source reference', item, 'Source reference is incomplete.', 'AI-generated reporting needs a workbook/sheet/row or source ID to stay traceable.', 'Add workbook, sheet, row, source ID, or manual source note.'))
    }
  }

  findings.push(...findDuplicateFindings(openItems))
  const cappedFindings = findings.slice(0, 40)

  return {
    summary: `AI quality check reviewed ${openItems.length} open records and found ${cappedFindings.length} quality findings. ${severitySummary(cappedFindings)}`,
    findings: cappedFindings,
    recommendedFixes: recommendedFixes(cappedFindings),
    confidenceNotes: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
      ? 'Deterministic fallback was used after AI output validation.'
      : 'Generated without external AI because OPENAI_API_KEY or OPENAI_MODEL is not configured.',
    createdAt: new Date().toISOString(),
  }
}

function readOpenAiConfig(): OpenAiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const models = readOpenAiModels()
  const model = models[0]
  if (!apiKey || !model) return null
  return {
    apiKey,
    model,
    models,
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL),
  }
}

function readOpenAiModels() {
  return uniqueValues([
    process.env.OPENAI_MODEL,
    ...(process.env.OPENAI_MODEL_FALLBACKS ?? process.env.OPENAI_MODELS ?? '')
      .split(',')
      .map((model) => model.trim()),
  ])
}

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
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

function shouldTryNextModel(error: unknown) {
  return error instanceof Error && (
    /OpenAI (responses|chat\/completions) request failed: (404|429|503)/.test(error.message) ||
    /model_not_found|no available channel|无可用渠道|distributor/i.test(error.message)
  )
}

function createOpenAiError(api: string, status: number, detail: string) {
  return new Error(`OpenAI ${api} request failed: ${status}${detail ? ` ${detail.slice(0, 220)}` : ''}`)
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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

function cleanTriageOutput(output: Partial<TriageOutput>, items: GovernanceItemPayload[]): TriageOutput {
  const itemsByCode = new Map(items.map((item) => [item.itemCode, item]))
  const findings = Array.isArray(output.findings) ? output.findings : []
  return {
    summary: normalizeText(output.summary) || `AI quality check reviewed ${items.length} records.`,
    findings: findings
      .map((finding) => cleanFinding(finding, itemsByCode))
      .filter((finding): finding is TriageFinding => Boolean(finding))
      .slice(0, 40),
    recommendedFixes: Array.isArray(output.recommendedFixes)
      ? output.recommendedFixes.map(normalizeText).filter(Boolean).slice(0, 8)
      : [],
    confidenceNotes: normalizeText(output.confidenceNotes) || 'Generated from supplied register records only.',
    createdAt: normalizeText(output.createdAt) || new Date().toISOString(),
  }
}

function cleanFinding(value: unknown, itemsByCode: Map<string, GovernanceItemPayload>): TriageFinding | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TriageFinding>
  const itemCode = normalizeText(record.itemCode)
  const item = itemsByCode.get(itemCode)
  if (!item) return null
  return {
    severity: normalizeSeverity(record.severity),
    category: normalizeText(record.category) || 'Governance quality',
    itemCode,
    finding: normalizeText(record.finding) || 'Potential quality issue.',
    whyItMatters: normalizeText(record.whyItMatters) || 'This may reduce reporting confidence.',
    suggestedFix: normalizeText(record.suggestedFix) || 'Review and update this record.',
    sourceRef: item.sourceRef,
  }
}

function normalizeItem(item: GovernanceItemPayload) {
  const itemCode = normalizeText(item.itemCode)
  const title = normalizeText(item.title)
  if (!itemCode || !title) return null
  return {
    ...item,
    id: normalizeText(item.id),
    itemCode,
    title,
    summary: normalizeText(item.summary),
    status: normalizeText(item.status) || 'Open',
    lastUpdatedAt: normalizeText(item.lastUpdatedAt) || new Date().toISOString().slice(0, 10),
    details: item.details && typeof item.details === 'object' ? item.details : {},
  }
}

function toCompactItem(item: GovernanceItemPayload) {
  return {
    id: item.id,
    code: item.itemCode,
    module: item.module,
    title: item.title,
    summary: item.summary,
    status: item.status,
    priority: item.priority ?? item.ragStatus,
    workstream: item.workstream,
    owner: item.ownerName,
    ownerEmail: item.ownerEmail,
    support: item.supportName,
    supportEmail: item.supportEmail,
    dueDate: item.dueDate,
    lastUpdatedAt: item.lastUpdatedAt,
    sourceRef: item.sourceRef,
    details: item.details,
  }
}

function createFinding(
  severity: Severity,
  category: string,
  item: GovernanceItemPayload,
  finding: string,
  whyItMatters: string,
  suggestedFix: string,
): TriageFinding {
  return {
    severity,
    category,
    itemCode: item.itemCode,
    finding,
    whyItMatters,
    suggestedFix,
    sourceRef: item.sourceRef,
  }
}

function findDuplicateFindings(items: GovernanceItemPayload[]) {
  const findings: TriageFinding[] = []
  const groups = new Map<string, GovernanceItemPayload[]>()
  for (const item of items) {
    const key = duplicateKey(item.title)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const codes = group.map((item) => item.itemCode).join(', ')
    for (const item of group.slice(0, 3)) {
      findings.push(createFinding(
        'medium',
        'Potential duplicate',
        item,
        `Similar topic appears across ${codes}.`,
        'Duplicate governance rows make ownership and status reporting harder to trust.',
        'Review these records and consolidate, cross-reference, or clarify ownership.',
      ))
    }
  }
  return findings
}

function duplicateKey(title: string) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !['with', 'from', 'this', 'that', 'nexbill', 'meeting', 'review'].includes(word))
  if (words.length < 4) return ''
  return words.slice(0, 5).sort().join('-')
}

function recommendedFixes(findings: TriageFinding[]) {
  const categories = [...new Set(findings.map((finding) => finding.category))].slice(0, 5)
  if (!categories.length) return ['No immediate quality fixes were found in the current view.']
  return categories.map((category) => {
    const count = findings.filter((finding) => finding.category === category).length
    return `Address ${count} ${category.toLowerCase()} finding${count === 1 ? '' : 's'} in the current view.`
  })
}

function severitySummary(findings: TriageFinding[]) {
  const counts = findings.reduce<Record<Severity, number>>((accumulator, finding) => {
    accumulator[finding.severity] += 1
    return accumulator
  }, { critical: 0, high: 0, medium: 0, low: 0 })
  return `${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`
}

function hasActionableDetail(item: GovernanceItemPayload) {
  const details = item.details ?? {}
  const detailText = Object.entries(details)
    .filter(([key]) => /mitigation|next|action|decision|owner|target|date|response|strategy|update/i.test(key))
    .map(([, value]) => normalizeText(value))
    .join(' ')
  return detailText.length > 20
}

function hasTraceableSource(source?: SourceRefPayload) {
  if (!source) return false
  return Boolean(source.sourceId || source.row || (source.workbook && source.sheet) || source.note)
}

function priorityScore(item: GovernanceItemPayload) {
  const text = `${item.priority ?? ''} ${item.ragStatus ?? ''}`.toLowerCase()
  if (text.includes('critical') || text.includes('red') || text.includes('very high')) return 4
  if (text.includes('high') || text.includes('amber')) return 3
  if (text.includes('medium')) return 2
  if (text.includes('low') || text.includes('green')) return 1
  return 0
}

function daysBetween(dateLike?: string) {
  if (!dateLike) return Number.POSITIVE_INFINITY
  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function daysSince(dateLike?: string) {
  const days = daysBetween(dateLike)
  if (!Number.isFinite(days)) return 0
  return Math.max(0, -days)
}

function isClosedStatus(status?: string) {
  const normalized = normalizeText(status).toLowerCase()
  return ['closed', 'completed', 'actioned', 'duplicate', 'not applicable', 'mitigated'].some((term) => normalized.includes(term))
}

function normalizeSeverity(value: unknown): Severity {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized
  return 'medium'
}

function readBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
