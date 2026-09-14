import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { freePackageByVersion } from '../domain/free-packages';
import type { FreeClaim } from '../domain/model';
import { hashBytes } from '../domain/hash';
import { admin } from './database';
import { isLocal } from './config';
import { getFreeClaimsLocal, insertFreeClaimLocal } from './free-local';

export async function freeClaimsFor(userId: string): Promise<FreeClaim[]> {
  if (isLocal()) return getFreeClaimsLocal(userId);
  const { data, error } = await admin().from('free_claims').select('data').eq('owner_id', userId);
  if (error) throw new Error(`수령 기록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []).map(row => row.data as FreeClaim);
}

export async function claimFree(userId: string, rawVersionId: unknown) {
  const versionId = z.uuid().parse(rawVersionId);
  const item = freePackageByVersion(versionId);
  if (!item || !item.version.freePackage) throw new Error('무료 패키지로 등록된 상품만 받을 수 있습니다.');
  const existing = (await freeClaimsFor(userId)).find(c => c.versionId === versionId);
  if (existing) return existing;
  const claim: FreeClaim = { id: crypto.randomUUID(), ownerId: userId, versionId, createdAt: new Date().toISOString() };
  if (isLocal()) return insertFreeClaimLocal(claim);
  const { error } = await admin().from('free_claims').insert({ id: claim.id, owner_id: userId, data: claim, published: false });
  if (error && error.code !== '23505') throw new Error(`무료 수령 기록을 저장하지 못했습니다: ${error.message}`);
  return (await freeClaimsFor(userId)).find(c => c.versionId === versionId) ?? claim;
}

export async function downloadFree(userId: string, versionId: string) {
  const item = freePackageByVersion(versionId);
  if (!item || !(await freeClaimsFor(userId)).some(c => c.versionId === versionId)) throw new Error('먼저 무료로 받은 상품만 내려받을 수 있습니다.');
  const root = path.resolve('private/free-packages');
  const file = path.resolve(root, item.version.fileName);
  if (!file.startsWith(root + path.sep)) throw new Error('잘못된 파일 경로입니다.');
  const bytes = new Uint8Array(await readFile(file));
  if (hashBytes(bytes) !== item.version.fileHash) throw new Error('ZIP 파일의 SHA-256이 일치하지 않습니다.');
  return { item, bytes };
}
