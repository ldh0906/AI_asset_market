import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isLocal } from './config';
import { admin } from './database';
const bucket = 'asset-files';
function localPath(key: string) {
  const root = path.resolve('.data/files');
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) throw new Error('잘못된 파일 경로입니다.');
  return file;
}
export async function storeFile(key: string, bytes: Uint8Array) {
  if (isLocal()) {
    const target = localPath(key); await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' }); return;
  }
  const { error } = await admin().storage.from(bucket).upload(key, bytes, { contentType: 'application/octet-stream', upsert: false });
  if (error) throw new Error('상품 파일 저장에 실패했습니다.');
}
export async function loadFile(key: string): Promise<Uint8Array> {
  if (isLocal()) return new Uint8Array(await readFile(localPath(key)));
  const { data, error } = await admin().storage.from(bucket).download(key);
  if (error) throw new Error('상품 파일을 가져오지 못했습니다. 다시 시도하세요.');
  return new Uint8Array(await data.arrayBuffer());
}
