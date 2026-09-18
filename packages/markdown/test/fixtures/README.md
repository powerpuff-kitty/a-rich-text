# CommonMark fixtures

`commonmark-0.31.2-blockquotes.json` contains all 25 unmodified “Block quotes”
examples (228–252), downloaded from https://spec.commonmark.org/0.31.2/spec.json
on 2026-09-18. Twenty-four match under documented normalization; tight-list rendering (235)
remains an explicit mismatch. Lazy quote continuation and setext example 93 now match.

`commonmark-0.31.2-paragraphs.json` contains all 12 unmodified examples from
“Paragraphs”, “Blank lines” and “Textual content”, downloaded from
https://spec.commonmark.org/0.31.2/spec.json on 2026-09-18. All match under the
runner’s documented HTML/soft-break/code-line normalization.

`commonmark-0.31.2-thematic-breaks.json` contains all 19 unmodified examples from
the “Thematic breaks” section of CommonMark 0.31.2, downloaded from
https://spec.commonmark.org/0.31.2/spec.json on 2026-09-18.

`commonmark-0.31.2-autolinks.json` contains all 19 unmodified “Autolinks” examples
from the same source on 2026-09-18. Four scheme-policy exceptions remain explicit.

`commonmark-0.31.2-emphasis.json` contains all 132 unmodified “Emphasis and strong
emphasis” examples from the same source on 2026-09-18. Tests compare canonical
ART semantics, with three raw-HTML exceptions (475–477).

`commonmark-0.31.2-code-spans.json` contains all 22 unmodified examples from the
“Code spans” section of CommonMark 0.31.2, downloaded from
https://spec.commonmark.org/0.31.2/spec.json on 2026-09-16.

`commonmark-0.31.2-atx-headings.json` contains all 18 unmodified examples from
the “ATX headings” section, downloaded from the same source on the same date.

`commonmark-0.31.2-indented-code.json` contains all 12 unmodified examples from
the “Indented code blocks” section from the same source and date.

`commonmark-0.31.2-setext-headings.json` contains all 27 unmodified examples from
the “Setext headings” section from the same source and date.

`commonmark-0.31.2-fenced-code.json` contains all 29 unmodified examples from
the “Fenced code blocks” section from the same source and date.

`commonmark-0.31.2-backslash-escapes.json` contains all 13 unmodified “Backslash
escapes” examples; `commonmark-0.31.2-line-breaks.json` contains all 15 “Hard line
breaks” and two “Soft line breaks” examples, from the same source and date.

CommonMark Spec by John MacFarlane is licensed under Creative Commons
Attribution-ShareAlike 4.0 International:
https://creativecommons.org/licenses/by-sa/4.0/ . These upstream fixtures retain
that license; the repository MIT license does not replace it. No example text
or expected HTML was altered. The test runner documents its soft-break and equivalent HTML quote-escaping
normalization and explicitly unsupported interactions (thematic breaks 57/60/61;
code spans 344; indented code 109; setext headings 94/99; escapes 21–23;
emphasis 475–477; hard breaks 642/643; autolink scheme policy 596/598/599/601).

`commonmark-0.31.2-list-markers.json` contains thirteen unchanged examples selected
from the CommonMark 0.31.2 List items/Lists sections: 265–269, 281–285 and 303–305.
Source: the spec.json link above, downloaded on 2026-09-18; the CC BY-SA 4.0 license
above applies. These cover marker width, leading zeros/negative markers, empty
items and paragraph interruption, not the full sections. The runner compares ART
semantics through HTML import (tightness is not stored; soft breaks fold). Twelve
examples match that mapping; example 267 explicitly records zero-start lists
normalizing to one under ART's positive-start constraint.

`commonmark-0.31.2-list-grouping.json` contains three unchanged examples (301,
302, 306) from the same CommonMark source, date and license. These cover changed
bullet/ordered markers and blank lines between matching markers. All three match
retained ART semantics through HTML import; tight/loose paragraph wrappers are
not stored. This is a selected subset, not full Lists coverage.

## GFM table fixtures

`gfm-0.29-tables.json` contains the eight unmodified Markdown/HTML examples
198–205 from the published [GFM table section](https://github.github.com/gfm/#tables-extension-).
They were extracted from [GitHub’s specification source](https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt)
on 2026-09-18. The source identifies version 0.29 (2019-04-06) and retains
the CC BY-SA 4.0 license linked above. The tests compare retained ART semantics
through HTML import: header roles, column alignment and table section wrappers
are not represented in ART; paragraph soft breaks fold to spaces.
