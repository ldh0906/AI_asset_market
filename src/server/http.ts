import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { appOrigin, isLocal } from './config';
export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(appOrigin()).origin;
  if (origin !== expected) throw new Error('허용되지 않은 요청 출처입니다.');
  if (isLocal() && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) throw new Error('로컬 모드는 이 컴퓨터에서만 사용할 수 있습니다.');
}
export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => i.message).join(' / ') }, { status: 400 });
  const message = error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
  console.error('[market]', message.slice(0, 500));
  return NextResponse.json({ error: message.length > 200 ? '처리 중 오류가 발생했습니다. 입력 내용과 서비스 연결을 확인하세요.' : message }, { status: message === '로그인이 필요합니다.' ? 401 : 400 });
}
export async function jsonBody(request: Request) {
  return JSON.parse(new TextDecoder().decode(await limitedBody(request, 65536)));
}
export async function limitedBody(request: Request, maximum: number) {
  if (Number(request.headers.get('content-length')) > maximum) throw new Error('요청이 너무 큽니다.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('요청 본문이 없습니다.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new Error('요청이 너무 큽니다.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export async function uploadBody(request: Request) {
  const bytes = await limitedBody(request, 1114112);
  return new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body: bytes }).formData();
}
