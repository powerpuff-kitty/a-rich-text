// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { fromHTML, sanitizeHTML, toHTML } from '../src/index.js';

describe('@arichtext/html', () => {
  it('converts supported rich HTML into ART and back deterministically', () => {
    const document = fromHTML('<h2>Hello <strong>world</strong></h2><ul><li>One</li><li>Two</li></ul>');

    expect(document.content[0]).toEqual({
      type: 'heading',
      level: 2,
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
      ],
    });

    expect(toHTML(document)).toBe('<h2>Hello <strong>world</strong></h2><ul><li><p>One</p></li><li><p>Two</p></li></ul>');
  });

  it('drops executable nodes and unsafe URLs', () => {
    const output = sanitizeHTML([
      '<script>alert(1)</script>',
      '<p><a href="javascript:alert(1)">unsafe</a> <a href="https://arichtext.com">safe</a></p>',
      '<img src="javascript:alert(1)" alt="bad">',
    ].join(''));

    expect(output).not.toContain('<script');
    expect(output).not.toContain('javascript:');
    expect(output).toContain('unsafe');
    expect(output).toContain('<a href="https://arichtext.com">safe</a>');
    expect(output).not.toContain('<img');
  });

  it('supports task lists and table structure', () => {
    const document = fromHTML([
      '<ul data-art-list="task"><li data-checked="true"><input type="checkbox" checked disabled>Done</li></ul>',
      '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>',
    ].join(''));

    expect(document.content[0]).toMatchObject({
      type: 'list',
      style: 'task',
      content: [{ checked: true }],
    });
    expect(document.content[1]).toMatchObject({ type: 'table' });
    expect(toHTML(document)).toContain('data-art-list="task"');
  });
});
