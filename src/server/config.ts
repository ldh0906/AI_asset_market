import 'server-only';
export function isLocal() {
  const local = process.env.MARKET_MODE === 'local';
  if (local && process.env.VERCEL) throw new Error('Vercel에서는 로컬 개발 모드를 사용할 수 없습니다.');
  return local;
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}
export function appOrigin() {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  if (process.env.VERCEL) {
    const host = process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
    if (!host) throw new Error('배포 주소 설정이 필요합니다.');
    return new URL(`https://${host}`).origin;
  }
  return 'http://127.0.0.1:3100';
}
