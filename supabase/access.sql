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
  if t in ('assets','versions','reports','offers') then
   execute format('create policy catalog_read on public.%I for select to anon using (published)',t);
   execute format('create policy owner_read on public.%I for select to authenticated using (published or owner_id=(select auth.uid()))',t);
  else
   execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);
  end if;
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('asset-files','asset-files',false,1048576,array['application/octet-stream'])
on conflict(id) do nothing;
-- No direct storage policies: all downloads require the server's current chain entitlement check.
