import type { ARichTextSourceFormatter } from '@arichtext/web-component';

/** Optional Prettier formatter. Parsers load on demand; no code execution or sanitization. */
export const formatSource: ARichTextSourceFormatter = async (source, format) => {
  if (format === 'text') return source;
  // JSON.parse rejects comments, trailing commas and expressions before Prettier runs.
  if (format === 'json') JSON.parse(source);
  const { format: pretty } = await import('prettier/standalone');
  const plugins = format === 'html' ? [await import('prettier/plugins/html')]
    : format === 'markdown' ? [await import('prettier/plugins/markdown')]
      : [await import('prettier/plugins/babel'), await import('prettier/plugins/estree')];
  return pretty(source, {
    parser: format === 'json' ? 'json' : format,
    plugins,
    tabWidth: 2,
    htmlWhitespaceSensitivity: 'strict',
    proseWrap: 'preserve',
    embeddedLanguageFormatting: 'off',
  });
};
