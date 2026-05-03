import { createClient } from '@supabase/supabase-js'
import type { GovernanceItem, ModuleKey, UserProfile } from '../types'

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

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
  const role = roles?.[0]?.role ?? 'owner'

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    fullName: profile?.full_name ?? user.email ?? 'NexBill User',
    role,
    workstream: profile?.default_workstream ?? undefined,
  }
}

export async function fetchGovernanceItems() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('governance_items')
    .select('*')
    .order('last_updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapGovernanceItem(row as GovernanceItemRow))
}

export async function upsertGovernanceItem(item: GovernanceItem) {
  if (!supabase) return item
  const { data, error } = await supabase
    .from('governance_items')
    .upsert(toGovernanceItemInsert(item), { onConflict: 'item_code' })
    .select()
    .single()

  if (error) throw error
  return mapGovernanceItem(data as GovernanceItemRow)
}
