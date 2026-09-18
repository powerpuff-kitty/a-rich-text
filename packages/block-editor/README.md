# @arichtext/block-editor

Optional keyboard-first block controls. `F2` opens move, duplicate and delete
commands; commands use canonical engine transactions and preserve editor history.
The controller is opt-in and does not alter ART documents until an action runs.

When the caret is at the start of an empty paragraph, `/` opens a small menu for
Paragraph and Heading 1. Arrow keys or a click apply the choice in one transaction;
Escape inserts the literal slash and restores focus. The controller remains opt-in
and only offers actions configured by the host integration.
