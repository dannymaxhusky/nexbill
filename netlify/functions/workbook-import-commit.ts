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
    }))

    const { error } = await supabase.from('governance_items').upsert(rows, { onConflict: 'item_code' })
    if (error) throw error

    return json({ inserted: rows.length, skipped: 0 })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Commit failed' }, 500)
  }
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
