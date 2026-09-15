import { describe, expect, it } from 'vitest';
import {
  isARTDocument,
  isARTJSONValue,
  isExtensionName,
  serializeDocument,
  toPlainText,
  type ARTDocument,
} from '../src/index.js';

describe('ART extension envelopes', () => {
  it('requires namespaced lowercase extension identifiers', () => {
    expect(isExtensionName('acme:property-card')).toBe(true);
    expect(isExtensionName('arichtext:mention')).toBe(true);
    expect(isExtensionName('property')).toBe(false);
    expect(isExtensionName('Acme:Property')).toBe(false);
  });

  it('accepts finite JSON payloads and rejects runtime objects', () => {
    expect(isARTJSONValue({ id: '123', flags: [true, null], score: 4.5 })).toBe(true);
    expect(isARTJSONValue({ bad: Number.NaN })).toBe(false);
    expect(isARTJSONValue({ bad: new Date() })).toBe(false);
  });

  it('validates and serializes custom blocks and multiple namespaced marks', () => {
    const document: ARTDocument = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Alice',
            marks: [
              { type: 'extensionMark', name: 'acme:mention', attrs: { userId: 'u1' } },
              { type: 'extensionMark', name: 'acme:highlight', attrs: { tone: 'yellow' } },
            ],
          }],
        },
        {
          type: 'extensionBlock',
          name: 'acme:property-card',
          attrs: { propertyId: 'p1', price: 120000 },
          fallbackText: 'Property p1 — 120000',
        },
      ],
    };

    expect(isARTDocument(document)).toBe(true);
    expect(JSON.parse(serializeDocument(document))).toEqual(document);
    expect(toPlainText(document)).toBe('Alice\nProperty p1 — 120000');
  });

  it('rejects non-JSON custom attributes', () => {
    const invalid = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'extensionBlock',
        name: 'acme:widget',
        attrs: { bad: Number.POSITIVE_INFINITY },
      }],
    };
    expect(isARTDocument(invalid)).toBe(false);
  });
});
