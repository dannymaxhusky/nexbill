import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

interface AuditEventPayload {
  eventType?: string
  tableName?: string
  recordId?: string
  metadata?: Record<string, unknown>
}

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

    const payload = JSON.parse(event.body ?? '{}') as AuditEventPayload
    const eventType = normalizeText(payload.eventType)
    const tableName = normalizeText(payload.tableName)
    if (!eventType || !tableName) return json({ error: 'eventType and tableName are required.' }, 400)

    const { error } = await supabase.from('audit_events').insert({
      actor_id: user.id,
      event_type: eventType.slice(0, 120),
      table_name: tableName.slice(0, 120),
      record_id: isUuid(payload.recordId) ? payload.recordId : null,
      metadata: cleanMetadata(payload.metadata),
    })
    if (error) throw error

    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Audit event failed' }, 500)
  }
}

function readBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
