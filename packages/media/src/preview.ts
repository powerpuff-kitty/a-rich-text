import type { ObjectURLPreview, ObjectURLRuntime } from './types.js';

export function createObjectURLPreview(
  blob: Blob,
  runtime: ObjectURLRuntime = defaultObjectURLRuntime(),
): ObjectURLPreview {
  const url = runtime.createObjectURL(blob);
  let revoked = false;

  return {
    get url() {
      return url;
    },
    get revoked() {
      return revoked;
    },
    revoke(): void {
      if (revoked) return;
      revoked = true;
      runtime.revokeObjectURL(url);
    },
  };
}

function defaultObjectURLRuntime(): ObjectURLRuntime {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
    throw new Error('Object URL previews require browser URL.createObjectURL/revokeObjectURL');
  }
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}
