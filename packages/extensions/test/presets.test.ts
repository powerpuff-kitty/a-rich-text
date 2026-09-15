import { describe, expect, it } from 'vitest';
import { createExtensionRegistry } from '../src/index.js';
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

  it('extends a preset without duplicating extension names', () => {
    const custom = { name: 'acme:properties' } as const;
    const preset = extendPreset(standardPreset, custom, custom);
    expect(preset.extensions.filter((extension) => extension.name === custom.name)).toHaveLength(1);
    expect(() => createExtensionRegistry(preset.extensions)).not.toThrow();
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
