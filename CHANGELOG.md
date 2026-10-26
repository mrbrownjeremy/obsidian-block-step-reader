# Changelog

## 0.6.0 — 2026-10-26

First release of the Paragraph Step Reader fork.

### Added
- Paragraph stepping: ↓/J and ↑/K move between paragraphs and list items, skipping headings, tables, code and images. *All blocks* keeps the old behaviour.
- The focused paragraph scrolls to the top of the pane, starting from its first line, with an adjustable top margin (0–200 px, default 40). *Center* and *Nearest* are also available.
- Paragraphs taller than the screen are paged through a screen at a time before ↓ moves on.
- Dimming of everything in the note except the focused paragraph, with an opacity slider (default 25%). The rest of Obsidian is never dimmed.
- Extra space after the last paragraph so it can also reach the top of the pane.
- Commands for next paragraph, previous paragraph and clear focus, which can be given shortcuts in Settings → Hotkeys.
- With nothing focused (just after opening a note, or after Esc), ↓ starts at the paragraph at the top of the screen.
- `install.sh` builds the plugin and installs it into a vault, backing up the previous copy.

### Changed
- New plugin ID and name (`paragraph-step-reader`, "Paragraph Step Reader"), so it can sit alongside Block Step Reader.
- Progress is no longer written into notes by default. Reading positions are kept in the plugin's own data, and writing to frontmatter is a separate opt-in setting.
- The settings page uses Obsidian 1.13's searchable settings, with grouped sections. Settings take effect immediately, including key changes, which used to need a restart.
- Clicking a paragraph focuses it without scrolling the note.
- Moving focus to the sidebar or command palette no longer clears the focused paragraph.
- Smooth scrolling respects the system's reduce-motion setting. Holding a key down moves quickly instead of fighting the animation.
- Requires Obsidian 1.13 or later.

### Fixed
- Keyboard navigation did nothing in Obsidian 1.14: the key listener was only attached if the note was already on screen while Obsidian rendered it, and in 1.14 it isn't.
- Navigation stopped partway through long notes, at the edge of the part Obsidian had rendered.
- The settings page showed label-only rows with no controls in Obsidian 1.13+.
- Saved reading positions were recorded with a scroll ratio of 0 and could not be restored far into a long note.
- Positions saved only in plugin data were ignored when reopening a note.
- Disabling the plugin now removes all of its classes and listeners from open notes.

## Earlier versions (Block Step Reader by gorf)

- **0.5.15** (2026-09-13): Reading progress kept in memory; jump-to-top glitches ignored.
- **0.5.9** (2026-08-02): Reading progress tracked and restored in Editing view.
- **0.5.8** (2026-06-22): Per-user read tags for Improved Random Note.
- **0.5.7** (2026-06-22): Reading progress no longer jumps backward.
- **0.5.0–0.5.6** (2026-06-20): Reading library, per-user progress in frontmatter, English and Chinese interface.
- **0.3.0** (2026-06-12): Renamed to Block Step Reader.
- **0.2.2** (2026-06-11): Remembers reading position in Reading view.

## Reading View Enhancer by Galacsh

- **0.2.0** (2025-02-02): Toggle block highlighting; keys match both `key` and `code`.
- **0.1.8** (2024-11-18): Click or tap the selected block to fold or unfold it.
- **0.1.5** (2024-08-06): Custom key bindings.
- **0.1.0–0.1.4** (2023): Block selector with keyboard navigation, collapse indicator options, scrollable code blocks.
