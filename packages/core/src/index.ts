export const ART_DOCUMENT_VERSION = 1 as const;

export type ARTTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string };

export interface ARTTextNode {
  type: 'text';
  text: string;
  marks?: ARTTextMark[];
}

export interface ARTParagraphNode {
  type: 'paragraph';
  content?: ARTTextNode[];
}

export interface ARTHeadingNode {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content?: ARTTextNode[];
}

export type ARTBlockNode = ARTParagraphNode | ARTHeadingNode;

export interface ARTDocument {
  type: 'doc';
  version: typeof ART_DOCUMENT_VERSION;
  content: ARTBlockNode[];
}

export function createEmptyDocument(): ARTDocument {
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: [{ type: 'paragraph', content: [] }],
  };
}

export function createTextDocument(text: string): ARTDocument {
  return {
    type: 'doc',
    version: ART_DOCUMENT_VERSION,
    content: [
      {
        type: 'paragraph',
        content: text.length > 0 ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

export function isARTDocument(value: unknown): value is ARTDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ARTDocument>;
  if (candidate.type !== 'doc' || candidate.version !== ART_DOCUMENT_VERSION) return false;
  if (!Array.isArray(candidate.content)) return false;

  return candidate.content.every((node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type !== 'paragraph' && node.type !== 'heading') return false;
    if (node.type === 'heading' && (![1, 2, 3, 4, 5, 6] as number[]).includes(node.level)) {
      return false;
    }
    if (node.content === undefined) return true;
    return Array.isArray(node.content) && node.content.every(isTextNode);
  });
}

function isTextNode(value: unknown): value is ARTTextNode {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ARTTextNode>;
  return candidate.type === 'text' && typeof candidate.text === 'string';
}

export function toPlainText(document: ARTDocument): string {
  return document.content
    .map((block) => (block.content ?? []).map((node) => node.text).join(''))
    .join('\n');
}

export function serializeDocument(document: ARTDocument): string {
  if (!isARTDocument(document)) {
    throw new TypeError('Invalid ART document');
  }
  return JSON.stringify(document);
}

export function parseDocument(serialized: string): ARTDocument {
  const value: unknown = JSON.parse(serialized);
  if (!isARTDocument(value)) {
    throw new TypeError('Invalid ART document');
  }
  return value;
}
