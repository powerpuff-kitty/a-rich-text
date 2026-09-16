// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { isARTDocument } from '../../core/src/index.js';
import { fromHTML, toHTML } from '../src/index.js';

it('round-trips a vertical span with a fully covered empty row', () => {
  const html = '<table><tr><td rowspan="2" colspan="2"><p>Shared</p></td></tr><tr></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></table>';
  const document = fromHTML(html);
  expect(isARTDocument(document)).toBe(true);
  expect(document.content[0]).toMatchObject({ type: 'table', content: [
    { content: [{ colspan: 2, rowspan: 2 }] }, { content: [] }, { content: [{}, {}] },
  ] });
  expect(fromHTML(toHTML(document))).toEqual(document);
});
