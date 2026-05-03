-- NexBill Governance Platform initial schema
-- Run this in Supabase SQL editor or through Supabase CLI.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.nexbill_role as enum (
    'super_admin',
    'program_manager',
    'ctm',
    'owner',
    'support',
    'executive'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  department text,
  default_workstream text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.nexbill_role not null,
  workstream text,
  created_at timestamptz not null default now(),
  unique (user_id, role, workstream)
);

create table if not exists public.taxonomies (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  value text not null,
  label text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_key, value)
);

create table if not exists public.governance_items (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in (
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
    'program_site'
  )),
  item_code text not null unique,
  title text not null,
  summary text,
  status text not null,
  priority text,
  rag_status text,
  workstream text,
  phase text,
  geo text,
  countries text[] not null default '{}',
  owner_id uuid references public.profiles(id),
  owner_name text,
  owner_email text,
  support_id uuid references public.profiles(id),
  support_name text,
  support_email text,
  due_date date,
  last_updated_at date not null default current_date,
  closed_at date,
  source_ref jsonb not null default '{}',
  details jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists governance_items_module_idx on public.governance_items(module);
create index if not exists governance_items_owner_email_idx on public.governance_items(lower(owner_email));
create index if not exists governance_items_support_email_idx on public.governance_items(lower(support_email));
create index if not exists governance_items_status_idx on public.governance_items(status);
create index if not exists governance_items_workstream_idx on public.governance_items(workstream);
create index if not exists governance_items_due_date_idx on public.governance_items(due_date);

create table if not exists public.action_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  action_source_location text,
  action_area text,
  action_update text,
  details jsonb not null default '{}'
);

create table if not exists public.risk_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  risk_reported_level text,
  impact_area text,
  response_strategy text,
  budget_low numeric,
  budget_high numeric,
  schedule_low_weeks numeric,
  schedule_high_weeks numeric,
  early_warning_indicators text,
  mitigation text,
  contingency_plan text,
  associated_dependency_id text,
  details jsonb not null default '{}'
);

create table if not exists public.issue_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  issue_type text,
  impact_area text,
  impact text,
  current_status text,
  resolution_plan text,
  support_required text,
  escalation_status text,
  severity_rating text,
  details jsonb not null default '{}'
);

create table if not exists public.dependency_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  criticality text,
  dependency_type text,
  task_sequencing text,
  from_workstream text,
  from_owner text,
  to_workstream text,
  to_owner text,
  baseline_delivery_date date,
  forecast_date date,
  agreed_date date,
  variance_business_days integer,
  associated_risk_issue_ids text,
  details jsonb not null default '{}'
);

create table if not exists public.assumption_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  assumption_area text,
  impact_if_holds text,
  impact_if_not_met text,
  controls_mitigations text,
  supporting_reference text,
  linked_risk_id text,
  linked_dependency_id text,
  recorded_date date,
  validated_date date,
  details jsonb not null default '{}'
);

create table if not exists public.decision_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  decision_area text,
  impact_area text,
  requested_by text,
  supported_by text,
  provided_by text,
  approval_forum text,
  approval_date date,
  approval_record_location text,
  details jsonb not null default '{}'
);

create table if not exists public.benefit_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  current_state text,
  description text,
  specific text,
  measurable text,
  achievable text,
  relevant text,
  time_bound text,
  target_date date,
  measurement_cadence text,
  details jsonb not null default '{}'
);

create table if not exists public.lesson_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  lesson_group text,
  lesson_type text,
  impact_size text,
  impact_area text,
  estimated_impact_weeks numeric,
  category text,
  project_phase text,
  lesson_impact text,
  root_cause text,
  recommendation text,
  captured_by text,
  captured_date date,
  follow_up_date date,
  notes text,
  details jsonb not null default '{}'
);

create table if not exists public.change_request_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  current_phase text,
  confirm_for_sizing boolean,
  exec_approval text,
  dt_owner text,
  it_owner text,
  impact_area text,
  total_md numeric,
  budget_k numeric,
  comments text,
  details jsonb not null default '{}'
);

create table if not exists public.financial_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  budget numeric,
  forecast numeric,
  actuals numeric,
  variance numeric,
  variance_driver text,
  assumptions text,
  details jsonb not null default '{}'
);

create table if not exists public.schedule_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  milestone text,
  baseline_date date,
  forecast_date date,
  critical_path boolean not null default false,
  schedule_slip_days integer,
  details jsonb not null default '{}'
);

create table if not exists public.golive_readiness_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  readiness_domain text,
  entry_criteria text,
  exit_criteria text,
  readiness_owner text,
  evidence_location text,
  details jsonb not null default '{}'
);

create table if not exists public.document_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  document_purpose text,
  document_location text,
  document_type text,
  saved_title text,
  latest_update_date date,
  latest_version text,
  intended_audience text,
  details jsonb not null default '{}'
);

create table if not exists public.future_project_details (
  item_id uuid primary key references public.governance_items(id) on delete cascade,
  request_from text,
  refers_to text,
  estimated_duration text,
  estimated_cost numeric,
  comment text,
  details jsonb not null default '{}'
);

create table if not exists public.program_site_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  audience text not null,
  content_type text not null,
  body text,
  source_url text,
  owner_id uuid references public.profiles(id),
  status text not null default 'Open & being monitored',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments_updates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.governance_items(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  update_type text not null default 'comment',
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.governance_items(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  content_type text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('team_leads', 'stakeholders', 'executive')),
  title text not null,
  body jsonb not null,
  source_filters jsonb not null default '{}',
  approved_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_report_drafts (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('team_leads', 'stakeholders', 'executive')),
  prompt jsonb not null default '{}',
  output jsonb not null,
  source_item_ids uuid[] not null default '{}',
  confidence_notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  event_type text not null,
  table_name text not null,
  record_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_item_update_fields()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.last_updated_at = current_date;
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.has_role(required_role public.nexbill_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = required_role
  );
$$;

create or replace function public.has_any_role(required_roles public.nexbill_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = any(required_roles)
  );
$$;

create or replace function public.is_item_actor(item public.governance_items)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and (
    item.owner_id = auth.uid()
    or item.support_id = auth.uid()
    or lower(coalesce(item.owner_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or lower(coalesce(item.support_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or item.created_by = auth.uid()
  );
$$;

create or replace function public.can_view_item(item public.governance_items)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and (
    public.has_any_role(array['super_admin','program_manager','ctm','executive']::public.nexbill_role[])
    or public.is_item_actor(item)
  );
$$;

create or replace function public.next_item_code(module_key text, prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  select coalesce(max((regexp_match(item_code, '^([0-9]{4})-NB-' || prefix || '$'))[1]::integer), 0) + 1
  into next_number
  from public.governance_items
  where module = module_key
    and item_code ~ ('^[0-9]{4}-NB-' || prefix || '$');

  return lpad(next_number::text, 4, '0') || '-NB-' || prefix;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'program_site_pages'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name, table_name);
  end loop;
end $$;

drop trigger if exists governance_items_touch_update_fields on public.governance_items;
create trigger governance_items_touch_update_fields
before update on public.governance_items
for each row execute function public.touch_item_update_fields();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.taxonomies enable row level security;
alter table public.governance_items enable row level security;
alter table public.comments_updates enable row level security;
alter table public.attachments enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.ai_report_drafts enable row level security;
alter table public.audit_events enable row level security;
alter table public.program_site_pages enable row level security;

do $$
declare
  detail_table text;
begin
  foreach detail_table in array array[
    'action_details',
    'risk_details',
    'issue_details',
    'dependency_details',
    'assumption_details',
    'decision_details',
    'benefit_details',
    'lesson_details',
    'change_request_details',
    'financial_details',
    'schedule_details',
    'golive_readiness_details',
    'document_details',
    'future_project_details'
  ] loop
    execute format('alter table public.%I enable row level security', detail_table);
  end loop;
end $$;

drop policy if exists "profiles read own or governance roles" on public.profiles;
create policy "profiles read own or governance roles" on public.profiles
for select
using (
  id = auth.uid()
  or public.has_any_role(array['super_admin','program_manager','ctm','executive']::public.nexbill_role[])
);

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin" on public.profiles
for update
using (id = auth.uid() or public.has_role('super_admin'))
with check (id = auth.uid() or public.has_role('super_admin'));

drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles
for insert
with check (id = auth.uid() or public.has_role('super_admin'));

drop policy if exists "roles read governance" on public.user_roles;
create policy "roles read governance" on public.user_roles
for select
using (user_id = auth.uid() or public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[]));

drop policy if exists "roles manage admin" on public.user_roles;
create policy "roles manage admin" on public.user_roles
for all
using (public.has_role('super_admin'))
with check (public.has_role('super_admin'));

drop policy if exists "taxonomies read authenticated" on public.taxonomies;
create policy "taxonomies read authenticated" on public.taxonomies
for select
using (auth.uid() is not null);

drop policy if exists "taxonomies manage governance" on public.taxonomies;
create policy "taxonomies manage governance" on public.taxonomies
for all
using (public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[]))
with check (public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[]));

drop policy if exists "items read scoped" on public.governance_items;
create policy "items read scoped" on public.governance_items
for select
using (public.can_view_item(governance_items));

drop policy if exists "items insert governance contributors" on public.governance_items;
create policy "items insert governance contributors" on public.governance_items
for insert
with check (
  auth.uid() is not null
  and not public.has_role('executive')
);

drop policy if exists "items update scoped" on public.governance_items;
create policy "items update scoped" on public.governance_items
for update
using (
  not public.has_role('executive')
  and (
    public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[])
    or public.is_item_actor(governance_items)
  )
)
with check (
  not public.has_role('executive')
  and (
    public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[])
    or public.is_item_actor(governance_items)
  )
);

drop policy if exists "items delete admin only" on public.governance_items;
create policy "items delete admin only" on public.governance_items
for delete
using (public.has_role('super_admin'));

do $$
declare
  detail_table text;
begin
  foreach detail_table in array array[
    'action_details',
    'risk_details',
    'issue_details',
    'dependency_details',
    'assumption_details',
    'decision_details',
    'benefit_details',
    'lesson_details',
    'change_request_details',
    'financial_details',
    'schedule_details',
    'golive_readiness_details',
    'document_details',
    'future_project_details'
  ] loop
    execute format('drop policy if exists "%s read scoped" on public.%I', detail_table, detail_table);
    execute format('create policy "%s read scoped" on public.%I for select using (exists (select 1 from public.governance_items gi where gi.id = item_id and public.can_view_item(gi)))', detail_table, detail_table);

    execute format('drop policy if exists "%s write scoped" on public.%I', detail_table, detail_table);
    execute format('create policy "%s write scoped" on public.%I for all using (exists (select 1 from public.governance_items gi where gi.id = item_id and not public.has_role(''executive'') and (public.has_any_role(array[''super_admin'',''program_manager'',''ctm'']::public.nexbill_role[]) or public.is_item_actor(gi)))) with check (exists (select 1 from public.governance_items gi where gi.id = item_id and not public.has_role(''executive'') and (public.has_any_role(array[''super_admin'',''program_manager'',''ctm'']::public.nexbill_role[]) or public.is_item_actor(gi))))', detail_table, detail_table);
  end loop;
end $$;

drop policy if exists "comments read by item scope" on public.comments_updates;
create policy "comments read by item scope" on public.comments_updates
for select
using (exists (select 1 from public.governance_items gi where gi.id = item_id and public.can_view_item(gi)));

drop policy if exists "comments insert authenticated" on public.comments_updates;
create policy "comments insert authenticated" on public.comments_updates
for insert
with check (auth.uid() is not null and not public.has_role('executive'));

drop policy if exists "attachments read by item scope" on public.attachments;
create policy "attachments read by item scope" on public.attachments
for select
using (
  item_id is null
  or exists (select 1 from public.governance_items gi where gi.id = item_id and public.can_view_item(gi))
);

drop policy if exists "attachments insert contributors" on public.attachments;
create policy "attachments insert contributors" on public.attachments
for insert
with check (auth.uid() is not null and not public.has_role('executive'));

drop policy if exists "reports read governance" on public.report_snapshots;
create policy "reports read governance" on public.report_snapshots
for select
using (auth.uid() is not null);

drop policy if exists "reports write governance" on public.report_snapshots;
create policy "reports write governance" on public.report_snapshots
for insert
with check (public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[]));

drop policy if exists "ai drafts read creator governance" on public.ai_report_drafts;
create policy "ai drafts read creator governance" on public.ai_report_drafts
for select
using (
  created_by = auth.uid()
  or public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[])
);

drop policy if exists "ai drafts write governance" on public.ai_report_drafts;
create policy "ai drafts write governance" on public.ai_report_drafts
for insert
with check (auth.uid() is not null and not public.has_role('executive'));

drop policy if exists "audit read governance" on public.audit_events;
create policy "audit read governance" on public.audit_events
for select
using (public.has_any_role(array['super_admin','program_manager','ctm','executive']::public.nexbill_role[]));

drop policy if exists "program site read authenticated" on public.program_site_pages;
create policy "program site read authenticated" on public.program_site_pages
for select
using (auth.uid() is not null);

drop policy if exists "program site write governance" on public.program_site_pages;
create policy "program site write governance" on public.program_site_pages
for all
using (public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[]))
with check (public.has_any_role(array['super_admin','program_manager','ctm']::public.nexbill_role[]));

insert into public.taxonomies (group_key, value, label, sort_order)
values
  ('workstream', '0. Project', '0. Project', 0),
  ('workstream', '1. Tax', '1. Tax', 1),
  ('workstream', '2. Finance & Accounting', '2. Finance & Accounting', 2),
  ('workstream', '3. Technology', '3. Technology', 3),
  ('workstream', '4. Invoicing & Administration', '4. Invoicing & Administration', 4),
  ('workstream', '5. Treasury', '5. Treasury', 5),
  ('priority', '1. Low Priority', '1. Low Priority', 1),
  ('priority', '2. Medium Priority', '2. Medium Priority', 2),
  ('priority', '3. High Priority', '3. High Priority', 3),
  ('priority', '4. Critical Priority', '4. Critical Priority', 4),
  ('rag', '1. Green', '1. Green', 1),
  ('rag', '2. Amber', '2. Amber', 2),
  ('rag', '3. Red', '3. Red', 3)
on conflict (group_key, value) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    active = true;
