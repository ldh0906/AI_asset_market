import { sha256, stringToHex } from 'viem';
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).filter(k => obj[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}
export const hashText = (text: string) => sha256(stringToHex(text));
export const hashBytes = (bytes: Uint8Array) => sha256(bytes);
export const hashObject = (value: unknown) => hashText(canonical(value));
