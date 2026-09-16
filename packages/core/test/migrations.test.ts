import { describe, expect, it, vi } from 'vitest';
import { createARTMigrationRegistry, DocumentMigrationRegistry, type DocumentMigration } from '../src/migrations.js';
import { createTextDocument, parseDocument } from '../src/index.js';

const source = JSON.stringify(createTextDocument('Original'));
interface TestDocument { type: 'doc'; version: number; text: string }
const validate = (value: unknown): value is TestDocument => Boolean(value && typeof value === 'object'
  && 'type' in value && value.type === 'doc' && 'version' in value && value.version === 3
  && 'text' in value && typeof value.text === 'string');
const registry = () => new DocumentMigrationRegistry({ version: 3, validate });
const step = (fromVersion: number, toVersion: number): DocumentMigration => ({ fromVersion, toVersion,
  migrate: value => JSON.stringify({ ...JSON.parse(value), version: toVersion }) });
const versioned = (version: number) => JSON.stringify({ type: 'doc', version, text: 'Example' });

describe('explicit document migrations', () => {
  it('validates current ART without invoking migrations or changing its data', () => {
    const migrations = createARTMigrationRegistry();
    const result = migrations.migrate(source);
    expect(result).toEqual({ ok: true, document: createTextDocument('Original'), steps: [] });
    expect(migrations.list()).toEqual([]);
    expect(parseDocument(source)).toEqual(createTextDocument('Original'));
  });
  it('rejects invalid current ART and future versions without silently repairing', () => {
    const migrations = createARTMigrationRegistry();
    expect(migrations.migrate('{"type":"doc","version":1,"content":[{"type":"unknown"}]}')).toMatchObject({ ok: false, error: { code: 'invalid-document' } });
    expect(migrations.migrate(versioned(2))).toMatchObject({ ok: false, error: { code: 'future-version' }, steps: [] });
    expect(() => parseDocument(versioned(2))).toThrow();
  });
  it('supports an explicitly supplied host legacy conversion to current ART', () => {
    const migrations = createARTMigrationRegistry();
    migrations.register({ fromVersion: 0, toVersion: 1, migrate: value => JSON.stringify(createTextDocument(JSON.parse(value).text)) });
    expect(migrations.migrate(versioned(0))).toEqual({ ok: true, document: createTextDocument('Example'), steps: [{ fromVersion: 0, toVersion: 1 }] });
  });
  it('preflights missing paths without running even an available first step', () => {
    const migrations = registry();
    const migrate = vi.fn(step(1, 2).migrate);
    migrations.register({ fromVersion: 1, toVersion: 2, migrate });
    expect(migrations.migrate(versioned(1))).toMatchObject({ ok: false, error: { code: 'missing-migration' }, steps: [] });
    expect(migrate).not.toHaveBeenCalled();
  });
  it('runs ordered forward steps and supports direct version jumps', () => {
    const migrations = registry();
    migrations.register(step(2, 3)); migrations.register(step(1, 2));
    expect(migrations.list()).toEqual([{ fromVersion: 1, toVersion: 2 }, { fromVersion: 2, toVersion: 3 }]);
    expect(migrations.migrate(versioned(1))).toEqual({ ok: true, document: JSON.parse(versioned(3)), steps: migrations.list() });
    migrations.register(step(0, 3));
    expect(migrations.migrate(versioned(0))).toMatchObject({ ok: true, steps: [{ fromVersion: 0, toVersion: 3 }] });
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])('rejects invalid version %s', version => {
    expect(registry().migrate(JSON.stringify({ type: 'doc', version }))).toMatchObject({ ok: false, error: { code: 'invalid-envelope' } });
  });
  it.each(['null', '[]', '{"version":1}', '{"type":"other","version":1}'])('rejects invalid envelope %s', value => {
    expect(registry().migrate(value)).toMatchObject({ ok: false, error: { code: 'invalid-envelope' } });
  });
  it('rejects malformed and non-string input', () => {
    expect(registry().migrate('{')).toMatchObject({ ok: false, error: { code: 'invalid-json' } });
    expect(registry().migrate(null as unknown as string)).toMatchObject({ ok: false, error: { code: 'invalid-json' } });
  });
  it('rejects ambiguous paths, backwards steps and invalid registrations', () => {
    const migrations = registry(); migrations.register(step(1, 2));
    for (const value of [step(1, 3), step(2, 2), step(3, 2), step(-1, 1), step(0, 4), step(0.5, 1), { ...step(0, 1), migrate: null }]) {
      expect(() => migrations.register(value as DocumentMigration)).toThrow(TypeError);
    }
    expect(() => new DocumentMigrationRegistry({ version: -1, validate })).toThrow(TypeError);
  });
  it('copies registration metadata and protects replacements from stale disposers', () => {
    const migrations = registry(); const entry = step(1, 3);
    const dispose = migrations.register(entry); entry.toVersion = 2;
    expect(migrations.list()).toEqual([{ fromVersion: 1, toVersion: 3 }]);
    dispose(); migrations.register(step(1, 2)); dispose();
    expect(migrations.list()).toEqual([{ fromVersion: 1, toVersion: 2 }]);
  });
  it('snapshots the selected path before callbacks modify the registry', () => {
    const migrations = registry(); const dispose = migrations.register(step(2, 3));
    migrations.register({ ...step(1, 2), migrate: value => { dispose(); return step(1, 2).migrate(value); } });
    expect(migrations.migrate(versioned(1))).toMatchObject({ ok: true });
    expect(migrations.migrate(versioned(1))).toMatchObject({ ok: false, error: { code: 'missing-migration' } });
  });
  it.each(['{', 'null', '{"type":"doc","version":2}', undefined, Promise.resolve('')])('rejects invalid migration output %s', output => {
    const migrations = registry(); migrations.register({ fromVersion: 1, toVersion: 3, migrate: () => output as string });
    expect(migrations.migrate(versioned(1))).toMatchObject({ ok: false, error: { code: 'invalid-output' }, steps: [] });
  });
  it('reports failed steps without partial documents or callback exception contents', () => {
    const migrations = registry(); migrations.register(step(1, 2));
    migrations.register({ fromVersion: 2, toVersion: 3, migrate: () => { throw new Error('private document text'); } });
    const result = migrations.migrate(versioned(1));
    expect(result).toMatchObject({ ok: false, error: { code: 'migration-failed' }, steps: [{ fromVersion: 1, toVersion: 2 }] });
    expect(result).not.toHaveProperty('document');
    expect(JSON.stringify(result)).not.toContain('private document text');
  });
  it('validates the final document and catches validator failures', () => {
    const migrations = registry(); migrations.register({ fromVersion: 1, toVersion: 3, migrate: () => '{"type":"doc","version":3}' });
    expect(migrations.migrate(versioned(1))).toMatchObject({ ok: false, error: { code: 'invalid-document' } });
    const throwing = new DocumentMigrationRegistry<TestDocument>({ version: 3, validate: (_value): _value is TestDocument => { throw new Error('failed'); } });
    expect(throwing.migrate(versioned(3))).toMatchObject({ ok: false, error: { code: 'invalid-document' } });
  });
  it('isolates results from objects retained by the validator', () => {
    let retained: TestDocument | undefined;
    const migrations = new DocumentMigrationRegistry({ version: 3, validate: (value): value is TestDocument => { if (!validate(value)) return false; retained = value; return true; } });
    const result = migrations.migrate(versioned(3));
    retained!.text = 'Changed';
    expect(result).toMatchObject({ ok: true, document: { text: 'Example' } });
  });
});
