interface GraphemeSegment {
  index: number;
  segment: string;
}

interface GraphemeSegmenter {
  segment(input: string): Iterable<GraphemeSegment>;
}

interface GraphemeSegmenterConstructor {
  new (locales?: string | string[], options?: { granularity: 'grapheme' }): GraphemeSegmenter;
}

export function graphemeBoundaries(text: string): number[] {
  const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenterConstructor }).Segmenter;
  if (Segmenter) {
    const boundaries = [0];
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
    for (const item of segmenter.segment(text)) {
      const end = item.index + item.segment.length;
      if (end > boundaries[boundaries.length - 1]!) boundaries.push(end);
    }
    if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);
    return boundaries;
  }

  const boundaries = [0];
  let offset = 0;
  for (const codePoint of Array.from(text)) {
    offset += codePoint.length;
    boundaries.push(offset);
  }
  return boundaries;
}

export function previousGraphemeBoundary(text: string, offset: number): number {
  assertOffset(text, offset);
  const boundaries = graphemeBoundaries(text);
  let previous = 0;
  for (const boundary of boundaries) {
    if (boundary >= offset) break;
    previous = boundary;
  }
  return previous;
}

export function nextGraphemeBoundary(text: string, offset: number): number {
  assertOffset(text, offset);
  for (const boundary of graphemeBoundaries(text)) {
    if (boundary > offset) return boundary;
  }
  return text.length;
}

function assertOffset(text: string, offset: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError(`Grapheme offset ${offset} is outside the text`);
  }
}
