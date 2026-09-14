import 'server-only';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import sharp from 'sharp';
import type { Asset, ProductMedia, ProductStory, ProductStoryMeta, Version } from '../domain/model';
import { parseStoryMeta, storyMediaIds, validateStory } from '../domain/story';
import { admin, all, get, put } from './database';
import { isLocal } from './config';
import { catalog } from './market';

async function ownedAsset(userId: string, rawId: unknown) {
  const id = z.uuid().parse(rawId);
  const asset = await get<Asset>('assets', id);
  if (!asset || asset.ownerId !== userId || asset.freePackage) throw new Error('본인이 등록한 상품만 작성할 수 있습니다.');
  return asset;
}
export async function draftStory(userId: string, assetId: unknown) {
  const asset = await ownedAsset(userId, assetId);
  const story = await get<ProductStory>('product_stories', asset.id);
  const versions = (await all<Version>('versions')).filter(v => v.assetId === asset.id).sort((a,b) => Number(b.state === 'listed') - Number(a.state === 'listed') || b.createdAt.localeCompare(a.createdAt));
  return { asset, story: story ?? null, version: versions[0] ?? null };
}
async function verifyMedia(userId: string, assetId: string, ids: string[]) {
  for (const id of new Set(ids)) {
    const media = await get<ProductMedia>('product_media', z.uuid().parse(id));
    if (!media || media.ownerId !== userId || media.assetId !== assetId) throw new Error('다른 상품 또는 작성자의 이미지는 사용할 수 없습니다.');
  }
}
export async function saveStory(userId: string, body: unknown) {
  const input = z.object({ assetId: z.uuid(), meta: z.unknown(), content: z.unknown() }).strict().parse(body);
  const { asset, story: old, version } = await draftStory(userId, input.assetId);
  if (!version) throw new Error('상품 파일과 버전을 먼저 등록하세요.');
  const parsed = parseStoryMeta(input.meta);
  const meta: ProductStoryMeta = { ...parsed, usageTerms: version.license };
  const content = validateStory(input.content);
  await verifyMedia(userId, asset.id, [...storyMediaIds(content), ...(meta.coverMediaId ? [meta.coverMediaId] : [])]);
  const story: ProductStory = { id: asset.id, ownerId: userId, assetId: asset.id, draft: content, draftMeta: meta, published: old?.published, publishedMeta: old?.publishedMeta, updatedAt: new Date().toISOString(), publishedAt: old?.publishedAt };
  await put('product_stories', story);
  return story;
}
export async function publishStory(userId: string, rawAssetId: unknown) {
  const { asset, story } = await draftStory(userId, rawAssetId);
  if (!story) throw new Error('먼저 소개 초안을 저장하세요.');
  const registered = (await all<Version>('versions')).some(v => v.assetId === asset.id);
  if (!registered) throw new Error('상품 파일과 버전을 먼저 등록하세요.');
  const published: ProductStory = { ...story, published: story.draft, publishedMeta: story.draftMeta, publishedAt: new Date().toISOString() };
  await put('product_stories', published);
  await put('assets', { ...asset, title: published.publishedMeta!.title, summary: published.publishedMeta!.summary, purpose: published.publishedMeta!.purpose,
    supportedTools: published.publishedMeta!.supportedTools, contents: published.publishedMeta!.contents, prerequisites: published.publishedMeta!.prerequisites,
    installation: published.publishedMeta!.installation, usageTerms: published.publishedMeta!.usageTerms,
    coverPath: published.publishedMeta!.coverMediaId ? `/api/market/media/${published.publishedMeta!.coverMediaId}` : asset.coverPath }, true);
  return { publishedAt: published.publishedAt };
}
function mediaMime(bytes: Uint8Array) {
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length-2] === 0xff && bytes[bytes.length-1] === 0xd9) return 'image/jpeg';
  if (bytes.length > 24 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) && String.fromCharCode(...bytes.slice(12,16)) === 'IHDR') return 'image/png';
  if (bytes.length > 20 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
function localMediaPath(key: string) {
  const root = path.resolve('.data/media');
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error('잘못된 미디어 경로입니다.');
  return target;
}
export async function uploadMedia(userId: string, form: FormData) {
  const asset = await ownedAsset(userId, form.get('assetId'));
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > 5242880) throw new Error('이미지는 파일당 5MB 이하로 올리세요.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = mediaMime(bytes);
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : '';
  if (!mime || !new RegExp(`\\.${extension === 'jpg' ? '(jpg|jpeg)' : extension}$`, 'i').test(file.name) || file.type !== mime) throw new Error('실제 JPEG·PNG·WebP 이미지 파일만 올릴 수 있습니다.');
  try {
    const checked = await sharp(bytes, { failOn: 'error', limitInputPixels: 24000000 }).metadata();
    if (checked.format !== (extension === 'jpg' ? 'jpeg' : extension) || !checked.width || !checked.height || checked.width > 6000 || checked.height > 6000) throw new Error();
  } catch { throw new Error('이미지 내용 또는 크기를 확인하세요.'); }
  const id = crypto.randomUUID(), key = `${userId}/${asset.id}/${id}.${extension}`;
  if (isLocal()) { const target = localMediaPath(key); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); }
  else { const { error } = await admin().storage.from('product-media').upload(key, bytes, { contentType: mime, upsert: false }); if (error) throw new Error('이미지를 저장하지 못했습니다.'); }
  const media: ProductMedia = { id, ownerId: userId, assetId: asset.id, path: key, mime, size: bytes.length, createdAt: new Date().toISOString() };
  await put('product_media', media);
  return { media, url: `/api/market/media/${id}` };
}
export async function loadMedia(rawId: unknown, userId: string | null) {
  const media = await get<ProductMedia>('product_media', z.uuid().parse(rawId));
  if (!media) return null;
  if (media.ownerId !== userId) {
    const story = await get<ProductStory>('product_stories', media.assetId);
    const publicItem = (await catalog()).some(item => item.asset.id === media.assetId);
    const referenced = !!story?.published && (storyMediaIds(story.published).includes(media.id) || story.publishedMeta?.coverMediaId === media.id);
    if (!publicItem || !referenced) return null;
  }
  if (isLocal()) return { media, bytes: new Uint8Array(await readFile(localMediaPath(media.path))) };
  const { data, error } = await admin().storage.from('product-media').download(media.path);
  if (error) throw new Error('이미지를 읽지 못했습니다.');
  return { media, bytes: new Uint8Array(await data.arrayBuffer()) };
}
