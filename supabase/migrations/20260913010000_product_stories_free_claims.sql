create table if not exists public.product_stories (like public.assets including all);
create table if not exists public.product_media (like public.assets including all);
create table if not exists public.free_claims (like public.assets including all);
create unique index if not exists product_stories_asset on public.product_stories((data->>'assetId'));
create unique index if not exists free_claims_user_version on public.free_claims(owner_id,(data->>'versionId'));
do $$
declare t text;
begin
 foreach t in array array['product_stories','product_media','free_claims'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-media','product-media',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- Media is served by the authenticated application route after ownership or publication checks.
