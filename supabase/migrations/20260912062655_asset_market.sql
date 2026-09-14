-- Shared application schema. RLS/grants and storage policies live in migrations.
create table if not exists public.assets (
 id uuid primary key, owner_id uuid, data jsonb not null check(jsonb_typeof(data)='object'),
 published boolean not null default false, created_at timestamptz not null default now(),
 check(data->>'id'=id::text)
);
create table if not exists public.versions (like public.assets including all);
create table if not exists public.reports (like public.assets including all);
create table if not exists public.offers (like public.assets including all);
create table if not exists public.purchases (like public.assets including all);
create table if not exists public.wallets (like public.assets including all);
create table if not exists public.challenges (like public.assets including all);
create index if not exists assets_owner on public.assets(owner_id);
create index if not exists versions_owner on public.versions(owner_id);
create index if not exists versions_asset on public.versions((data->>'assetId'));
create unique index if not exists versions_number on public.versions((data->>'assetId'),(data->>'version'));
create index if not exists offers_version on public.offers((data->>'versionId'));
create index if not exists purchases_owner on public.purchases(owner_id);
create unique index if not exists purchases_tx on public.purchases((data->>'txHash'));
create unique index if not exists wallets_owner on public.wallets(owner_id);
create unique index if not exists wallets_address on public.wallets(lower(data->>'address'));
create index if not exists challenges_owner on public.challenges(owner_id);

-- Only the backend service may mutate catalog, evaluations, signed offers, and chain mirrors.
-- A logged-in user cannot grant themselves a purchase or publish an untested version.
do $$
declare t text;
begin
 foreach t in array array['assets','versions','reports','offers','purchases','wallets','challenges'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);
  if t in ('assets','versions','reports','offers') then
   execute format('create policy catalog_read on public.%I for select to anon, authenticated using (published)',t);
  end if;
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('asset-files','asset-files',false,1048576,array['application/octet-stream'])
on conflict(id) do nothing;
-- No direct storage policies: all downloads require the server's current chain entitlement check.
