-- Preserve published-or-owned visibility with one SELECT policy per role.
do $$
declare t text;
begin
 foreach t in array array['assets','versions','reports','offers'] loop
  execute format('alter policy catalog_read on public.%I to anon',t);
  execute format('alter policy owner_read on public.%I using (published or owner_id=(select auth.uid()))',t);
 end loop;
end $$;

-- LIKE INCLUDING ALL already copied the assets owner index to evaluation_jobs.
drop index if exists public.evaluation_jobs_owner_id_idx;
