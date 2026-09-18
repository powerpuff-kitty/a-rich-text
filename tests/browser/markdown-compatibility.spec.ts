import { expect, test } from '@playwright/test';
import type { ARichTextElement } from '../../packages/web-component/src/index.js';

test('Markdown autolinks preserve literal URL punctuation and email targets across source views', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  const markdown = '<https://example.com/`code`/*literal*> <person+tag@example.com>';
  await source.fill(markdown);
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const document = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  const links = page.locator('#editor [contenteditable] a');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveText('https://example.com/`code`/*literal*');
  await expect(links.nth(0)).toHaveAttribute('href', 'https://example.com/%60code%60/*literal*');
  await expect(links.nth(1)).toHaveAttribute('href', 'mailto:person+tag@example.com');
  await expect(page.locator('#editor [contenteditable] code, #editor [contenteditable] em')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue(markdown);
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown(editor.getMarkdown());
  });
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(document);
});

test('Markdown autolinks keep unsafe schemes and code contents non-interactive', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown('<javascript:alert(1)> `<https://example.com>` <https://safe.example>');
    editor.view = 'visual';
  });
  const surface = page.locator('#editor [contenteditable]');
  await expect(surface.locator('a')).toHaveCount(1);
  await expect(surface.locator('a')).toHaveAttribute('href', 'https://safe.example');
  await expect(surface.locator('code')).toHaveText('<https://example.com>');
  await expect(surface).toContainText('<javascript:alert(1)>');
});

test('Markdown thematic breaks separate lists and survive source/visual switching', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('* First\n*\t*\t*\n* Second\n* * * *');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const document = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(document.content.map(block => block.type)).toEqual(['list', 'horizontalRule', 'list', 'horizontalRule']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] > ul')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] > hr')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] li')).toHaveCount(2);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('- First\n\n---\n\n- Second\n\n---');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown(editor.getMarkdown());
  });
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(document);
});

test('Markdown export preserves a rule inside a list item', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown('- First\n- * * *'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await expect(source).toHaveValue('- First\n- ***');
  await source.fill('- Updated\n- ***');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] > ul')).toHaveCount(1);
  await expect(page.locator('#editor [contenteditable] li')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] li hr')).toHaveCount(1);
  await expect(page.locator('#editor [contenteditable] > hr')).toHaveCount(0);
});

test('Markdown source preserves code padding and delimiter runs through visual editing', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('``  `sample`  ``');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: ' `sample` ', marks: [{ type: 'code' }] }] }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] code')).toHaveText(' `sample` ');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('``  `sample`  ``');
});

test('Markdown code takes precedence over apparent link markup', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setMarkdown('[label `inside](/target`)'); editor.view = 'visual';
  });
  await expect(page.locator('#editor [contenteditable] a')).toHaveCount(0);
  await expect(page.locator('#editor [contenteditable] code')).toHaveText('inside](/target');
});

test('Markdown source preserves literal heading hashes and empty headings', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('# foo#\n##\n### bar ###');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] h1')).toHaveText('foo#');
  await expect(page.locator('#editor [contenteditable] h2')).toHaveText('');
  await expect(page.locator('#editor [contenteditable] h3')).toHaveText('bar');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('# foo\\#\n\n## \n\n### bar');
});

test('indented Markdown code preserves literal markup and whitespace through source views', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('    # literal\n      next  \n\n    *last*');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'codeBlock', text: '# literal\n  next  \n\n*last*' }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] pre code')).toHaveText('# literal\n  next  \n\n*last*');
  await expect(page.locator('#editor [contenteditable] h1')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('```\n# literal\n  next  \n\n*last*\n```');
});

test('setext headings update automatically and export as canonical ATX headings', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('Main *title*\n===\n\nSecond\nline\n---');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] h1')).toHaveText('Main title');
  await expect(page.locator('#editor [contenteditable] h1 em')).toHaveText('title');
  await expect(page.locator('#editor [contenteditable] h2')).toHaveText('Second line');
  await expect(page.locator('#editor [contenteditable] hr')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('# Main *title*\n\n## Second line');
});

test('indented fenced code normalizes language metadata without changing literal content', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  // Deliberately unclosed, as it would be while typing. The terminal newline
  // terminates the last content line; it must not add another empty code line.
  await source.fill('  ~~~js startline=3\n    const x = 1;\n  <b>literal</b>\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'codeBlock', language: 'js', text: '  const x = 1;\n<b>literal</b>' }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] pre code')).toHaveText('  const x = 1;\n<b>literal</b>');
  await expect(page.locator('#editor [contenteditable] pre b')).toHaveCount(0);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('```js\n  const x = 1;\n<b>literal</b>\n```');
});

test('Markdown hard breaks and literal backslashes survive visual/source switching', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('C:\\Users\\name\\\nnext line');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: 'C:\\Users\\name\nnext line' }] }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] p br')).toHaveCount(1);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('C:\\\\Users\\\\name  \nnext line');
  await source.fill('C:\\\\Users\\\\name  \nupdated line');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [{ type: 'paragraph', content: [{ text: 'C:\\Users\\name\nupdated line' }] }] });
});


test('Markdown emphasis respects intraword and whitespace boundaries', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('snake_case_word and * spaced * and ***both***');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] p')).toHaveText('snake_case_word and * spaced * and both');
  await expect(page.locator('#editor [contenteditable] em')).toHaveText('both');
  await expect(page.locator('#editor [contenteditable] strong')).toHaveText('both');
});

test('nested Markdown emphasis and code survive source reimport', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('**bold *italic* and `code`**');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const document = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] p')).toHaveText('bold italic and code');
  await expect(page.locator('#editor [contenteditable] em')).toHaveText('italic');
  await expect(page.locator('#editor [contenteditable] code')).toHaveText('code');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const canonical = await source.inputValue();
  await source.fill(canonical + ' ');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(document);
});


test('Markdown source retains Unicode spaces across visual/source round trips', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('\u00a0first\u00a0\n\u202f\nlast\u2003');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const document = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(document.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: '\u00a0first\u00a0 \u202f last\u2003' }] }]);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  expect(await page.locator('#editor [contenteditable] p').textContent()).toBe('\u00a0first\u00a0 \u202f last\u2003');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('\u00a0first\u00a0 \u202f last\u2003');
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(document);
});

test('Markdown preserves Unicode-only paragraphs and quoted Unicode separators', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('\u00a0\n\n> before\u2028after');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toMatchObject({ content: [
    { type: 'paragraph', content: [{ type: 'text', text: '\u00a0' }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'before\u2028after' }] }] },
  ] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  expect(await page.locator('#editor [contenteditable] blockquote p').textContent()).toBe('before\u2028after');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await expect(source).toHaveValue('\u00a0\n\n> before\u2028after');
});


test('Markdown tables normalize ragged rows and stop before block markers', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('| Name | Value |\n| - | - |\n| short |\n| a | b | ignored |\nlast\n# End | title');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  const table = doc.content[0]!;
  expect(table.type).toBe('table');
  if (table.type !== 'table') throw new Error('Expected table');
  expect(table.content).toHaveLength(4);
  expect(table.content.every(row => row.content.length === 2)).toBe(true);
  expect(table.content[1]?.content[1]?.content).toEqual([{ type: 'paragraph', content: [] }]);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] table tr')).toHaveCount(4);
  await expect(page.locator('#editor [contenteditable] h1')).toHaveText('End | title');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  expect(await source.inputValue()).not.toContain('ignored');
});

test('Markdown table code cells retain escaped pipes through source reimport', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('| code |\n| --- |\n| `\\|` |\n| `\\\\|` |');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  expect(await page.locator('#editor [contenteditable] table code').allTextContents()).toEqual(['|', '\\|']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});


test('empty and nested Markdown quotes survive HTML source reimport', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('>\n\n> >\n\nafter');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content).toEqual([
    { type: 'blockquote', content: [] },
    { type: 'blockquote', content: [{ type: 'blockquote', content: [] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
  ]);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] blockquote')).toHaveCount(3);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'html'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('empty quotes in list items survive Markdown and HTML source views', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'html';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('<ul><li><blockquote></blockquote></li><li><blockquote><blockquote></blockquote></blockquote></li></ul>');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content).toEqual([{ type: 'list', style: 'bullet', content: [
    { type: 'listItem', content: [{ type: 'blockquote', content: [] }] },
    { type: 'listItem', content: [{ type: 'blockquote', content: [{ type: 'blockquote', content: [] }] }] },
  ] }]);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] li')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] blockquote')).toHaveCount(3);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});


test('nested quote continuation preserves inline marks and quote depth', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('>>> *first\n> second\n>> third*');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content).toHaveLength(1);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] blockquote')).toHaveCount(3);
  await expect(page.locator('#editor [contenteditable] p em')).toHaveText('first second third');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('lazy quote text does not become a setext heading or cross a blank boundary', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => {
    const editor = node as ARichTextElement;
    editor.setText('Original'); editor.view = 'markdown';
  });
  const source = page.locator('#editor [part="source"]');
  await source.fill('> first\nsecond\n===\n\noutside\n\n> # Heading\nafter');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content.map(block => block.type)).toEqual(['blockquote', 'paragraph', 'blockquote', 'paragraph']);
  expect(doc.content[0]).toEqual({ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first second ===' }] }] });
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] h1')).toHaveText('Heading');
  await expect(page.locator('#editor [contenteditable] blockquote')).toHaveCount(2);
});

test('non-one ordered markers remain paragraph text across source views', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const source = page.locator('#editor [part="source"]');
  await source.fill('first\n14. item\n\n> quoted\n2) continuation\n\n1. actual list');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content.map(block => block.type)).toEqual(['paragraph', 'blockquote', 'list']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] blockquote p')).toHaveText('quoted 2) continuation');
  await expect(page.locator('#editor [contenteditable] ol')).toHaveCount(1);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('empty list items and maximum-width starts survive Markdown reimport', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const source = page.locator('#editor [part="source"]');
  await source.fill('- first\n-\n- last\n\n999999999. numbered\n1.');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content.map(block => block.type)).toEqual(['list', 'list']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] ul li')).toHaveCount(3);
  await expect(page.locator('#editor [contenteditable] ol li')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] ol')).toHaveAttribute('start', '999999999');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('changed list markers preserve separate visual lists and ordered starts', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const source = page.locator('#editor [part="source"]');
  await source.fill('- one\n- two\n+ three\n\n1. first\n2. second\n3) third');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content.map(block => block.type)).toEqual(['list', 'list', 'list', 'list']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] ul')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] ol')).toHaveCount(2);
  await expect(page.locator('#editor [contenteditable] ol').last()).toHaveAttribute('start', '3');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('task list boundaries survive nested quote source conversion', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const source = page.locator('#editor [part="source"]');
  await source.fill('> - [x] one\n> + [ ] two\n> * [x] three');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content[0]?.type).toBe('blockquote');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] blockquote ul')).toHaveCount(3);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('wide ordered markers preserve nested code tabs and lists', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const source = page.locator('#editor [part="source"]');
  await source.fill('10. first\n\n    ```\n    \tcode\n    ```\n\n    - nested\n\noutside');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content.map(block => block.type)).toEqual(['list', 'paragraph']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] ol')).toHaveAttribute('start', '10');
  await expect(page.locator('#editor [contenteditable] ol ul')).toHaveCount(1);
  expect(await page.locator('#editor [contenteditable] pre code').textContent()).toBe('\tcode');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});

test('list paragraph continuations and task child blocks survive source reimport', async ({ page }) => {
  await page.goto('/dist/browser/');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  const source = page.locator('#editor [part="source"]');
  await source.fill('1. first\n  continued\n\n- [x] task\n\n  > quoted\n\n  ```\n  code\n  ```');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  const doc = await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON());
  expect(doc.content.map(block => block.type)).toEqual(['list', 'list']);
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'visual'; });
  await expect(page.locator('#editor [contenteditable] ol p')).toHaveText('first continued');
  await expect(page.locator('#editor [contenteditable] ul blockquote')).toHaveText('quoted');
  await expect(page.locator('#editor [contenteditable] ul pre code')).toHaveText('code');
  await page.locator('#editor').evaluate(node => { (node as ARichTextElement).view = 'markdown'; });
  await source.fill((await source.inputValue()) + '\n');
  await expect.poll(() => page.locator('#editor').evaluate(node => (node as ARichTextElement).sourceDirty)).toBe(false);
  expect(await page.locator('#editor').evaluate(node => (node as ARichTextElement).getJSON())).toEqual(doc);
});
