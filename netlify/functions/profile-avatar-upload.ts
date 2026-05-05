import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const bucketName = process.env.SUPABASE_PROFILE_AVATAR_BUCKET || 'nexbill-profile-avatars'
const maxBytes = 2 * 1024 * 1024

interface UploadPayload {
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
    const fileName = normalizeText(payload.fileName)
    const fileBase64 = normalizeText(payload.fileBase64)
    const contentType = normalizeText(payload.contentType) || 'application/octet-stream'

    if (!fileName || !fileBase64) return json({ error: 'fileName and fileBase64 are required.' }, 400)
    if (!contentType.startsWith('image/')) return json({ error: 'Avatar must be an image file.' }, 400)

    const fileBuffer = Buffer.from(fileBase64, 'base64')
    if (!fileBuffer.length) return json({ error: 'Avatar file is empty.' }, 400)
    if (fileBuffer.length > maxBytes) return json({ error: 'Avatar exceeds the 2 MB limit.' }, 413)

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) return json({ error: 'Invalid or expired Supabase session.' }, 401)

    await ensureBucket(supabase)

    const storagePath = `profiles/${user.id}/${Date.now()}-${safeFileName(fileName)}`
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, { contentType, upsert: false })
    if (uploadError) throw uploadError

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucketName).getPublicUrl(storagePath)

    await updateProfileAvatarIfColumnExists(supabase, user.id, publicUrl)

    const metadata = user.user_metadata as Record<string, unknown>
    const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...metadata,
        avatar_url: publicUrl,
      },
    })
    if (metadataError) throw metadataError

    const { error: auditError } = await supabase.from('audit_events').insert({
      actor_id: user.id,
      event_type: 'profile_avatar_uploaded',
      table_name: 'profiles',
      record_id: user.id,
      metadata: {
        fileName,
        contentType,
        bytes: fileBuffer.length,
        storagePath,
      },
    })
    if (auditError) console.warn(auditError)

    return json({ avatarUrl: publicUrl, storagePath })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Profile avatar upload failed' }, 500)
  }
}

async function ensureBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.getBucket(bucketName)
  if (!error) return

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: maxBytes,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })
  if (createError && !createError.message.toLowerCase().includes('already exists')) throw createError
}

async function updateProfileAvatarIfColumnExists(supabase: SupabaseClient, userId: string, avatarUrl: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)

  if (!error) return
  const message = error.message.toLowerCase()
  if (message.includes('avatar_url') || message.includes('column')) return
  throw error
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
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'avatar'
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
