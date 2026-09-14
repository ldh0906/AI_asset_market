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
create table if not exists public.evaluation_jobs (like public.assets including all);
create table if not exists public.product_stories (like public.assets including all);
create table if not exists public.product_media (like public.assets including all);
create table if not exists public.free_claims (like public.assets including all);
create unique index if not exists product_stories_asset on public.product_stories((data->>'assetId'));
create unique index if not exists free_claims_user_version on public.free_claims(owner_id,(data->>'versionId'));
create index if not exists evaluation_jobs_owner on public.evaluation_jobs(owner_id);
create unique index if not exists evaluation_jobs_active_owner on public.evaluation_jobs(owner_id) where data->>'status' in ('pending','running');
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
