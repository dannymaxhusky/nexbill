import { createClient } from '@supabase/supabase-js'
import { detailConfigForModule, detailPayloadFromDetails, detailsFromDetailRow } from './detailTables'
import type { AiReportDraftRecord, AiTriageRun, AttachmentRecord, AuditEvent, CommentUpdate, GovernanceItem, ManagedProfile, ModuleKey, ProgramSitePageRecord, ReportDraft, ReportSnapshot, ReportType, Role, RoleAssignment, TaxonomyEntry, UserProfile } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export interface GovernanceItemRow {
  id: string
  module: ModuleKey
  item_code: string
  title: string
  summary: string | null
  status: string
  priority: string | null
  rag_status: string | null
  workstream: string | null
  phase: string | null
  geo: string | null
  owner_name: string | null
  owner_email: string | null
  support_name: string | null
  support_email: string | null
  due_date: string | null
  last_updated_at: string
  closed_at: string | null
  source_ref: GovernanceItem['sourceRef'] | null
  details?: Record<string, string | number | boolean | null | undefined> | null
}

interface ProfileRelation {
  full_name?: string | null
  email?: string | null
}

interface CommentUpdateRow {
  id: string
  item_id: string
  author_id: string | null
  body: string
  update_type: string
  created_at: string
  profiles?: ProfileRelation | ProfileRelation[] | null
}

interface AttachmentRow {
  id: string
  item_id: string | null
  file_name: string
  storage_path: string
  content_type: string | null
  uploaded_by: string | null
  created_at: string
  profiles?: ProfileRelation | ProfileRelation[] | null
}

interface AuditEventRow {
  id: string
  actor_id: string | null
  event_type: string
  table_name: string
  record_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  profiles?: ProfileRelation | ProfileRelation[] | null
}

interface TaxonomyRow {
  id: string
  group_key: string
  value: string
  label: string | null
  sort_order: number
  active: boolean
  created_at: string
}

interface ManagedProfileRow {
  id: string
  email: string
  full_name: string
  department: string | null
  default_workstream: string | null
  created_at?: string
  updated_at?: string
}

interface UserRoleRow {
  id: string
  user_id: string
  role: Role
  workstream: string | null
  created_at?: string
}

interface ProgramSitePageRow {
  id: string
  title: string
  audience: string
  content_type: string
  body: string | null
  source_url: string | null
  owner_id: string | null
  status: string
  created_at: string
  updated_at: string
}

interface ReportSnapshotRow {
  id: string
  report_type: ReportType
  title: string
  body: ReportDraft
  source_filters: Record<string, unknown> | null
  approved_by: string | null
  created_by: string | null
  created_at: string
}

interface AiReportDraftRow {
  id: string
  report_type: ReportType
  prompt: Record<string, unknown> | null
  output: ReportDraft
  source_item_ids: string[] | null
  confidence_notes: string | null
  created_by: string | null
  created_at: string
}

interface AiTriageRunRow {
  id: string
  scope: string
  filters: Record<string, unknown> | null
  input_item_ids: string[] | null
  output: AiTriageRun['output']
  created_by: string | null
  created_at: string
}

export function mapGovernanceItem(row: GovernanceItemRow): GovernanceItem {
  return {
    id: row.id,
    module: row.module,
    itemCode: row.item_code,
    title: row.title,
    summary: row.summary ?? '',
    status: row.status,
    priority: row.priority ?? undefined,
    ragStatus: row.rag_status ?? undefined,
    workstream: row.workstream ?? undefined,
    phase: row.phase ?? undefined,
    geo: row.geo ?? undefined,
    ownerName: row.owner_name ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
    supportName: row.support_name ?? undefined,
    supportEmail: row.support_email ?? undefined,
    dueDate: row.due_date ?? undefined,
    lastUpdatedAt: row.last_updated_at,
    closedAt: row.closed_at ?? undefined,
    sourceRef: row.source_ref ?? undefined,
    details: row.details ?? {},
  }
}

function readProfileRelation(value: ProfileRelation | ProfileRelation[] | null | undefined) {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

export function mapCommentUpdate(row: CommentUpdateRow): CommentUpdate {
  const profile = readProfileRelation(row.profiles)
  return {
    id: row.id,
    itemId: row.item_id,
    authorId: row.author_id ?? undefined,
    authorName: profile?.full_name ?? undefined,
    authorEmail: profile?.email ?? undefined,
    body: row.body,
    updateType: row.update_type,
    createdAt: row.created_at,
  }
}

export function mapAttachment(row: AttachmentRow): AttachmentRecord {
  const profile = readProfileRelation(row.profiles)
  return {
    id: row.id,
    itemId: row.item_id ?? undefined,
    fileName: row.file_name,
    storagePath: row.storage_path,
    contentType: row.content_type ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    uploadedByName: profile?.full_name ?? undefined,
    uploadedByEmail: profile?.email ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapAuditEvent(row: AuditEventRow): AuditEvent {
  const profile = readProfileRelation(row.profiles)
  return {
    id: row.id,
    actorId: row.actor_id ?? undefined,
    actorName: profile?.full_name ?? undefined,
    actorEmail: profile?.email ?? undefined,
    eventType: row.event_type,
    tableName: row.table_name,
    recordId: row.record_id ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

export function mapTaxonomyEntry(row: TaxonomyRow): TaxonomyEntry {
  return {
    id: row.id,
    groupKey: row.group_key,
    value: row.value,
    label: row.label ?? undefined,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
  }
}

export function mapRoleAssignment(row: UserRoleRow): RoleAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    workstream: row.workstream ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapManagedProfile(row: ManagedProfileRow, roles: RoleAssignment[]): ManagedProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    department: row.department ?? undefined,
    workstream: row.default_workstream ?? undefined,
    roles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapProgramSitePage(row: ProgramSitePageRow): ProgramSitePageRecord {
  return {
    id: row.id,
    title: row.title,
    audience: row.audience,
    contentType: row.content_type,
    body: row.body ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    ownerId: row.owner_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapReportSnapshot(row: ReportSnapshotRow): ReportSnapshot {
  return {
    id: row.id,
    reportType: row.report_type,
    title: row.title,
    body: row.body,
    sourceFilters: row.source_filters ?? {},
    approvedBy: row.approved_by ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapAiReportDraft(row: AiReportDraftRow): AiReportDraftRecord {
  return {
    id: row.id,
    reportType: row.report_type,
    prompt: row.prompt ?? {},
    output: row.output,
    sourceItemIds: row.source_item_ids ?? [],
    confidenceNotes: row.confidence_notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapAiTriageRun(row: AiTriageRunRow): AiTriageRun {
  return {
    id: row.id,
    scope: row.scope,
    filters: row.filters ?? {},
    inputItemIds: row.input_item_ids ?? [],
    output: row.output,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  }
}

export function toGovernanceItemInsert(item: GovernanceItem) {
  return {
    module: item.module,
    item_code: item.itemCode,
    title: item.title,
    summary: item.summary,
    status: item.status,
    priority: item.priority ?? null,
    rag_status: item.ragStatus ?? null,
    workstream: item.workstream ?? null,
    phase: item.phase ?? null,
    geo: item.geo ?? null,
    owner_name: item.ownerName ?? null,
    owner_email: item.ownerEmail ?? null,
    support_name: item.supportName ?? null,
    support_email: item.supportEmail ?? null,
    due_date: item.dueDate ?? null,
    last_updated_at: item.lastUpdatedAt,
    closed_at: item.closedAt ?? null,
    source_ref: item.sourceRef ?? null,
    details: item.details ?? {},
  }
}

export async function fetchProfile(): Promise<UserProfile | null> {
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const metadata = user.user_metadata as Record<string, unknown>
  let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!profile && user.email?.toLowerCase().endsWith('@lenovo.com')) {
    const fullName = readOptionalString(metadata.full_name) ?? user.email.split('@')[0] ?? 'NexBill User'
    const { data: insertedProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        department: readOptionalString(metadata.department) ?? null,
        default_workstream: readOptionalString(metadata.default_workstream) ?? null,
      })
      .select('*')
      .maybeSingle()
    if (!insertError) profile = insertedProfile
  }

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
  const role = roles?.[0]?.role ?? 'owner'
  const avatarUrl = readOptionalString(profile?.avatar_url) ?? readOptionalString(metadata.avatar_url)
  const department = readOptionalString(profile?.department) ?? readOptionalString(metadata.department)

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    fullName: profile?.full_name ?? user.email ?? 'NexBill User',
    role,
    workstream: profile?.default_workstream ?? undefined,
    department,
    avatarUrl,
  }
}

export async function updateOwnProfile(profile: {
  fullName: string
  department?: string
  workstream?: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before updating your profile.')

  const metadata = user.user_metadata as Record<string, unknown>
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: profile.fullName,
      department: profile.department?.trim() || null,
      default_workstream: profile.workstream?.trim() || null,
    }, { onConflict: 'id' })

  if (error) throw error

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      ...metadata,
      full_name: profile.fullName,
      department: profile.department?.trim() || null,
      default_workstream: profile.workstream?.trim() || null,
    },
  })
  if (metadataError) throw metadataError

  const updatedProfile = await fetchProfile()
  if (!updatedProfile) throw new Error('Updated profile could not be loaded.')
  return updatedProfile
}

export async function uploadProfileAvatar(file: File) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in before uploading an avatar.')

  const fileBase64 = await fileToBase64(file)
  const response = await fetch('/.netlify/functions/profile-avatar-upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileBase64,
    }),
  })
  const body = (await response.json().catch(() => ({}))) as { avatarUrl?: string; error?: string }
  if (!response.ok || !body.avatarUrl) throw new Error(body.error ?? 'Avatar upload failed.')
  return body.avatarUrl
}

export async function fetchGovernanceItems() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('governance_items')
    .select('*')
    .order('last_updated_at', { ascending: false })

  if (error) throw error
  const items = (data ?? []).map((row) => mapGovernanceItem(row as GovernanceItemRow))
  const detailMap = await fetchGovernanceItemDetailMap(items)
  return items.map((item) => ({
    ...item,
    details: {
      ...item.details,
      ...(detailMap.get(item.id) ?? {}),
    },
  }))
}

export async function upsertGovernanceItem(item: GovernanceItem) {
  if (!supabase) return item
  const { data, error } = await supabase
    .from('governance_items')
    .upsert(toGovernanceItemInsert(item), { onConflict: 'item_code' })
    .select()
    .single()

  if (error) throw error
  const savedItem = mapGovernanceItem(data as GovernanceItemRow)
  await upsertGovernanceItemDetails(savedItem.id, savedItem.module, item.details)
  return {
    ...savedItem,
    details: {
      ...savedItem.details,
      ...item.details,
    },
  }
}

export async function deleteGovernanceItem(itemId: string) {
  if (!supabase) return true
  const { error } = await supabase
    .from('governance_items')
    .delete()
    .eq('id', itemId)

  if (error) throw error
  return true
}

async function fetchGovernanceItemDetailMap(items: GovernanceItem[]) {
  const detailMap = new Map<string, GovernanceItem['details']>()
  if (!supabase || items.length === 0) return detailMap

  const modules = [...new Set(items.map((item) => item.module))]
  await Promise.all(modules.map(async (module) => {
    const config = detailConfigForModule(module)
    if (!config) return

    const itemIds = items.filter((item) => item.module === module).map((item) => item.id)
    if (!itemIds.length) return

    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .in('item_id', itemIds)
    if (error) throw error

    for (const row of data ?? []) {
      const detailRow = row as Record<string, unknown>
      const itemId = String(detailRow.item_id ?? '')
      if (!itemId) continue
      detailMap.set(itemId, detailsFromDetailRow(module, detailRow) as GovernanceItem['details'])
    }
  }))

  return detailMap
}

async function upsertGovernanceItemDetails(
  itemId: string,
  module: ModuleKey,
  details: GovernanceItem['details'],
) {
  if (!supabase) return
  const config = detailConfigForModule(module)
  const payload = detailPayloadFromDetails(itemId, module, details)
  if (!config || !payload) return

  const { error } = await supabase
    .from(config.table)
    .upsert(payload, { onConflict: 'item_id' })
  if (error) throw error
}

export async function fetchCommentUpdates(itemId: string) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('comments_updates')
    .select('id,item_id,author_id,body,update_type,created_at,profiles:author_id(full_name,email)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapCommentUpdate(row as CommentUpdateRow))
}

export async function addCommentUpdate(itemId: string, body: string, updateType: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before adding an update.')

  const { data, error } = await supabase
    .from('comments_updates')
    .insert({
      item_id: itemId,
      author_id: user.id,
      body,
      update_type: updateType,
    })
    .select('id,item_id,author_id,body,update_type,created_at,profiles:author_id(full_name,email)')
    .single()

  if (error) throw error
  return mapCommentUpdate(data as CommentUpdateRow)
}

export async function fetchAttachments(itemId: string) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('attachments')
    .select('id,item_id,file_name,storage_path,content_type,uploaded_by,created_at,profiles:uploaded_by(full_name,email)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapAttachment(row as AttachmentRow))
}

export async function uploadAttachment(itemId: string, file: File) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in before uploading an attachment.')

  const fileBase64 = await fileToBase64(file)
  const response = await fetch('/.netlify/functions/attachment-upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      itemId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileBase64,
    }),
  })
  const body = (await response.json().catch(() => ({}))) as { attachment?: AttachmentRecord; error?: string }
  if (!response.ok || !body.attachment) throw new Error(body.error ?? 'Attachment upload failed.')
  return body.attachment
}

export async function createAttachmentDownloadUrl(attachmentId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in before downloading an attachment.')

  const response = await fetch('/.netlify/functions/attachment-download-url', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attachmentId }),
  })
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !body.url) throw new Error(body.error ?? 'Attachment download link could not be created.')
  return body.url
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return window.btoa(binary)
}

export async function fetchAuditEvents(limit = 100) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('audit_events')
    .select('id,actor_id,event_type,table_name,record_id,metadata,created_at,profiles:actor_id(full_name,email)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => mapAuditEvent(row as AuditEventRow))
}

export async function fetchTaxonomies(groupKeys?: string[]) {
  if (!supabase) return []
  let query = supabase
    .from('taxonomies')
    .select('id,group_key,value,label,sort_order,active,created_at')
    .order('group_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (groupKeys?.length) query = query.in('group_key', groupKeys)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapTaxonomyEntry(row as TaxonomyRow))
}

export async function upsertTaxonomyEntry(entry: {
  groupKey: string
  value: string
  label?: string
  sortOrder?: number
  active?: boolean
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('taxonomies')
    .upsert({
      group_key: entry.groupKey,
      value: entry.value,
      label: entry.label ?? entry.value,
      sort_order: entry.sortOrder ?? 0,
      active: entry.active ?? true,
    }, { onConflict: 'group_key,value' })
    .select('id,group_key,value,label,sort_order,active,created_at')
    .single()

  if (error) throw error
  return mapTaxonomyEntry(data as TaxonomyRow)
}

export async function fetchManagedProfiles() {
  if (!supabase) return []
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,full_name,department,default_workstream,created_at,updated_at')
    .order('full_name', { ascending: true })
  if (profileError) throw profileError

  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('id,user_id,role,workstream,created_at')
    .order('created_at', { ascending: true })
  if (roleError) throw roleError

  const rolesByUser = new Map<string, RoleAssignment[]>()
  ;(roles ?? []).forEach((row) => {
    const role = mapRoleAssignment(row as UserRoleRow)
    rolesByUser.set(role.userId, [...(rolesByUser.get(role.userId) ?? []), role])
  })

  return (profiles ?? []).map((row) => mapManagedProfile(row as ManagedProfileRow, rolesByUser.get(String(row.id)) ?? []))
}

export async function saveManagedProfile(profile: {
  id: string
  email: string
  fullName: string
  department?: string
  workstream?: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('profiles')
    .update({
      email: profile.email,
      full_name: profile.fullName,
      department: profile.department?.trim() || null,
      default_workstream: profile.workstream?.trim() || null,
    })
    .eq('id', profile.id)
    .select('id,email,full_name,department,default_workstream,created_at,updated_at')
    .single()

  if (error) throw error
  return mapManagedProfile(data as ManagedProfileRow, [])
}

export async function replaceUserPrimaryRole(userId: string, role: Role, workstream?: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data: existingRoles, error: readError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (readError) throw readError

  const primaryRoleId = existingRoles?.[0]?.id as string | undefined

  const query = primaryRoleId
    ? supabase
        .from('user_roles')
        .update({
          role,
          workstream: workstream?.trim() || null,
        })
        .eq('id', primaryRoleId)
    : supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          workstream: workstream?.trim() || null,
        })

  const { data, error } = await query
    .select('id,user_id,role,workstream,created_at')
    .single()

  if (error) throw error
  const savedRole = mapRoleAssignment(data as UserRoleRow)

  if (primaryRoleId) {
    const extraRoleIds = (existingRoles ?? [])
      .map((existingRole) => String(existingRole.id))
      .filter((id) => id !== primaryRoleId)
    if (extraRoleIds.length) {
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .in('id', extraRoleIds)
      if (deleteError) throw deleteError
    }
  }

  return savedRole
}

export async function fetchProgramSitePages() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('program_site_pages')
    .select('id,title,audience,content_type,body,source_url,owner_id,status,created_at,updated_at')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapProgramSitePage(row as ProgramSitePageRow))
}

export async function upsertProgramSitePage(page: ProgramSitePageRecord) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before saving program site content.')

  const persistedId = isUuid(page.id) ? page.id : undefined
  const payload = {
    ...(persistedId ? { id: persistedId } : {}),
    title: page.title,
    audience: page.audience,
    content_type: page.contentType,
    body: page.body?.trim() || null,
    source_url: page.sourceUrl?.trim() || null,
    owner_id: page.ownerId ?? user.id,
    status: page.status,
  }

  const { data, error } = await supabase
    .from('program_site_pages')
    .upsert(payload)
    .select('id,title,audience,content_type,body,source_url,owner_id,status,created_at,updated_at')
    .single()

  if (error) throw error
  return mapProgramSitePage(data as ProgramSitePageRow)
}

export async function logAuditEvent(event: {
  eventType: string
  tableName: string
  recordId?: string
  metadata?: Record<string, unknown>
}) {
  if (!supabase || !isSupabaseConfigured) return false
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return false

  const response = await fetch('/.netlify/functions/audit-event', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Audit event could not be written.')
  }

  return true
}

export async function fetchReportSnapshots(limit = 20) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('report_snapshots')
    .select('id,report_type,title,body,source_filters,approved_by,created_by,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => mapReportSnapshot(row as ReportSnapshotRow))
}

export async function saveReportSnapshot(draft: ReportDraft, sourceFilters: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before saving a report snapshot.')

  const { data, error } = await supabase
    .from('report_snapshots')
    .insert({
      report_type: draft.type,
      title: draft.title,
      body: draft,
      source_filters: sourceFilters,
      created_by: user.id,
    })
    .select('id,report_type,title,body,source_filters,approved_by,created_by,created_at')
    .single()

  if (error) throw error
  return mapReportSnapshot(data as ReportSnapshotRow)
}

export async function fetchAiReportDrafts(limit = 20) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ai_report_drafts')
    .select('id,report_type,prompt,output,source_item_ids,confidence_notes,created_by,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => mapAiReportDraft(row as AiReportDraftRow))
}

export async function saveAiReportDraft(draft: ReportDraft, sourceItems: GovernanceItem[], prompt: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before saving an AI report draft.')

  const sourceItemIds = draft.citations
    .map((citation) => sourceItems.find((item) => item.itemCode === citation.itemCode)?.id)
    .filter((id): id is string => typeof id === 'string' && isUuid(id))

  const { data, error } = await supabase
    .from('ai_report_drafts')
    .insert({
      report_type: draft.type,
      prompt,
      output: draft,
      source_item_ids: sourceItemIds,
      confidence_notes: String((draft as ReportDraft & { confidenceNotes?: string }).confidenceNotes ?? ''),
      created_by: user.id,
    })
    .select('id,report_type,prompt,output,source_item_ids,confidence_notes,created_by,created_at')
    .single()

  if (error) throw error
  return mapAiReportDraft(data as AiReportDraftRow)
}

export async function fetchAiTriageRuns(limit = 10) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ai_triage_runs')
    .select('id,scope,filters,input_item_ids,output,created_by,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => mapAiTriageRun(row as AiTriageRunRow))
}

export async function saveAiTriageRun(run: {
  scope: string
  filters: Record<string, unknown>
  inputItems: GovernanceItem[]
  output: AiTriageRun['output']
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before saving an AI triage run.')

  const inputItemIds = run.inputItems
    .map((item) => item.id)
    .filter((id): id is string => typeof id === 'string' && isUuid(id))

  const { data, error } = await supabase
    .from('ai_triage_runs')
    .insert({
      scope: run.scope,
      filters: run.filters,
      input_item_ids: inputItemIds,
      output: run.output,
      created_by: user.id,
    })
    .select('id,scope,filters,input_item_ids,output,created_by,created_at')
    .single()

  if (error) throw error
  return mapAiTriageRun(data as AiTriageRunRow)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
