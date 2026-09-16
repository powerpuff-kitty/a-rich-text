import { parseDocument } from '@arichtext/core';

export interface InputFormatDetection {
  format: 'json' | 'html' | 'markdown' | 'text';
  /** A shape hint for foreign JSON, not validation of that editor's schema. */
  profile: string;
  confidence: 'validated' | 'heuristic' | 'ambiguous';
  supported: boolean;
  alternatives: Array<'html' | 'markdown' | 'text'>;
}

/** Suggests an import format. Never mutates content or overrides an explicit choice. */
export function detectInputFormat(input: string): InputFormatDetection {
  const value = input.trim();
  try {
    const json: unknown = JSON.parse(value);
    try {
      parseDocument(value);
      return { format: 'json', profile: 'art-v1', confidence: 'validated', supported: true, alternatives: [] };
    } catch { /* Valid JSON does not necessarily describe an ART document. */ }
    const object = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : {};
    const profile = Array.isArray(object.ops) ? 'quill-delta'
      : Array.isArray(object.blocks) ? 'editorjs-blocks'
        : object.type === 'doc' ? 'prosemirror'
          : object.root && typeof object.root === 'object' ? 'lexical'
            : Array.isArray(json) && json.some(node => node && typeof node === 'object' && 'children' in node) ? 'slate'
              : 'unknown-json';
    return { format: 'json', profile, confidence: 'heuristic', supported: false, alternatives: ['text'] };
  } catch { /* Non-JSON needs heuristics; incomplete JSON must not be silently imported as text. */ }
  if (/^[\[{]/.test(value) && !/^\[[^\]\n]+\]\(/.test(value)) {
    return { format: 'json', profile: 'incomplete-or-unknown-json', confidence: 'ambiguous', supported: false, alternatives: ['markdown', 'text'] };
  }
  if (/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/i.test(value)) {
    return { format: 'html', profile: 'html-fragment', confidence: 'heuristic', supported: true, alternatives: ['markdown', 'text'] };
  }
  if (/^(?:#{1,6} |[-*+] |\d+\. |> |```|~~~)|\*\*[^*]+\*\*|\[[^\]\n]+\]\([^\n)]+\)/m.test(value)) {
    return { format: 'markdown', profile: 'art-markdown', confidence: 'heuristic', supported: true, alternatives: ['text'] };
  }
  return { format: 'text', profile: 'plain-text', confidence: 'ambiguous', supported: true, alternatives: ['markdown'] };
}
