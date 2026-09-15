import type { ARTTextPoint } from '@arichtext/engine';

export type AnchorAffinity = 'before' | 'after';

export interface AnchoredTextPoint extends ARTTextPoint {
  /** Determines which side wins for insertions exactly at this point. */
  affinity: AnchorAffinity;
}

export interface AnchoredTextQuote {
  /** Original selected text at anchor creation time. */
  text: string;
  /** Same-block text before the range start, bounded by the creator. */
  prefix?: string;
  /** Same-block text after the range end, bounded by the creator. */
  suffix?: string;
}

export interface AnchoredTextRange {
  /** Normalized document-order start point. */
  start: AnchoredTextPoint;
  /** Normalized document-order end point. */
  end: AnchoredTextPoint;
  /** Optional immutable creation-time quote for diagnostics/recovery UX. */
  quote?: AnchoredTextQuote;
}

export interface CreateAnchoredRangeOptions {
  /** Defaults to `after`, keeping inserted text immediately before a comment out of its range. */
  startAffinity?: AnchorAffinity;
  /** Defaults to `before`, keeping inserted text immediately after a comment out of its range. */
  endAffinity?: AnchorAffinity;
  captureQuote?: boolean;
  quoteContextChars?: number;
}

export type AnchoredRangeMappingStatus = 'mapped' | 'collapsed' | 'orphaned';

export type AnchoredRangeMappingResult =
  | {
      status: 'mapped' | 'collapsed';
      range: AnchoredTextRange;
      reason?: string;
    }
  | {
      status: 'orphaned';
      range: null;
      reason: string;
    };
