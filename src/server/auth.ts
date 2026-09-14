import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isLocal, required } from './config';
export const localUsers = {
  seller: { id: '10000000-0000-4000-8000-000000000001', name: '판매자 하나' },
  seller2: { id: '10000000-0000-4000-8000-000000000002', name: '판매자 둘' },
  buyer: { id: '10000000-0000-4000-8000-000000000003', name: '구매자' },
} as const;
export type User = { id: string; name: string };
async function signature(body: string) {
  const secret = await readFile('.data/session-secret', 'utf8');
  return createHmac('sha256', secret).update(body).digest('hex');
}
export async function supabaseAuth() {
  const jar = await cookies();
  return createServerClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookies: { getAll: () => jar.getAll(), setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server components cannot set cookies; route handlers refresh them. */ } } },
  });
}
export async function currentUser(): Promise<User | null> {
  if (isLocal()) {
    const token = (await cookies()).get('market-local-session')?.value;
    if (!token) return null;
    const [role, expiry, sig] = token.split('.');
    if (!role || !expiry || !sig || !Object.hasOwn(localUsers, role) || Number(expiry) < Date.now()) return null;
    const expected = await signature(`${role}.${expiry}`);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return localUsers[role as keyof typeof localUsers];
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { data: { user } } = await (await supabaseAuth()).auth.getUser();
  return user ? { id: user.id, name: user.email ?? '사용자' } : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  return user;
}
export async function loginLocal(role: string) {
  if (!isLocal() || !Object.hasOwn(localUsers, role)) throw new Error('로컬 로그인을 사용할 수 없습니다.');
  const body = `${role}.${Date.now() + 86400000}`;
  (await cookies()).set('market-local-session', `${body}.${await signature(body)}`, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 86400 });
}
