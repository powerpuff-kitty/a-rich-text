import {
  CollaborationError,
  cloneARTDocument,
  clonePresenceData,
  type CollaborationDocumentUpdate,
  type CollaborationProvider,
  type CollaborationSession,
  type CollaborationStatus,
  type PresenceUpdate,
} from '@arichtext/collaboration';
import { serializeDocument, type ARTJSONObject } from '@arichtext/core';
import type { ARichTextElement } from '@arichtext/web-component';

export type InitialDocumentPolicy = 'provider' | 'editor';

export interface CollaborationEditorOptions {
  documentId: string;
  clientId: string;
  initialDocumentPolicy?: InitialDocumentPolicy;
  presenceData?: ARTJSONObject;
  signal?: AbortSignal;
  onStatus?: (status: CollaborationStatus) => void;
  onRemoteDocument?: (update: CollaborationDocumentUpdate) => void;
  onPresence?: (update: PresenceUpdate) => void;
  onError?: (error: unknown) => void;
}

export interface CollaborationStatusDetail {
  status: CollaborationStatus;
}

export interface CollaborationRemoteDocumentDetail {
  update: CollaborationDocumentUpdate;
}

export interface CollaborationPresenceDetail {
  update: PresenceUpdate;
}

export interface CollaborationEditorErrorDetail {
  error: unknown;
}

export class CollaborationEditorController {
  readonly editor: ARichTextElement;
  readonly session: CollaborationSession;
  readonly options: CollaborationEditorOptions;

  #destroyed = false;
  #presenceData?: ARTJSONObject;
  #revision?: string;
  #remoteEpoch = 0;
  #publishQueue: Promise<void> = Promise.resolve();
  #presenceQueue: Promise<void> = Promise.resolve();
  #seenChanges = new Set<string>();
  #unsubscribers: Array<() => void> = [];

  constructor(
    editor: ARichTextElement,
    session: CollaborationSession,
    options: CollaborationEditorOptions,
  ) {
    this.editor = editor;
    this.session = session;
    this.options = options;
    this.#presenceData = clonePresenceData(options.presenceData);
    this.#revision = session.getDocument()?.revision;

    this.#unsubscribers.push(
      session.subscribeDocument(this.#handleRemoteDocument),
      session.subscribePresence(this.#handleRemotePresence),
      session.subscribeStatus(this.#handleStatus),
    );
    editor.addEventListener('transaction', this.#handleTransaction);
    editor.addEventListener('reconcile', this.#handleReconcile);
    editor.addEventListener('selection-change', this.#handleSelectionChange);
  }

  get status(): CollaborationStatus {
    return this.session.status;
  }

  get capabilities() {
    return this.session.capabilities;
  }

  get presence() {
    return this.session.getPresence();
  }

  async publishNow(): Promise<CollaborationDocumentUpdate> {
    this.#assertActive();
    return this.#publishDocument(cloneARTDocument(this.editor.getJSON()));
  }

  async setPresenceData(data: ARTJSONObject | undefined): Promise<void> {
    this.#assertActive();
    this.#presenceData = clonePresenceData(data);
    await this.#publishPresence();
  }

  async disconnect(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.editor.removeEventListener('transaction', this.#handleTransaction);
    this.editor.removeEventListener('reconcile', this.#handleReconcile);
    this.editor.removeEventListener('selection-change', this.#handleSelectionChange);
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe();
    await Promise.allSettled([this.#publishQueue, this.#presenceQueue]);
    await this.session.close();
  }

  #handleTransaction = (event: Event): void => {
    if (this.#destroyed) return;
    const result = (event as CustomEvent<{ result?: { documentChanged?: boolean } }>).detail?.result;
    if (!result?.documentChanged) return;
    this.#queuePublish(cloneARTDocument(this.editor.getJSON()));
  };

  #handleReconcile = (): void => {
    if (this.#destroyed) return;
    this.#queuePublish(cloneARTDocument(this.editor.getJSON()));
  };

  #handleSelectionChange = (): void => {
    if (this.#destroyed || !this.session.capabilities.presence) return;
    this.#presenceQueue = this.#presenceQueue
      .then(() => this.#publishPresence())
      .catch((error) => this.#emitError(error));
  };

  #handleRemoteDocument = (update: CollaborationDocumentUpdate): void => {
    if (this.#destroyed || update.origin.clientId === this.session.clientId) return;
    const key = `${update.origin.clientId}:${update.origin.changeId}`;
    if (this.#seenChanges.has(key)) return;
    this.#rememberChange(key);

    try {
      const document = cloneARTDocument(update.document);
      this.#remoteEpoch += 1;
      this.#revision = update.revision;
      if (serializeDocument(this.editor.getJSON()) !== serializeDocument(document)) {
        this.editor.setJSON(document);
      }
      const safeUpdate: CollaborationDocumentUpdate = {
        ...update,
        document,
        origin: { ...update.origin },
      };
      this.options.onRemoteDocument?.(safeUpdate);
      this.editor.dispatchEvent(new CustomEvent<CollaborationRemoteDocumentDetail>('collaboration-remote-document', {
        detail: { update: safeUpdate },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      this.#emitError(error);
    }
  };

  #handleRemotePresence = (update: PresenceUpdate): void => {
    if (this.#destroyed) return;
    this.options.onPresence?.(update);
    this.editor.dispatchEvent(new CustomEvent<CollaborationPresenceDetail>('collaboration-presence', {
      detail: { update },
      bubbles: true,
      composed: true,
    }));
  };

  #handleStatus = (status: CollaborationStatus): void => {
    if (this.#destroyed && status !== 'closed') return;
    this.options.onStatus?.(status);
    this.editor.dispatchEvent(new CustomEvent<CollaborationStatusDetail>('collaboration-status', {
      detail: { status },
      bubbles: true,
      composed: true,
    }));
  };

  #queuePublish(document: ReturnType<typeof cloneARTDocument>): void {
    const queuedRemoteEpoch = this.#remoteEpoch;
    this.#publishQueue = this.#publishQueue
      .then(async () => {
        if (this.session.capabilities.merge === 'snapshot' && queuedRemoteEpoch !== this.#remoteEpoch) {
          throw new CollaborationError(
            'revision-conflict',
            'Remote document changed before a queued local snapshot could be published',
          );
        }
        await this.#publishDocument(document);
      })
      .catch((error) => this.#emitError(error));
  }

  async #publishDocument(document: ReturnType<typeof cloneARTDocument>): Promise<CollaborationDocumentUpdate> {
    const options = this.session.capabilities.merge === 'snapshot'
      ? { ...(this.#revision !== undefined ? { baseRevision: this.#revision } : {}) }
      : undefined;
    const update = await this.session.publishDocument(document, options);
    this.#revision = update.revision;
    this.#rememberChange(`${update.origin.clientId}:${update.origin.changeId}`);
    return update;
  }

  async #publishPresence(): Promise<void> {
    if (!this.session.capabilities.presence || this.#destroyed) return;
    await this.session.updatePresence({
      selection: this.editor.getSelection(),
      ...(this.#presenceData !== undefined ? { data: this.#presenceData } : {}),
    });
  }

  #rememberChange(key: string): void {
    this.#seenChanges.add(key);
    if (this.#seenChanges.size <= 1024) return;
    const oldest = this.#seenChanges.values().next().value as string | undefined;
    if (oldest !== undefined) this.#seenChanges.delete(oldest);
  }

  #emitError(error: unknown): void {
    this.options.onError?.(error);
    this.editor.dispatchEvent(new CustomEvent<CollaborationEditorErrorDetail>('collaboration-error', {
      detail: { error },
      bubbles: true,
      composed: true,
    }));
  }

  #assertActive(): void {
    if (this.#destroyed) throw new Error('Collaboration editor controller is disconnected');
  }
}

export async function connectCollaboration(
  editor: ARichTextElement,
  provider: CollaborationProvider,
  options: CollaborationEditorOptions,
): Promise<CollaborationEditorController> {
  const localDocument = cloneARTDocument(editor.getJSON());
  const session = await provider.connect({
    documentId: options.documentId,
    clientId: options.clientId,
    initialDocument: localDocument,
    ...(options.presenceData !== undefined ? { initialPresence: { data: options.presenceData } } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const current = session.getDocument();
  const policy = options.initialDocumentPolicy ?? 'provider';
  if (current && serializeDocument(current.document) !== serializeDocument(localDocument)) {
    if (policy === 'provider') {
      editor.setJSON(cloneARTDocument(current.document));
    } else {
      await session.publishDocument(localDocument, session.capabilities.merge === 'snapshot'
        ? { ...(current.revision !== undefined ? { baseRevision: current.revision } : {}) }
        : undefined);
    }
  }

  const controller = new CollaborationEditorController(editor, session, options);
  if (session.capabilities.presence) {
    try {
      await session.updatePresence({
        selection: editor.getSelection(),
        ...(options.presenceData !== undefined ? { data: options.presenceData } : {}),
      });
    } catch (error) {
      options.onError?.(error);
      editor.dispatchEvent(new CustomEvent<CollaborationEditorErrorDetail>('collaboration-error', {
        detail: { error },
        bubbles: true,
        composed: true,
      }));
    }
  }

  return controller;
}
