import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

interface GovernanceImportRecord {
  module: string
  itemCode: string
  title: string
  summary: string
  status: string
  priority?: string
  ragStatus?: string
  workstream?: string
  phase?: string
  geo?: string
  ownerName?: string
  ownerEmail?: string
  supportName?: string
  supportEmail?: string
  dueDate?: string
  lastUpdatedAt?: string
  closedAt?: string
  sourceRef?: Record<string, unknown>
  details?: Record<string, unknown>
}

const importRoles = new Set(['super_admin', 'program_manager', 'ctm'])
const allowedModules = new Set([
  'actions',
  'risks',
  'issues',
  'dependencies',
  'assumptions',
  'decisions',
  'benefits',
  'lessons',
  'scope_changes',
  'financials',
  'schedule',
  'go_live',
  'documents',
  'future_projects',
  'program_site',
])

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const payload = JSON.parse(event.body ?? '{}') as { records?: GovernanceImportRecord[] }
    const records = payload.records ?? []

    if (!records.length) return json({ inserted: 0, skipped: 0, message: 'No records supplied' })

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({
        inserted: 0,
        skipped: records.length,
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server-side commit.',
      })
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const token = readBearerToken(event.headers.authorization ?? event.headers.Authorization)
    if (!token) return json({ error: 'Missing Supabase access token.' }, 401)

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
    if (!roles?.some((role) => importRoles.has(String(role.role)))) {
      return json({ error: 'Workbook import requires super admin, program manager, or CTM access.' }, 403)
    }

    const { records: importRecords, skipped } = normalizeImportRecords(records)
    if (!importRecords.length) {
      return json({
        inserted: 0,
        updated: 0,
        skipped,
        message: 'No valid records were found. Check workbook IDs and mapped modules.',
      })
    }

    const itemCodes = importRecords.map((record) => record.itemCode)
    const { data: existingRows, error: existingError } = await supabase
      .from('governance_items')
      .select('item_code')
      .in('item_code', itemCodes)
    if (existingError) throw existingError
    const existingCodes = new Set((existingRows ?? []).map((row) => row.item_code))

    const rows = importRecords.map((record) => ({
      module: record.module,
      item_code: record.itemCode,
      title: record.title,
      summary: nullableText(record.summary),
      status: record.status,
      priority: nullableText(record.priority),
      rag_status: nullableText(record.ragStatus),
      workstream: nullableText(record.workstream),
      phase: nullableText(record.phase),
      geo: nullableText(record.geo),
      owner_name: nullableText(record.ownerName),
      owner_email: nullableText(record.ownerEmail),
      support_name: nullableText(record.supportName),
      support_email: nullableText(record.supportEmail),
      due_date: parseImportDate(record.dueDate),
      last_updated_at: parseImportDate(record.lastUpdatedAt) ?? new Date().toISOString().slice(0, 10),
      closed_at: parseImportDate(record.closedAt),
      source_ref: record.sourceRef ?? {},
      details: record.details ?? {},
      created_by: user.id,
      updated_by: user.id,
    }))

    for (const [index, batch] of chunk(rows, 100).entries()) {
      const { error } = await supabase.from('governance_items').upsert(batch, { onConflict: 'item_code' })
      if (error) throw new Error(`Import batch ${index + 1} failed: ${error.message}`)
    }

    const updated = importRecords.filter((record) => existingCodes.has(record.itemCode)).length
    return json({ inserted: rows.length - updated, updated, skipped })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Commit failed' }, 500)
  }
}

function normalizeImportRecords(records: GovernanceImportRecord[]) {
  let skipped = 0
  const byCode = new Map<string, GovernanceImportRecord>()

  for (const record of records) {
    const module = normalizeText(record.module)
    const itemCode = normalizeText(record.itemCode)
    if (!allowedModules.has(module) || !itemCode) {
      skipped += 1
      continue
    }

    if (byCode.has(itemCode)) skipped += 1
    byCode.set(itemCode, {
      ...record,
      module,
      itemCode,
      title: normalizeText(record.title) || itemCode,
      summary: normalizeText(record.summary) || normalizeText(record.title) || itemCode,
      status: normalizeText(record.status) || 'New',
      sourceRef: cleanJson(record.sourceRef),
      details: cleanJson(record.details),
    })
  }

  return { records: [...byCode.values()], skipped }
}

function readBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function nullableText(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function cleanJson(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function parseImportDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    epoch.setUTCDate(epoch.getUTCDate() + value)
    return epoch.toISOString().slice(0, 10)
  }

  const text = normalizeText(value)
  if (!text || ['-', '--', 'n/a', 'na', 'not set', 'tbc', 'tbd'].includes(text.toLowerCase())) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return isValidDate(text) ? text : null

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getUTCFullYear()
  if (year < 2000 || year > 2100) return null
  return parsed.toISOString().slice(0, 10)
}

function isValidDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
