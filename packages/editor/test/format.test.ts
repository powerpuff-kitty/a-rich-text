import { expect, it } from 'vitest';
import { formatSource } from '../src/format.js';

it('formats JSON without changing values and rejects JSON extensions', async () => {
  const input = '{"hello":[1,2],"text":"literal"}';
  const output = await formatSource(input, 'json');
  expect(output).toContain('\n'); expect(JSON.parse(output)).toEqual(JSON.parse(input));
  await expect(formatSource('{"a":1,}', 'json')).rejects.toThrow();
});
it('formats HTML and Markdown without executing or sanitizing source', async () => {
  const html = await formatSource('<div><p>Hello</p><p>world</p></div>', 'html');
  expect(html).toContain('<p>Hello</p>'); expect(html).toContain('<p>world</p>');
  expect(await formatSource('# Heading\n\n* item', 'markdown')).toBe('# Heading\n\n- item\n');
  expect(await formatSource('  plain  ', 'text')).toBe('  plain  ');
});
