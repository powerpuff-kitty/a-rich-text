import { describe, expect, it, vi } from 'vitest';
import { isARTDocument, isARTJSONValue } from '../src/index.js';

describe('@arichtext/core defensive validation', () => {
  it('rejects non-finite values in extension payloads', () => {
    expect(isARTJSONValue({ good: 1, bad: Number.NaN })).toBe(false);
    expect(isARTJSONValue({ bad: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isARTJSONValue({ bad: Number.NEGATIVE_INFINITY })).toBe(false);

    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [{
        type: 'extensionBlock',
        name: 'acme:block',
        attrs: { bad: Number.NaN },
      }],
    })).toBe(false);
  });

  it('rejects runtime objects/functions in extension payloads', () => {
    class RuntimeValue {
      value = 'x';
    }

    expect(isARTJSONValue({ date: new Date() })).toBe(false);
    expect(isARTJSONValue({ regexp: /x/ })).toBe(false);
    expect(isARTJSONValue({ runtime: new RuntimeValue() })).toBe(false);
    expect(isARTJSONValue({ fn: () => 'x' })).toBe(false);
  });

  it('rejects accessors without invoking getters', () => {
    const getter = vi.fn(() => 'secret');
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, 'secret', {
      enumerable: true,
      get: getter,
    });

    expect(isARTJSONValue(payload)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects symbol/non-enumerable data and sparse/non-JSON arrays', () => {
    const symbolPayload: Record<string | symbol, unknown> = { visible: true };
    symbolPayload[Symbol('hidden')] = 'secret';
    expect(isARTJSONValue(symbolPayload)).toBe(false);

    const hiddenPayload: Record<string, unknown> = { visible: true };
    Object.defineProperty(hiddenPayload, 'hidden', {
      enumerable: false,
      value: 'secret',
    });
    expect(isARTJSONValue(hiddenPayload)).toBe(false);

    const sparse = new Array(2);
    sparse[1] = 'value';
    expect(isARTJSONValue(sparse)).toBe(false);

    const extra = ['value'] as unknown[] & { extra?: string };
    extra.extra = 'ignored by JSON';
    expect(isARTJSONValue(extra)).toBe(false);
  });

  it('accepts ordinary JSON objects including null-prototype records', () => {
    expect(isARTJSONValue({ nested: { list: [1, true, null, 'x'] } })).toBe(true);
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    nullPrototype.value = { nested: 1 };
    expect(isARTJSONValue(nullPrototype)).toBe(true);
  });

  it('rejects documents deeper than the recursion limit', () => {
    let node: unknown = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'deep' }],
    };

    for (let index = 0; index < 40; index += 1) {
      node = { type: 'blockquote', content: [node] };
    }

    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [node],
    })).toBe(false);
  });

  it('rejects malformed table/list dimensions and invalid extension identifiers', () => {
    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            colspan: 0,
            content: [{ type: 'paragraph', content: [] }],
          }],
        }],
      }],
    })).toBe(false);

    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [{
        type: 'list',
        style: 'task',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [] }],
        }],
      }],
    })).toBe(false);

    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [{
        type: 'extensionBlock',
        name: 'not-namespaced',
      }],
    })).toBe(false);
  });

  it('rejects unknown executable-looking node/mark types instead of preserving them opaquely', () => {
    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [{ type: 'script', text: 'alert(1)' }],
    })).toBe(false);

    expect(isARTDocument({
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'x',
          marks: [{ type: 'onclick', value: 'alert(1)' }],
        }],
      }],
    })).toBe(false);
  });
});
