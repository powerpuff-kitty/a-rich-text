import { describe, expect, it } from 'vitest';
import { createExtensionRegistry, ExtensionConflictError } from '../src/index.js';
import {
  createPreset,
  documentPreset,
  extendPreset,
  headlessPreset,
  minimalPreset,
  standardPreset,
} from '../src/presets.js';

describe('@arichtext/extensions presets', () => {
  it('keeps presets as ordinary composable extension arrays', () => {
    expect(headlessPreset.extensions.map((extension) => extension.name)).toEqual(['arichtext:core']);
    expect(minimalPreset.extensions.length).toBeGreaterThan(headlessPreset.extensions.length);
    expect(standardPreset.extensions.length).toBeGreaterThan(minimalPreset.extensions.length);
    expect(documentPreset.extensions.length).toBeGreaterThan(standardPreset.extensions.length);
  });

  it('deduplicates the exact same extension object', () => {
    const custom = { name: 'acme:properties' } as const;
    const preset = extendPreset(standardPreset, custom, custom);
    expect(preset.extensions.filter((extension) => extension.name === custom.name)).toHaveLength(1);
    expect(() => createExtensionRegistry(preset.extensions)).not.toThrow();
  });

  it('rejects a different extension object with the same name', () => {
    const first = { name: 'acme:properties', metadata: { version: 1 } } as const;
    const second = { name: 'acme:properties', metadata: { version: 2 } } as const;
    expect(() => extendPreset(createPreset('custom', [first]), second)).toThrowError(ExtensionConflictError);
  });

  it('creates custom presets without editor forks', () => {
    const preset = createPreset('article', [
      ...minimalPreset.extensions,
      { name: 'acme:callout' },
    ]);
    expect(preset.name).toBe('article');
    expect(preset.extensions.at(-1)?.name).toBe('acme:callout');
  });
});
