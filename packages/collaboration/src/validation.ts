import {
  isARTDocument,
  isARTJSONValue,
  parseDocument,
  serializeDocument,
  type ARTDocument,
  type ARTJSONObject,
} from '@arichtext/core';
import { createEditorState, type ARTSelection } from '@arichtext/engine';
import {
  CollaborationError,
  type CollaborationDocumentUpdate,
  type CollaborationPresence,
  type UpdatePresenceOptions,
} from './types.js';

export function assertIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) {
    throw new CollaborationError('invalid-config', `${label} must be a non-empty string up to 256 characters`);
  }
}

export function cloneARTDocument(document: ARTDocument): ARTDocument {
  if (!isARTDocument(document)) {
    throw new CollaborationError('invalid-document', 'Collaboration document is not valid ART');
  }
  return parseDocument(serializeDocument(document));
}

export function cloneSelection(document: ARTDocument, selection: ARTSelection | null | undefined): ARTSelection | null | undefined {
  if (selection === undefined) return undefined;
  if (selection === null) return null;
  try {
    return createEditorState(document, selection).selection;
  } catch (error) {
    throw new CollaborationError('invalid-presence', 'Presence selection is not valid for the current ART document', error);
  }
}

export function clonePresenceData(data: ARTJSONObject | null | undefined): ARTJSONObject | undefined {
  if (data === undefined || data === null) return undefined;
  if (!isARTJSONValue(data) || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CollaborationError('invalid-presence', 'Presence data must be a JSON-safe object');
  }
  return JSON.parse(JSON.stringify(data)) as ARTJSONObject;
}

export function createPresence(
  clientId: string,
  document: ARTDocument | null,
  update: UpdatePresenceOptions,
  timestamp = Date.now(),
): CollaborationPresence {
  let selection: ARTSelection | null | undefined;
  if (update.selection !== undefined) {
    if (!document && update.selection !== null) {
      throw new CollaborationError('invalid-presence', 'Cannot publish a selection before the provider has a document');
    }
    selection = document ? cloneSelection(document, update.selection) : update.selection;
  }
  const data = clonePresenceData(update.data);
  return {
    clientId,
    ...(selection !== undefined ? { selection } : {}),
    ...(data !== undefined ? { data } : {}),
    timestamp,
  };
}

export function clonePresence(presence: CollaborationPresence): CollaborationPresence {
  return {
    clientId: presence.clientId,
    ...(presence.selection !== undefined
      ? { selection: presence.selection === null ? null : {
          anchor: {
            blockPath: [...presence.selection.anchor.blockPath],
            offset: presence.selection.anchor.offset,
          },
          head: {
            blockPath: [...presence.selection.head.blockPath],
            offset: presence.selection.head.offset,
          },
        } }
      : {}),
    ...(presence.data !== undefined ? { data: clonePresenceData(presence.data) } : {}),
    timestamp: presence.timestamp,
  };
}

export function cloneDocumentUpdate(update: CollaborationDocumentUpdate): CollaborationDocumentUpdate {
  return {
    document: cloneARTDocument(update.document),
    origin: { ...update.origin },
    ...(update.revision !== undefined ? { revision: update.revision } : {}),
    timestamp: update.timestamp,
  };
}
