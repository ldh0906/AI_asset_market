import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002';
beforeAll(async () => {
  // Emulate Supabase's built-in roles and auth.uid(), then execute the actual migration.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  await db.exec(await readFile('supabase/migrations/20260912062655_asset_market.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20260912065428_model_evaluation_jobs.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20260912102215_optimize_catalog_policies.sql', 'utf8'));
  for (const [id, owner, published] of [[a, a, false], [b, b, true], ['10000000-0000-4000-8000-000000000003', b, false]] as const) {
    await db.query('insert into assets(id,owner_id,data,published) values($1,$2,$3,$4)', [id, owner, JSON.stringify({ id }), published]);
  }
  await db.query('insert into purchases(id,owner_id,data) values($1,$2,$3)', [a, b, JSON.stringify({ id: a, txHash: '0x1' })]);
  await db.query('insert into evaluation_jobs(id,owner_id,data) values($1,$2,$3)', [a, a, JSON.stringify({ id: a, status: 'pending', revision: 0 })]);
});
afterAll(async () => { await db.close(); });
it('exposes only published catalog rows to anonymous visitors', async () => {
  await db.exec('set role anon');
  try { expect((await db.query('select id from assets')).rows).toEqual([{ id: b }]); expect((await db.query('select id from purchases')).rows).toEqual([]); }
  finally { await db.exec('reset role'); }
});
it('lets authenticated users read their drafts but not another owner’s drafts or purchases', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
  await db.exec('set role authenticated');
  try {
    expect((await db.query<{ id: string }>('select id from assets order by id')).rows.map(r => r.id)).toEqual([a, b]);
    expect((await db.query('select id from purchases')).rows).toEqual([]);
  } finally { await db.exec('reset role'); }
});
it('prevents clients from self-granting entitlements or publishing untested assets', async () => {
  await db.exec('set role authenticated');
  try {
    await expect(db.query('update assets set published=true where id=$1', [a])).rejects.toThrow(/permission denied/);
    await expect(db.query('insert into purchases(id,owner_id,data) values($1,$2,$3)', [b, a, JSON.stringify({ id: b })])).rejects.toThrow(/permission denied/);
  } finally { await db.exec('reset role'); }
});
it('keeps paid files in a private bucket', async () => {
  expect((await db.query('select public,file_size_limit from storage.buckets where id=$1', ['asset-files'])).rows).toEqual([{ public: false, file_size_limit: 1048576 }]);
});
it('keeps model jobs private and prevents clients from forging completed trials', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
  await db.exec('set role authenticated');
  try {
    expect((await db.query('select id from evaluation_jobs')).rows).toEqual([]);
    await expect(db.query("update evaluation_jobs set data='{}'::jsonb where id=$1", [a])).rejects.toThrow(/permission denied/);
  } finally { await db.exec('reset role'); }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
  await db.exec('set role authenticated');
  try { expect((await db.query('select id from evaluation_jobs')).rows).toEqual([{ id: a }]); }
  finally { await db.exec('reset role'); }
});
it('allows only one active job per owner and one successful revision claim', async () => {
  await expect(db.query('insert into evaluation_jobs(id,owner_id,data) values($1,$2,$3)', [b, a, JSON.stringify({ status: 'pending' })])).rejects.toThrow(/unique/);
  const claim = () => db.query("update evaluation_jobs set data=jsonb_set(data,'{revision}','1') where id=$1 and owner_id=$2 and data->>'revision'='0' returning id", [a, a]);
  const results = await Promise.all([claim(), claim()]);
  expect(results.map(r => r.rows.length).sort()).toEqual([0, 1]);
});
