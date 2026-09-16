export const EDITOR_TOOLS = [
  'paragraph', 'heading', 'bold', 'italic', 'underline', 'strike', 'code', 'link',
  'image', 'blockquote', 'code-block', 'horizontal-rule', 'clear-formatting',
  'bullet-list', 'ordered-list', 'task-list', 'indent', 'outdent',
  'insert-table', 'remove-table', 'merge-cell-right', 'merge-cell-below', 'split-cell', 'add-row', 'remove-row', 'add-column', 'remove-column', 'undo', 'redo', 'focus-mode', 'find-replace',
] as const;
export type ARichTextTool = typeof EDITOR_TOOLS[number];
export const EDITOR_VIEWS = ['visual', 'html', 'markdown', 'json', 'text'] as const;
export type ARichTextView = typeof EDITOR_VIEWS[number];

export function tokens(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[\s,]+/).filter(Boolean).map((token) => token === 'md' ? 'markdown' : token))];
}
