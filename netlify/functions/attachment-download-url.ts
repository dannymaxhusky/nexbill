import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const bucketName = process.env.SUPABASE_ATTACHMENT_BUCKET || 'nexbill-attachments'
const readRoles = new Set(['super_admin', 'program_manager', 'ctm', 'executive'])

interface DownloadPayload {
  attachmentId?: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' }, 500)
    }

    const token = readBearerToken(event.headers.authorization ?? event.headers.Authorization)
    if (!token) return json({ error: 'Missing Supabase access token.' }, 401)

    const payload = JSON.parse(event.body ?? '{}') as DownloadPayload
    const attachmentId = normalizeText(payload.attachmentId)
    if (!isUuid(attachmentId)) return json({ error: 'attachmentId is required.' }, 400)

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) return json({ error: 'Invalid or expired Supabase session.' }, 401)

    const { data: attachment, error: attachmentError } = await supabase
      .from('attachments')
      .select('id,item_id,file_name,storage_path')
      .eq('id', attachmentId)
      .maybeSingle()
    if (attachmentError) throw attachmentError
    if (!attachment) return json({ error: 'Attachment was not found.' }, 404)

    const access = attachment.item_id
      ? await readItemAccess(supabase, attachment.item_id, user.id, user.email)
      : { canRead: true }
    if (!access.canRead) return json({ error: 'You do not have permission to download this attachment.' }, 403)

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(attachment.storage_path, 300, {
        download: attachment.file_name,
      })
    if (error) throw error

    return json({ url: data.signedUrl })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Download link failed' }, 500)
  }
}

async function readItemAccess(supabase: SupabaseClient, itemId: string, userId: string, userEmail?: string) {
  const { data: item, error: itemError } = await supabase
    .from('governance_items')
    .select('id,owner_id,support_id,owner_email,support_email,created_by')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) throw itemError
  if (!item) return { canRead: false }

  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  if (roleError) throw roleError

  const roleNames = new Set((roles ?? []).map((role) => String(role.role)))
  const email = normalizeText(userEmail).toLowerCase()
  const isActor =
    item.owner_id === userId ||
    item.support_id === userId ||
    item.created_by === userId ||
    normalizeText(item.owner_email).toLowerCase() === email ||
    normalizeText(item.support_email).toLowerCase() === email

  return {
    canRead: [...roleNames].some((role) => readRoles.has(role)) || isActor,
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

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
