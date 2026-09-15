import { describe, expect, it } from 'vitest';

describe('@arichtext/web-component SSR boundary', () => {
  it('can be imported without browser globals', async () => {
    expect(typeof HTMLElement).toBe('undefined');
    expect(typeof customElements).toBe('undefined');

    const module = await import('../src/index.js');

    expect(module.ARichTextElement).toBeDefined();
    expect(() => module.defineARichText()).not.toThrow();
  });
});
