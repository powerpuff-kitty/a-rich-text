import { parseDocument, serializeDocument, type ARTDocument } from './index.js';

export type FormatFamily = 'json' | 'html' | 'markdown' | 'text';
export interface ConversionDiagnostic {
  code: string;
  message: string;
  severity: 'warning' | 'loss' | 'error';
}
export interface ConversionOutput<T> {
  value: T;
  diagnostics?: readonly ConversionDiagnostic[];
}
export type ConversionResult<T> =
  | { ok: true; value: T; diagnostics: readonly ConversionDiagnostic[] }
  | { ok: false; diagnostics: readonly ConversionDiagnostic[] };
export interface FormatProfile {
  /** Stable namespaced ID, including a version, e.g. acme:article-v1. */
  id: string;
  family: FormatFamily;
  label: string;
  import?: (source: string) => ConversionOutput<ARTDocument>;
  export?: (document: ARTDocument) => ConversionOutput<string>;
}
export interface FormatProfileInfo {
  readonly id: string;
  readonly family: FormatFamily;
  readonly label: string;
  readonly canImport: boolean;
  readonly canExport: boolean;
}
const families: readonly string[] = ['json', 'html', 'markdown', 'text'];
const idPattern = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/;
const failure = (code: string, message: string): ConversionResult<never> => ({ ok: false, diagnostics: [{ code, message, severity: 'error' }] });
function diagnostics(value: unknown): ConversionDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => !item || typeof item.code !== 'string' || !item.code.trim()
    || typeof item.message !== 'string' || !['warning', 'loss', 'error'].includes(item.severity))) {
    throw new TypeError('Invalid converter diagnostics');
  }
  return value.map(({ code, message, severity }) => ({ code, message, severity }));
}

/** Instance-scoped synchronous converters. Conversion never changes an editor. */
export class FormatProfileRegistry {
  #profiles = new Map<string, Readonly<FormatProfile>>();

  register(profile: FormatProfile): () => void {
    if (!profile || !idPattern.test(profile.id) || !families.includes(profile.family)
      || typeof profile.label !== 'string' || !profile.label.trim()
      || (profile.import !== undefined && typeof profile.import !== 'function')
      || (profile.export !== undefined && typeof profile.export !== 'function')
      || (!profile.import && !profile.export)) throw new TypeError('Invalid format profile');
    if (this.#profiles.has(profile.id)) throw new TypeError(`Duplicate format profile: ${profile.id}`);
    const entry = Object.freeze({ ...profile });
    this.#profiles.set(entry.id, entry);
    return () => { if (this.#profiles.get(entry.id) === entry) this.#profiles.delete(entry.id); };
  }

  list(): readonly FormatProfileInfo[] {
    return Array.from(this.#profiles.values(), profile => Object.freeze({
      id: profile.id, family: profile.family, label: profile.label,
      canImport: Boolean(profile.import), canExport: Boolean(profile.export),
    }));
  }

  import(id: string, source: string, family?: FormatFamily): ConversionResult<ARTDocument> {
    const profile = this.#profiles.get(id);
    if (!profile) return failure('unknown-profile', `Unknown format profile: ${id}`);
    if (family !== undefined && family !== profile.family) return failure('family-mismatch', 'Profile does not match the requested format');
    if (!profile.import) return failure('unsupported-direction', 'Profile does not support import');
    try {
      if (typeof source !== 'string') throw new TypeError('Source must be a string');
      // A JSON profile uses JSON syntax, even when its document schema is custom.
      if (profile.family === 'json') JSON.parse(source);
      const output = profile.import(source);
      const notes = diagnostics(output?.diagnostics);
      if (notes.some(note => note.severity === 'error')) return { ok: false, diagnostics: notes };
      const value = parseDocument(serializeDocument(output.value));
      return { ok: true, value, diagnostics: notes };
    } catch (error) {
      return failure('import-failed', error instanceof Error ? error.message : 'Conversion failed');
    }
  }

  export(id: string, document: ARTDocument, family?: FormatFamily): ConversionResult<string> {
    const profile = this.#profiles.get(id);
    if (!profile) return failure('unknown-profile', `Unknown format profile: ${id}`);
    if (family !== undefined && family !== profile.family) return failure('family-mismatch', 'Profile does not match the requested format');
    if (!profile.export) return failure('unsupported-direction', 'Profile does not support export');
    try {
      // Give converters an isolated document, never the caller's live model.
      const output = profile.export(parseDocument(serializeDocument(document)));
      const notes = diagnostics(output?.diagnostics);
      if (notes.some(note => note.severity === 'error')) return { ok: false, diagnostics: notes };
      if (typeof output.value !== 'string') throw new TypeError('Export must return a string');
      if (profile.family === 'json') JSON.parse(output.value);
      return { ok: true, value: output.value, diagnostics: notes };
    } catch (error) {
      return failure('export-failed', error instanceof Error ? error.message : 'Conversion failed');
    }
  }
}

/** Explicit opt-in profile for the existing ART v1 JSON representation. */
export const artJSONProfile: Readonly<FormatProfile> = Object.freeze({
  id: 'art:json-v1', family: 'json', label: 'ART JSON',
  import: (source: string) => ({ value: parseDocument(source) }),
  export: (document: ARTDocument) => ({ value: serializeDocument(document) }),
});
