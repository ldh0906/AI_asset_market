import { z } from 'zod';
import type { ProductStoryMeta, StoryNode } from './model';

const httpsUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS 주소만 사용할 수 있습니다.');
  return url;
};
export function videoUrl(value: string) {
  const url = httpsUrl(value);
  if (['youtube.com', 'www.youtube.com', 'youtu.be'].includes(url.hostname)) {
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') ?? url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('YouTube 영상 주소를 확인하세요.');
    return { kind: 'youtube' as const, href: url.href, embed: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  return { kind: 'external' as const, href: url.href };
}
export const storyMetaSchema = z.object({
  title: z.string().trim().min(2).max(80), summary: z.string().trim().min(10).max(500), purpose: z.string().trim().min(2).max(50),
  supportedTools: z.array(z.string().trim().min(1).max(40)).max(12), coverMediaId: z.uuid().optional(),
  contents: z.array(z.string().trim().min(1).max(100)).max(30), prerequisites: z.string().trim().max(2000), installation: z.string().trim().max(4000), usageTerms: z.string().trim().max(4000),
}).strict();
const nodeTypes = new Set(['doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'image', 'video', 'hardBreak']);
const containerTypes = new Set(['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock']);
const keys = new Set(['type', 'text', 'attrs', 'marks', 'content']);
export function validateStory(value: unknown): StoryNode {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 60000) throw new Error('본문은 60KB 이하로 작성하세요.');
  let count = 0;
  function visit(raw: unknown, depth: number): StoryNode {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 20 || ++count > 1000) throw new Error('본문 구조를 확인하세요.');
    const node = raw as Record<string, unknown>;
    if (Object.keys(node).some(k => !keys.has(k)) || typeof node.type !== 'string' || !nodeTypes.has(node.type)) throw new Error('허용되지 않은 본문 요소입니다.');
    const type = node.type;
    if (type === 'text') {
      if (typeof node.text !== 'string' || node.text.length > 12000 || node.content || node.attrs) throw new Error('본문 문자를 확인하세요.');
      const marks = node.marks === undefined ? [] : node.marks;
      if (!Array.isArray(marks) || marks.length > 8) throw new Error('본문 서식을 확인하세요.');
      for (const mark of marks) {
        if (!mark || typeof mark !== 'object' || !['bold', 'link'].includes(mark.type) || Object.keys(mark).some(k => !['type', 'attrs'].includes(k))) throw new Error('허용되지 않은 서식입니다.');
        if (mark.type === 'link') { if (typeof mark.attrs?.href !== 'string' || Object.keys(mark.attrs).some((k: string) => k !== 'href' && k !== 'target' && k !== 'rel')) throw new Error('링크를 확인하세요.'); httpsUrl(mark.attrs.href); }
        else if (mark.attrs && Object.keys(mark.attrs).length) throw new Error('서식 속성을 확인하세요.');
      }
      return { type, text: node.text, ...(marks.length ? { marks } : {}) };
    }
    if (node.text !== undefined || node.marks !== undefined) throw new Error('본문 요소를 확인하세요.');
    if (type === 'image') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (!attrs || Object.keys(attrs).some(k => !['src', 'alt'].includes(k)) || typeof attrs.src !== 'string' || !/^\/api\/market\/media\/[0-9a-f-]{36}$/.test(attrs.src) || (attrs.alt !== undefined && (typeof attrs.alt !== 'string' || attrs.alt.length > 200))) throw new Error('업로드한 이미지만 본문에 사용할 수 있습니다.');
      return { type, attrs: { src: attrs.src, alt: String(attrs.alt ?? '') } };
    }
    if (type === 'video') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (!attrs || Object.keys(attrs).some(k => k !== 'src') || typeof attrs.src !== 'string') throw new Error('영상 주소를 확인하세요.');
      videoUrl(attrs.src);
      return { type, attrs: { src: attrs.src } };
    }
    if (type === 'heading') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (!attrs || Object.keys(attrs).some(k => k !== 'level') || ![2, 3].includes(Number(attrs.level))) throw new Error('제목 수준을 확인하세요.');
    } else if (node.attrs && Object.keys(node.attrs as object).length) throw new Error('허용되지 않은 요소 속성입니다.');
    if (type === 'hardBreak') return { type };
    if (!containerTypes.has(type) || (node.content !== undefined && !Array.isArray(node.content))) throw new Error('본문 구조를 확인하세요.');
    return { type, ...(type === 'heading' ? { attrs: { level: Number((node.attrs as Record<string, unknown>).level) } } : {}), content: ((node.content ?? []) as unknown[]).map(child => visit(child, depth + 1)) };
  }
  const story = visit(value, 0);
  if (story.type !== 'doc') throw new Error('본문 문서가 필요합니다.');
  return story;
}
export function storyMediaIds(node: StoryNode): string[] {
  return [ ...(node.type === 'image' ? [String(node.attrs?.src).split('/').at(-1)!] : []), ...(node.content ?? []).flatMap(storyMediaIds) ];
}
export function parseStoryMeta(raw: unknown): ProductStoryMeta { return storyMetaSchema.parse(raw); }
