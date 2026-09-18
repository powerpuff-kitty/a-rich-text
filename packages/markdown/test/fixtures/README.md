# CommonMark fixtures

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
code spans 344; indented code 109; setext headings 93/94/99; escapes 21–23;
emphasis 475–477; hard breaks 642/643; autolink scheme policy 596/598/599/601).
