-- AI Governance Quality Triage history

create table if not exists public.ai_triage_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'current_register_view',
  filters jsonb not null default '{}',
  input_item_ids uuid[] not null default '{}',
  output jsonb not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ai_triage_runs_created_at_idx on public.ai_triage_runs(created_at desc);
create index if not exists ai_triage_runs_created_by_idx on public.ai_triage_runs(created_by);

alter table public.ai_triage_runs enable row level security;

drop policy if exists "ai triage read scoped" on public.ai_triage_runs;
create policy "ai triage read scoped" on public.ai_triage_runs
for select
using (
  created_by = auth.uid()
  or public.has_any_role(array['super_admin','program_manager','ctm','executive']::public.nexbill_role[])
);

drop policy if exists "ai triage write authenticated" on public.ai_triage_runs;
create policy "ai triage write authenticated" on public.ai_triage_runs
for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and not public.has_role('executive')
);
