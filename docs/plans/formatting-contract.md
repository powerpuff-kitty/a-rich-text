# Additional formatting contract (#75)

This increment adds two schema-safe semantic marks: `subscript` and `superscript`.
They are ordinary text marks, so selection, undo/redo, HTML import/export and ART
validation use the existing mark transaction path. HTML uses `<sub>` and `<sup>`;
plain text and Markdown degrade to the visible text. The marks have no attributes,
which keeps their meaning stable across adapters and avoids accepting arbitrary CSS.

Color, background, font family/size, alignment/direction, formulas, video/embeds
and full grammar highlighting remain separate follow-ups in #75. Their value
vocabularies and provider/sanitization boundaries must be accepted before adding
schema variants. No hosted service or mandatory runtime dependency is introduced.

The next increment adds `color` and `background` marks. Values are limited to
hex colors and bounded rgb/rgba/hsl/hsla functional forms. HTML emits inline
styles only from validated ART values and imports the same constrained subset;
unsafe CSS is ignored. Markdown and plain text retain content while dropping
these visual marks.
