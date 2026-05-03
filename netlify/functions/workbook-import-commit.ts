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

    const itemCodes = records.map((record) => record.itemCode).filter(Boolean)
    const { data: existingRows, error: existingError } = await supabase
      .from('governance_items')
      .select('item_code')
      .in('item_code', itemCodes)
    if (existingError) throw existingError
    const existingCodes = new Set((existingRows ?? []).map((row) => row.item_code))

    const rows = records.map((record) => ({
      module: record.module,
      item_code: record.itemCode,
      title: record.title,
      summary: record.summary,
      status: record.status,
      priority: record.priority ?? null,
      rag_status: record.ragStatus ?? null,
      workstream: record.workstream ?? null,
      phase: record.phase ?? null,
      geo: record.geo ?? null,
      owner_name: record.ownerName ?? null,
      owner_email: record.ownerEmail ?? null,
      support_name: record.supportName ?? null,
      support_email: record.supportEmail ?? null,
      due_date: record.dueDate ?? null,
      last_updated_at: record.lastUpdatedAt ?? new Date().toISOString().slice(0, 10),
      closed_at: record.closedAt ?? null,
      source_ref: record.sourceRef ?? {},
      details: record.details ?? {},
      created_by: user.id,
      updated_by: user.id,
    }))

    const { error } = await supabase.from('governance_items').upsert(rows, { onConflict: 'item_code' })
    if (error) throw error

    const updated = records.filter((record) => existingCodes.has(record.itemCode)).length
    return json({ inserted: rows.length - updated, updated, skipped: 0 })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Commit failed' }, 500)
  }
}

function readBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
