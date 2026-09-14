import 'server-only';
import type { FreeClaim } from '../domain/model';
import { all, put } from './database';

export async function getFreeClaimsLocal(userId: string) {
  return (await all<FreeClaim>('free_claims')).filter(c => c.ownerId === userId);
}
export async function insertFreeClaimLocal(claim: FreeClaim) {
  const prior = (await getFreeClaimsLocal(claim.ownerId)).find(c => c.versionId === claim.versionId);
  if (prior) return prior;
  try { return await put('free_claims', claim); }
  catch (error) {
    const raced = (await getFreeClaimsLocal(claim.ownerId)).find(c => c.versionId === claim.versionId);
    if (raced) return raced;
    throw error;
  }
}
