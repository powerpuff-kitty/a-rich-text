import type {
  ARTDocument,
  ARTJSONObject,
} from '@arichtext/core';
import type { ARTSelection } from '@arichtext/engine';

export type CollaborationMergeMode = 'snapshot' | 'concurrent';
export type CollaborationStatus = 'connecting' | 'connected' | 'offline' | 'error' | 'closed';

export interface CollaborationCapabilities {
  /**
   * `concurrent` means the provider actually merges concurrent writers (for
   * example a CRDT adapter). `snapshot` is explicit last-update synchronization
   * and must not be presented as conflict-free multi-writer collaboration.
   */
  merge: CollaborationMergeMode;
  presence: boolean;
  offline?: boolean;
}

export interface CollaborationOrigin {
  clientId: string;
  changeId: string;
}

export interface CollaborationDocumentUpdate {
  document: ARTDocument;
  origin: CollaborationOrigin;
  /** Provider-owned opaque revision/token. */
  revision?: string;
  timestamp: number;
}

export interface PublishDocumentOptions {
  changeId?: string;
  baseRevision?: string;
}

export interface CollaborationPresence {
  clientId: string;
  /** Ephemeral logical selection; never persisted into ART. */
  selection?: ARTSelection | null;
  /** JSON-safe application metadata, e.g. display name/avatar/color token. */
  data?: ARTJSONObject;
  timestamp: number;
}

export type PresenceUpdate =
  | { type: 'upsert'; presence: CollaborationPresence }
  | { type: 'remove'; clientId: string; timestamp: number };

export interface UpdatePresenceOptions {
  /** `undefined` keeps the previous value; `null` explicitly clears selection. */
  selection?: ARTSelection | null;
  /** `undefined` keeps previous metadata; `null` explicitly clears metadata. */
  data?: ARTJSONObject | null;
}

export interface CollaborationConnectionOptions {
  documentId: string;
  clientId: string;
  initialDocument?: ARTDocument;
  initialPresence?: UpdatePresenceOptions;
  signal?: AbortSignal;
}

export interface CollaborationSession {
  readonly documentId: string;
  readonly clientId: string;
  readonly capabilities: CollaborationCapabilities;
  readonly status: CollaborationStatus;

  /** Current merged/synchronized provider state if one exists. */
  getDocument(): CollaborationDocumentUpdate | null;

  /** Publish canonical ART state. Provider is responsible for its merge model. */
  publishDocument(
    document: ARTDocument,
    options?: PublishDocumentOptions,
  ): Promise<CollaborationDocumentUpdate>;

  subscribeDocument(listener: (update: CollaborationDocumentUpdate) => void): () => void;

  updatePresence(update: UpdatePresenceOptions): Promise<CollaborationPresence>;
  getPresence(): readonly CollaborationPresence[];
  subscribePresence(listener: (update: PresenceUpdate) => void): () => void;

  subscribeStatus(listener: (status: CollaborationStatus) => void): () => void;

  close(): Promise<void>;
}

export interface CollaborationProvider {
  readonly name: string;
  readonly capabilities: CollaborationCapabilities;
  connect(options: CollaborationConnectionOptions): Promise<CollaborationSession>;
}

export type CollaborationErrorCode =
  | 'invalid-config'
  | 'invalid-document'
  | 'invalid-presence'
  | 'revision-conflict'
  | 'aborted'
  | 'closed'
  | 'provider-error';

export class CollaborationError extends Error {
  readonly code: CollaborationErrorCode;
  readonly cause?: unknown;

  constructor(code: CollaborationErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'CollaborationError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}
