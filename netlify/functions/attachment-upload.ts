import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const bucketName = process.env.SUPABASE_ATTACHMENT_BUCKET || 'nexbill-attachments'
const uploadRoles = new Set(['super_admin', 'program_manager', 'ctm'])
const maxBytes = 10 * 1024 * 1024

interface UploadPayload {
  itemId?: string
  fileName?: string
  contentType?: string
  fileBase64?: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' }, 500)
    }

    const token = readBearerToken(event.headers.authorization ?? event.headers.Authorization)
    if (!token) return json({ error: 'Missing Supabase access token.' }, 401)

    const payload = JSON.parse(event.body ?? '{}') as UploadPayload
    const itemId = normalizeText(payload.itemId)
    const fileName = normalizeText(payload.fileName)
    const fileBase64 = normalizeText(payload.fileBase64)
    const contentType = normalizeText(payload.contentType) || 'application/octet-stream'

    if (!isUuid(itemId)) return json({ error: 'A saved governance item is required before uploading attachments.' }, 400)
    if (!fileName || !fileBase64) return json({ error: 'fileName and fileBase64 are required.' }, 400)

    const fileBuffer = Buffer.from(fileBase64, 'base64')
    if (!fileBuffer.length) return json({ error: 'Attachment file is empty.' }, 400)
    if (fileBuffer.length > maxBytes) return json({ error: 'Attachment exceeds the 10 MB limit.' }, 413)

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) return json({ error: 'Invalid or expired Supabase session.' }, 401)

    const access = await readItemAccess(supabase, itemId, user.id, user.email)
    if (!access.canWrite) return json({ error: 'You do not have permission to upload attachments for this item.' }, 403)

    await ensureBucket(supabase)

    const storagePath = `governance-items/${itemId}/${Date.now()}-${safeFileName(fileName)}`
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, { contentType, upsert: false })
    if (uploadError) throw uploadError

    const { data: attachment, error: insertError } = await supabase
      .from('attachments')
      .insert({
        item_id: itemId,
        file_name: fileName,
        storage_path: storagePath,
        content_type: contentType,
        uploaded_by: user.id,
      })
      .select('id,item_id,file_name,storage_path,content_type,uploaded_by,created_at')
      .single()
    if (insertError) throw insertError

    const auditError = await writeAuditEvent(supabase, user.id, {
      eventType: 'attachment_uploaded',
      tableName: 'attachments',
      recordId: attachment.id,
      metadata: {
        itemId,
        itemCode: access.item?.item_code,
        fileName,
        contentType,
        bytes: fileBuffer.length,
      },
    })
    if (auditError) console.warn(auditError)

    return json({
      attachment: {
        id: attachment.id,
        itemId: attachment.item_id,
        fileName: attachment.file_name,
        storagePath: attachment.storage_path,
        contentType: attachment.content_type,
        uploadedBy: attachment.uploaded_by,
        uploadedByName: access.profile?.full_name ?? user.email,
        uploadedByEmail: access.profile?.email ?? user.email,
        createdAt: attachment.created_at,
      },
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Attachment upload failed' }, 500)
  }
}

async function ensureBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.getBucket(bucketName)
  if (!error) return

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: maxBytes,
  })
  if (createError && !createError.message.toLowerCase().includes('already exists')) throw createError
}

async function readItemAccess(supabase: SupabaseClient, itemId: string, userId: string, userEmail?: string) {
  const { data: item, error: itemError } = await supabase
    .from('governance_items')
    .select('id,item_code,title,owner_id,support_id,owner_email,support_email,created_by')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) throw itemError
  if (!item) return { canWrite: false }

  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  if (roleError) throw roleError

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name,email')
    .eq('id', userId)
    .maybeSingle()

  const roleNames = new Set((roles ?? []).map((role) => String(role.role)))
  const isExecutiveOnly = roleNames.size > 0 && [...roleNames].every((role) => role === 'executive')
  const email = normalizeText(userEmail).toLowerCase()
  const isActor =
    item.owner_id === userId ||
    item.support_id === userId ||
    item.created_by === userId ||
    normalizeText(item.owner_email).toLowerCase() === email ||
    normalizeText(item.support_email).toLowerCase() === email

  return {
    item,
    profile,
    canWrite: !isExecutiveOnly && ([...roleNames].some((role) => uploadRoles.has(role)) || isActor),
  }
}

async function writeAuditEvent(
  supabase: SupabaseClient,
  actorId: string,
  event: { eventType: string; tableName: string; recordId?: string; metadata?: Record<string, unknown> },
) {
  const { error } = await supabase.from('audit_events').insert({
    actor_id: actorId,
    event_type: event.eventType,
    table_name: event.tableName,
    record_id: event.recordId ?? null,
    metadata: event.metadata ?? {},
  })
  return error
}

function readBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'attachment'
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
