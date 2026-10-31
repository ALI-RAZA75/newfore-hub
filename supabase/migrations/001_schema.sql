-- Newfore Hub: schema, security and helper functions
-- Run once in Supabase -> SQL Editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------- People ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

-- First person to sign up becomes admin; everyone after is a member.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    case when exists (select 1 from public.profiles) then 'member' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Plans, goals, tasks ----------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active','planned','done','archived')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  label text not null,
  metric_key text,              -- live metric (see src/lib/metrics.ts); null = manual
  baseline numeric not null default 0,
  target numeric not null,
  target_high numeric,          -- optional range top, e.g. 40–60
  lower_is_better boolean not null default false,
  manual_value numeric,         -- used when metric_key is null
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.plans(id) on delete set null,
  title text not null,
  description text,
  area text,
  priority text not null default 'medium' check (priority in ('urgent','high','medium','low')),
  status text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  sort int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_plan_idx on public.tasks(plan_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_due_idx on public.tasks(due_date);

create or replace function public.touch_task()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_task();

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- Analytics ----------
-- One row per day, source, metric and breakdown (dim). Written only by the sync job.
-- Metrics ending in "_snap" are point-in-time values (e.g. review count): weekly = latest, not sum.
create table if not exists public.metrics_daily (
  date date not null,
  source text not null,          -- ga4 | gsc | gbp
  metric text not null,
  dim text not null default '',
  value numeric not null,
  primary key (date, source, metric, dim)
);
create index if not exists metrics_daily_metric_idx on public.metrics_daily(source, metric, date);

-- Sum (or latest for _snap) between two dates, grouped.
create or replace function public.metrics_sum(p_start date, p_end date)
returns table(source text, metric text, dim text, value numeric)
language sql stable as $$
  select m.source, m.metric, m.dim,
    case when m.metric like '%\_snap' then
      (array_agg(m.value order by m.date desc))[1]
    else sum(m.value) end as value
  from public.metrics_daily m
  where m.date between p_start and p_end
  group by m.source, m.metric, m.dim;
$$;

-- Weekly totals (weeks start Monday) for the trend charts.
create or replace function public.metrics_weekly(p_start date, p_end date, p_source text default null)
returns table(week date, source text, metric text, dim text, value numeric)
language sql stable as $$
  select date_trunc('week', m.date)::date as week, m.source, m.metric, m.dim,
    case when m.metric like '%\_snap' then
      (array_agg(m.value order by m.date desc))[1]
    else sum(m.value) end as value
  from public.metrics_daily m
  where m.date between p_start and p_end
    and (p_source is null or m.source = p_source)
  group by 1, m.source, m.metric, m.dim;
$$;

-- Non-secret connection settings everyone in the team can read.
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  ga4_property_id text,
  gsc_site_url text,
  gbp_locations jsonb not null default '[]'::jsonb,  -- [{name:"locations/123", account:"accounts/9", title:"Stoney Creek"}]
  tracked_keywords text[] not null default array[
    'home renovation hamilton','basement renovation hamilton',
    'renovation contractor burlington','bathroom renovation hamilton'],
  brand_terms text[] not null default array['newfore','new fore'],
  google_email text,
  last_sync_at timestamptz,
  last_sync_status text
);
insert into public.settings (id) values (1) on conflict do nothing;

-- Google OAuth tokens. No policies: only the server (service role) can read them.
create table if not exists public.google_tokens (
  id int primary key default 1 check (id = 1),
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.metrics_daily enable row level security;
alter table public.settings enable row level security;
alter table public.google_tokens enable row level security;

-- profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid())));

-- plans & goals: everyone reads, admins write
drop policy if exists "plans read" on public.plans;
create policy "plans read" on public.plans for select to authenticated using (true);
drop policy if exists "plans admin write" on public.plans;
create policy "plans admin write" on public.plans for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "goals read" on public.goals;
create policy "goals read" on public.goals for select to authenticated using (true);
drop policy if exists "goals admin write" on public.goals;
create policy "goals admin write" on public.goals for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tasks: everyone reads and adds; admins, the assignee or the creator can edit; admins or creator delete
drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks for select to authenticated using (true);
drop policy if exists "tasks insert" on public.tasks;
create policy "tasks insert" on public.tasks for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "tasks update" on public.tasks;
create policy "tasks update" on public.tasks for update to authenticated
  using (public.is_admin() or assignee_id = auth.uid() or created_by = auth.uid())
  with check (public.is_admin() or assignee_id = auth.uid() or created_by = auth.uid());
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks delete" on public.tasks for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- comments
drop policy if exists "comments read" on public.task_comments;
create policy "comments read" on public.task_comments for select to authenticated using (true);
drop policy if exists "comments insert" on public.task_comments;
create policy "comments insert" on public.task_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "comments delete" on public.task_comments;
create policy "comments delete" on public.task_comments for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- analytics & settings: read for the team, written by the server only
drop policy if exists "metrics read" on public.metrics_daily;
create policy "metrics read" on public.metrics_daily for select to authenticated using (true);
drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select to authenticated using (true);
drop policy if exists "settings admin update" on public.settings;
create policy "settings admin update" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
