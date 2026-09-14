export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/market/${path}`, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '요청에 실패했습니다.');
  return data;
}
