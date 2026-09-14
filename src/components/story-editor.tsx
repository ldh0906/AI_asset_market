'use client';
import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Node } from '@tiptap/core';
import { api } from '../client/api';
import type { Asset, ProductStoryMeta, StoryNode, Version } from '../domain/model';
import { videoUrl } from '../domain/story';
import { StoryContent } from './story-content';

const Video = Node.create({ name: 'video', group: 'block', atom: true, addAttributes: () => ({ src: { default: null } }),
  parseHTML: () => [], renderHTML: ({ node }) => ['a', { href: node.attrs.src, 'data-video': '' }, '영상 링크'] });
const blank: StoryNode = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };

export function StoryEditor({ assetId, onPublished, onClose }: { assetId: string; onPublished: () => Promise<void>; onClose: () => void }) {
  const [asset, setAsset] = useState<Asset | null>(null), [version, setVersion] = useState<Version | null>(null);
  const [meta, setMeta] = useState<ProductStoryMeta>({ title: '', summary: '', purpose: '', supportedTools: [], contents: [], prerequisites: '', installation: '', usageTerms: '' });
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [preview, setPreview] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const editor = useEditor({ extensions: [StarterKit.configure({ link: false }), Image, Link.configure({ openOnClick: false }), Video], content: blank,
    immediatelyRender: false, onUpdate: () => setDirty(true) });
  useEffect(() => {
    let active = true;
    api<{ asset: Asset; version: Version; story: { draft: StoryNode; draftMeta: ProductStoryMeta; updatedAt: string } | null }>(`story/${assetId}`).then(data => {
      if (!active) return;
      setAsset(data.asset); setVersion(data.version);
      setMeta(data.story?.draftMeta ?? { title: data.asset.title, summary: data.asset.summary, purpose: data.asset.purpose ?? '업무 도구', supportedTools: data.asset.supportedTools ?? [], coverMediaId: undefined,
        contents: data.asset.contents ?? [], prerequisites: data.asset.prerequisites ?? data.version.environment, installation: data.asset.installation ?? '', usageTerms: data.version.license });
      editor?.commands.setContent(data.story?.draft ?? blank); setSavedAt(data.story?.updatedAt ?? null);
      setTimeout(() => setDirty(false), 0);
    }).catch(e => setError(e.message));
    return () => { active = false; };
  }, [assetId, editor]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const change = <K extends keyof ProductStoryMeta>(key: K, value: ProductStoryMeta[K]) => { setMeta(old => ({ ...old, [key]: value })); setDirty(true); };
  async function save() {
    if (!editor) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await api<{ story: { updatedAt: string } }>('story/save', { assetId, meta, content: editor.getJSON() }); setSavedAt(result.story.updatedAt); setDirty(false); setMessage('초안을 저장했습니다. 공개 중인 소개는 바뀌지 않았습니다.'); }
    catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setError('');
    try { if (dirty) await api('story/save', { assetId, meta, content: editor?.getJSON() }); await api('story/publish', { assetId }); setDirty(false); setSavedAt(new Date().toISOString()); setMessage('상품 소개를 공개했습니다.'); await onPublished(); }
    catch (e) { setError(e instanceof Error ? e.message : '공개하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function upload(file: File, cover = false) {
    setBusy(true); setError('');
    try { const form = new FormData(); form.set('assetId', assetId); form.set('file', file); const result = await api<{ media: { id: string }; url: string }>('media/upload', form);
      if (cover) change('coverMediaId', result.media.id);
      else editor?.chain().focus().setImage({ src: result.url, alt: file.name }).run();
      setMessage('이미지를 올렸습니다. 초안을 저장해야 본문에 반영됩니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '이미지를 올리지 못했습니다.'); }
    finally { setBusy(false); }
  }
  function insertVideo() { const value = window.prompt('영상 HTTPS 주소를 입력하세요. YouTube는 플레이어로 표시됩니다.'); if (!value) return; try { videoUrl(value); editor?.chain().focus().insertContent({ type: 'video', attrs: { src: value } }).run(); } catch { setError('유효한 HTTPS 영상 주소를 입력하세요.'); } }
  function setLink() { const value = window.prompt('링크 HTTPS 주소를 입력하세요.'); if (!value) return; try { const url = new URL(value); if (url.protocol !== 'https:') throw new Error(); editor?.chain().focus().setLink({ href: url.href }).run(); } catch { setError('HTTPS 링크만 사용할 수 있습니다.'); } }
  if (!asset || !version) return <div className="panel">{error || '편집기를 불러오는 중입니다.'}</div>;
  return <section className="panel story-editor"><div className="editor-heading"><div><h2>{asset.title} 소개 작성</h2><p className="muted small">{savedAt ? `초안 저장: ${new Date(savedAt).toLocaleString('ko-KR')}` : '아직 저장되지 않은 초안'}</p></div><button className="secondary" onClick={() => { if (!dirty || window.confirm('저장하지 않은 변경 사항을 버릴까요?')) onClose(); }}>편집 닫기</button></div>
    {error && <p role="alert" className="notice error">{error}</p>}{message && <p role="status" className="notice">{message}</p>}{dirty && <p className="unsaved" role="status">저장하지 않은 변경 사항이 있습니다.</p>}
    <div className="form-grid"><label>상품명<input value={meta.title} maxLength={80} onChange={e => change('title', e.target.value)} /></label><label>용도<input value={meta.purpose} maxLength={50} onChange={e => change('purpose', e.target.value)} /></label>
      <label className="span-2">짧은 소개<textarea value={meta.summary} maxLength={500} onChange={e => change('summary', e.target.value)} /></label>
      <label>지원 도구 (쉼표로 구분)<input value={meta.supportedTools.join(', ')} onChange={e => change('supportedTools', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></label>
      <label>대표 이미지 (JPEG·PNG·WebP, 최대 5MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, true); }} />{meta.coverMediaId && <img className="cover-preview" src={`/api/market/media/${meta.coverMediaId}`} alt="대표 이미지 미리보기" />}</label>
      <label className="span-2">구성품 (한 줄에 하나)<textarea value={meta.contents.join('\n')} onChange={e => change('contents', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} /></label>
      <label>필수 조건<textarea value={meta.prerequisites} onChange={e => change('prerequisites', e.target.value)} /></label><label>설치 방법<textarea value={meta.installation} onChange={e => change('installation', e.target.value)} /></label>
      <label className="span-2">이용 조건 (검증한 버전과 연결)<textarea value={version.license} readOnly /><small className="muted">변경하려면 새 상품 버전과 판매 승인 절차를 이용하세요.</small></label></div>
    <div className="editor-toolbar" aria-label="본문 서식"><button type="button" className="secondary" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>제목</button><button type="button" className="secondary" onClick={() => editor?.chain().focus().toggleBold().run()}>굵게</button><button type="button" className="secondary" onClick={() => editor?.chain().focus().toggleBulletList().run()}>목록</button><button type="button" className="secondary" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>번호 목록</button><button type="button" className="secondary" onClick={setLink}>링크</button><button type="button" className="secondary" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>인용</button><button type="button" className="secondary" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>코드</button><label className="secondary file-button">본문 이미지<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label><button type="button" className="secondary" onClick={insertVideo}>영상 링크</button></div>
    <EditorContent editor={editor} className="editor-content" />
    <div className="toolbar"><button disabled={busy} onClick={() => void save()}>초안 저장</button><button className="secondary" disabled={busy} onClick={() => setPreview(!preview)}>{preview ? '미리보기 닫기' : '미리보기'}</button><button disabled={busy} onClick={() => void publish()}>소개 공개</button></div>
    {preview && <div className="story-preview"><h2>상품 소개 미리보기</h2><p className="muted">판매자가 작성한 내용</p><h3>{meta.title}</h3><p>{meta.summary}</p>{editor && <StoryContent content={editor.getJSON() as StoryNode} />}</div>}
  </section>;
}
