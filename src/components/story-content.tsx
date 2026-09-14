import type { StoryNode } from '../domain/model';
import { videoUrl } from '../domain/story';

export function StoryContent({ content }: { content: StoryNode }) {
  function render(node: StoryNode, key: number | string): React.ReactNode {
    const children = node.content?.map((child, index) => render(child, index));
    if (node.type === 'doc') return <div key={key} className="story-prose">{children}</div>;
    if (node.type === 'paragraph') return <p key={key}>{children}</p>;
    if (node.type === 'heading') return Number(node.attrs?.level) === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
    if (node.type === 'bulletList') return <ul key={key}>{children}</ul>;
    if (node.type === 'orderedList') return <ol key={key}>{children}</ol>;
    if (node.type === 'listItem') return <li key={key}>{children}</li>;
    if (node.type === 'blockquote') return <blockquote key={key}>{children}</blockquote>;
    if (node.type === 'codeBlock') return <pre key={key}><code>{children}</code></pre>;
    if (node.type === 'hardBreak') return <br key={key} />;
    if (node.type === 'image') return <figure key={key}><img src={String(node.attrs?.src)} alt={String(node.attrs?.alt ?? '')} loading="lazy" /></figure>;
    if (node.type === 'video') {
      try {
        const video = videoUrl(String(node.attrs?.src));
        return video.kind === 'youtube' ? <div key={key} className="video-frame"><iframe src={video.embed} title="판매자 영상" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
          : <a key={key} className="video-link" href={video.href} target="_blank" rel="noopener noreferrer">외부 영상 열기 · {new URL(video.href).hostname}</a>;
      } catch { return null; }
    }
    if (node.type === 'text') {
      let output: React.ReactNode = node.text ?? '';
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') output = <strong>{output}</strong>;
        if (mark.type === 'link' && mark.attrs?.href?.startsWith('https://')) output = <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">{output}</a>;
      }
      return <span key={key}>{output}</span>;
    }
    return null;
  }
  return render(content, 'root');
}
