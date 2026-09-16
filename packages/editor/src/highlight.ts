import type { ARichTextElement } from '@arichtext/web-component';

/** Optional small lexer for JS/TS, JSON and CSS; unknown languages stay plain.
 * View decoration only: no model mutations, HTML injection or network requests.
 */
export function enableCodeHighlighting(editor: ARichTextElement): { refresh(): void; destroy(): void } {
  const root = editor.shadowRoot;
  if (!root) throw new TypeError('An initialized editor is required');
  const style = editor.ownerDocument.createElement('style');
  style.textContent = '[data-art-token=keyword]{color:var(--art-code-keyword,#8246af)}[data-art-token=string]{color:var(--art-code-string,#146d4b)}[data-art-token=number]{color:var(--art-code-number,#ac4a0c)}[data-art-token=comment]{color:var(--art-code-comment,#64748b)}';
  root.append(style);
  const seen = new WeakMap<Element, string>();
  let destroyed = false;
  const refresh = () => {
    if (destroyed) return;
    for (const code of root.querySelectorAll<HTMLElement>('[part="code-content"]')) {
      const language = code.className.replace(/^language-/, '').toLowerCase();
      const text = code.textContent ?? '';
      if (seen.get(code) === `${language}:${text}`) continue;
      seen.set(code, `${language}:${text}`);
      if (!['js', 'javascript', 'ts', 'typescript', 'json', 'css'].includes(language) || text.length > 100_000) continue;
      const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|throw|try|catch|interface|type|true|false|null|undefined|this|typeof)\b|\b\d+(?:\.\d+)?\b/g;
      const fragment = editor.ownerDocument.createDocumentFragment();
      let offset = 0;
      for (const match of text.matchAll(pattern)) {
        fragment.append(text.slice(offset, match.index));
        const span = editor.ownerDocument.createElement('span');
        span.dataset.artToken = match[0].startsWith('/') ? 'comment' : /^["'`]/.test(match[0]) ? 'string' : /^\d/.test(match[0]) ? 'number' : 'keyword';
        span.textContent = match[0]; fragment.append(span); offset = match.index + match[0].length;
      }
      fragment.append(text.slice(offset)); code.replaceChildren(fragment);
    }
  };
  const observer = new MutationObserver(refresh);
  observer.observe(root.querySelector('[part="editor"]')!, { childList: true, subtree: true, characterData: true });
  refresh();
  return { refresh, destroy() {
    destroyed = true; observer.disconnect(); style.remove();
    for (const code of root.querySelectorAll('[part="code-content"]')) if (code.querySelector('[data-art-token]')) code.textContent = code.textContent;
  } };
}
