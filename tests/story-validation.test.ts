import { describe, expect, it } from 'vitest';
import { validateStory, videoUrl } from '../src/domain/story';

const doc = (content: unknown[]) => ({ type: 'doc', content });
describe('seller story validation', () => {
  it('accepts structured prose, owned media paths, and HTTPS links', () => {
    const result = validateStory(doc([{ type: 'paragraph', content: [{ type: 'text', text: '설치 안내', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com/manual' } }] }] },
      { type: 'image', attrs: { src: '/api/market/media/11111111-1111-4111-8111-111111111111', alt: '화면' } }, { type: 'video', attrs: { src: 'https://youtu.be/dQw4w9WgXcQ' } }]));
    expect(result.content).toHaveLength(3);
    expect(videoUrl('https://youtu.be/dQw4w9WgXcQ').kind).toBe('youtube');
  });
  it.each([
    doc([{ type: 'script', content: [] }]),
    doc([{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }]),
    doc([{ type: 'image', attrs: { src: 'https://evil.example/a.png' } }]),
    doc([{ type: 'video', attrs: { src: 'http://youtube.com/watch?v=dQw4w9WgXcQ' } }]),
    doc([{ type: 'paragraph', html: '<iframe></iframe>' }]),
  ])('rejects executable or external embedded content', value => expect(() => validateStory(value)).toThrow());
});
