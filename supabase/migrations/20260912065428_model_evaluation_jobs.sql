create table public.evaluation_jobs (like public.assets including all);
alter table public.evaluation_jobs enable row level security;
revoke all on public.evaluation_jobs from anon,authenticated;
grant select on public.evaluation_jobs to authenticated;
grant all on public.evaluation_jobs to service_role;
create policy owner_read on public.evaluation_jobs for select to authenticated using(owner_id=(select auth.uid()));
create index evaluation_jobs_owner on public.evaluation_jobs(owner_id);
create unique index evaluation_jobs_active_owner on public.evaluation_jobs(owner_id) where data->>'status' in ('pending','running');
