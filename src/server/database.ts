import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isLocal, required } from './config';

export const tables = ['assets', 'versions', 'reports', 'offers', 'purchases', 'wallets', 'challenges', 'evaluation_jobs', 'product_stories', 'product_media', 'free_claims'] as const;
export type Table = typeof tables[number];
type Stored = { id: string; ownerId?: string };
const shared = globalThis as typeof globalThis & { marketDb?: Promise<PGlite> };
export function admin() {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
async function localDb() {
  if (!isLocal()) throw new Error('로컬 데이터베이스 접근이 차단되었습니다.');
  shared.marketDb ??= (async () => {
    await mkdir('.data', { recursive: true });
    const db = await PGlite.create(path.resolve('.data/postgres'));
    await db.exec(await readFile(path.resolve('supabase/schema.sql'), 'utf8'));
    return db;
  })();
  return shared.marketDb;
}
export async function all<T>(table: Table): Promise<T[]> {
  if (isLocal()) return (await (await localDb()).query<{ data: T }>(`select data from public.${table} order by created_at desc`)).rows.map(r => r.data);
  const { data, error } = await admin().from(table).select('data').order('created_at', { ascending: false });
  if (error) throw new Error(`데이터 조회 실패: ${error.message}`);
  return (data ?? []).map(r => r.data as T);
}
export async function get<T>(table: Table, id: string): Promise<T | undefined> {
  if (isLocal()) return (await (await localDb()).query<{ data: T }>(`select data from public.${table} where id=$1`, [id])).rows[0]?.data;
  const { data, error } = await admin().from(table).select('data').eq('id', id).maybeSingle();
  if (error) throw new Error(`데이터 조회 실패: ${error.message}`);
  return data?.data as T | undefined;
}
export async function put<T extends Stored>(table: Table, value: T, published = false, ownerId?: string): Promise<T> {
  const owner = ownerId ?? value.ownerId ?? null;
  if (isLocal()) {
    await (await localDb()).query(`insert into public.${table}(id, owner_id, data, published) values($1,$2,$3,$4) on conflict(id) do update set data=excluded.data, published=excluded.published`, [value.id, owner, JSON.stringify(value), published]);
  } else {
    const { error } = await admin().from(table).upsert({ id: value.id, owner_id: owner, data: value, published });
    if (error) throw new Error(`데이터 저장 실패: ${error.message}`);
  }
  return value;
}
export async function consumeChallenge(id: string, ownerId: string) {
  if (isLocal()) {
    const result = await (await localDb()).query(`update public.challenges set data=jsonb_set(data,'{used}','true') where id=$1 and owner_id=$2 and data->>'used'='false' and (data->>'expiresAt')::timestamptz>now() returning id`, [id, ownerId]);
    return result.rows.length === 1;
  }
  const { data, error } = await admin().from('challenges').select('data').eq('id', id).eq('owner_id', ownerId).maybeSingle();
  if (error || !data || data.data.used || new Date(data.data.expiresAt).getTime() <= Date.now()) return false;
  const updated = await admin().from('challenges').update({ data: { ...data.data, used: true } }).eq('id', id).eq('owner_id', ownerId).eq('data->>used', 'false').select('id');
  if (updated.error) throw new Error('지갑 인증 확인에 실패했습니다.');
  return updated.data.length === 1;
}
export async function replaceRevision<T extends Stored & { revision: number }>(table: Table, value: T, ownerId: string, revision: number) {
  if (isLocal()) {
    const r = await (await localDb()).query(`update public.${table} set data=$1 where id=$2 and owner_id=$3 and data->>'revision'=$4 returning id`, [JSON.stringify(value), value.id, ownerId, String(revision)]);
    return r.rows.length === 1;
  }
  const { data, error } = await admin().from(table).update({ data: value }).eq('id', value.id).eq('owner_id', ownerId).eq('data->>revision', String(revision)).select('id');
  if (error) throw new Error('시험 진행 상태를 저장하지 못했습니다.');
  return data.length === 1;
}
