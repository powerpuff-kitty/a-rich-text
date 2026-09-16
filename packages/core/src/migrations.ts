import { ART_DOCUMENT_VERSION, isARTDocument, type ARTDocument } from './index.js';

export interface DocumentMigration {
  fromVersion: number;
  toVersion: number;
  /** Trusted synchronous transformation. Both input and output are JSON strings. */
  migrate: (source: string) => string;
}
export interface MigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
}
export interface MigrationTarget<T> {
  version: number;
  validate: (value: unknown) => value is T;
}
export type MigrationErrorCode = 'invalid-json' | 'invalid-envelope' | 'future-version'
  | 'missing-migration' | 'migration-failed' | 'invalid-output' | 'invalid-document';
export type MigrationResult<T> =
  | { ok: true; document: T; steps: readonly MigrationStep[] }
  | { ok: false; error: { code: MigrationErrorCode; message: string }; steps: readonly MigrationStep[] };

const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function readEnvelope(source: string): { type: 'doc'; version: number } {
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('type' in value) || value.type !== 'doc'
    || !('version' in value) || !isVersion(value.version)) throw new TypeError('Invalid versioned document envelope');
  return value as { type: 'doc'; version: number };
}

/** Explicit forward-only migrations. No persistence, editor mutation or network IO. */
export class DocumentMigrationRegistry<T extends { type: 'doc'; version: number }> {
  #target: Readonly<MigrationTarget<T>>;
  #migrations = new Map<number, Readonly<DocumentMigration>>();

  constructor(target: MigrationTarget<T>) {
    if (!target || !isVersion(target.version) || typeof target.validate !== 'function') {
      throw new TypeError('Invalid migration target');
    }
    this.#target = Object.freeze({ version: target.version, validate: target.validate });
  }

  register(migration: DocumentMigration): () => void {
    if (!migration || !isVersion(migration.fromVersion) || !isVersion(migration.toVersion)
      || migration.toVersion <= migration.fromVersion || migration.toVersion > this.#target.version
      || typeof migration.migrate !== 'function') throw new TypeError('Invalid forward migration');
    if (this.#migrations.has(migration.fromVersion)) throw new TypeError('Duplicate migration source version');
    const entry = Object.freeze({ ...migration });
    this.#migrations.set(entry.fromVersion, entry);
    return () => {
      if (this.#migrations.get(entry.fromVersion) === entry) this.#migrations.delete(entry.fromVersion);
    };
  }

  list(): readonly MigrationStep[] {
    return [...this.#migrations.values()].sort((a, b) => a.fromVersion - b.fromVersion)
      .map(({ fromVersion, toVersion }) => Object.freeze({ fromVersion, toVersion }));
  }

  migrate(source: string): MigrationResult<T> {
    const steps: MigrationStep[] = [];
    const fail = (code: MigrationErrorCode, message: string): MigrationResult<T> => ({ ok: false, error: { code, message }, steps });
    let envelope: { type: 'doc'; version: number };
    if (typeof source !== 'string') return fail('invalid-json', 'Migration input must be a JSON string');
    try { JSON.parse(source); } catch { return fail('invalid-json', 'Migration input is not valid JSON'); }
    try { envelope = readEnvelope(source); } catch { return fail('invalid-envelope', 'Expected a doc with a nonnegative safe-integer version'); }
    if (envelope.version > this.#target.version) return fail('future-version', 'Document version is newer than the migration target');

    // Snapshot and preflight the entire path before invoking trusted host callbacks.
    const path: Readonly<DocumentMigration>[] = [];
    let version = envelope.version;
    while (version < this.#target.version) {
      const migration = this.#migrations.get(version);
      if (!migration) return fail('missing-migration', `No migration registered from version ${version}`);
      path.push(migration);
      version = migration.toVersion;
    }
    let serialized = source;
    for (const migration of path) {
      let output: string;
      try { output = migration.migrate(serialized); }
      catch { return fail('migration-failed', `Migration from ${migration.fromVersion} to ${migration.toVersion} failed`); }
      if (typeof output !== 'string') return fail('invalid-output', 'A migration must return a JSON string synchronously');
      try {
        const value = readEnvelope(output);
        if (value.version !== migration.toVersion) return fail('invalid-output', 'Migration output does not match its declared target version');
      } catch { return fail('invalid-output', 'Migration output is not valid versioned document JSON'); }
      serialized = output;
      steps.push(Object.freeze({ fromVersion: migration.fromVersion, toVersion: migration.toVersion }));
    }
    // Validate a separate copy: validators cannot mutate the returned document.
    const document: unknown = JSON.parse(serialized);
    try {
      if (this.#target.validate(JSON.parse(serialized)) !== true) return fail('invalid-document', 'Document failed target validation');
    } catch { return fail('invalid-document', 'Target validation failed'); }
    return { ok: true, document: document as T, steps };
  }
}

/** Empty by default: no pre-v1 ART format or automatic repair is assumed. */
export function createARTMigrationRegistry(): DocumentMigrationRegistry<ARTDocument> {
  return new DocumentMigrationRegistry({ version: ART_DOCUMENT_VERSION, validate: isARTDocument });
}
