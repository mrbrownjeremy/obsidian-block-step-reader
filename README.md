# Paragraph Step Reader

Read a long note one paragraph at a time in Obsidian's Reading view. Press ↓ and the next paragraph moves to the top of the pane, starting with its first line. Everything around it fades so your eye stays on the paragraph you're reading.

Made for reviewing long-form manuscripts. It never changes your notes unless you turn that on.

> A fork of [Block Step Reader](https://github.com/gorf/obsidian-block-step-reader) by gorf, which continues [Reading View Enhancer](https://github.com/Galacsh/obsidian-reading-view-enhancer) by Galacsh. MIT licensed. It uses its own plugin ID (`paragraph-step-reader`), so it can be installed alongside the original.

## What it does

- **Paragraph stepping.** ↓/J and ↑/K move between paragraphs and list items. Headings, tables, code and images are skipped. You can switch to *All blocks* to stop on everything, as the original plugin did.
- **Focused paragraph at the top.** The paragraph's first line lands a set distance (40 px by default) below the top of the pane. You can choose *Center* or *Nearest* instead.
- **Long paragraphs page through.** A paragraph taller than the screen starts at the top. ↓ then scrolls through it a screen at a time before moving on, so nothing is skipped.
- **Dimming.** Everything in the note except the focused paragraph fades to the opacity you pick, from 0% (hidden) to 100% (no dimming). Sidebars and the rest of Obsidian are never dimmed.
- **Highlight.** A soft background tint on the focused paragraph, which you can turn off.
- **Works with long notes.** Obsidian only renders the part of a note near the screen. Stepping past that point brings the next paragraph in, and the last paragraph can still reach the top of the pane.
- **Your notes stay untouched.** Your reading position is saved in the plugin's own data. Writing progress into note frontmatter is a separate setting, off by default.

## Keys

| Key | Action |
| --- | --- |
| ↓ or J | Next paragraph |
| ↑ or K | Previous paragraph |
| Esc | Clear focus (dimming goes away) |
| ← → H L | Fold or unfold the focused heading, list item or callout |

These keys work in Reading view. If nothing is focused yet, ↓ starts at the paragraph at the top of the screen. Clicking a paragraph focuses it without scrolling.

You can change the keys in the plugin settings. The commands **Focus next paragraph**, **Focus previous paragraph** and **Clear paragraph focus** can also be given any shortcut in Settings → Hotkeys.

## Settings

**Paragraph focus**
- *Step through*: Paragraphs (default) or All blocks.
- *Highlight focused paragraph*, plus its color and strength.
- *Dim surrounding content* (on) and *Surrounding content opacity* (25%).

**Scrolling**
- *Scroll to the focused paragraph* (on).
- *Position*: Top (default), Center or Nearest.
- *Top margin*: 0–200 px (40).
- *Smooth scrolling* (on). It is turned off automatically when macOS is set to reduce motion.

**Reading position**
- *Remember reading position* (on). Reopens each note on the paragraph you were reading. Stored in the plugin's `data.json`, not in your notes.

**Progress in notes**
- *Save progress to note frontmatter* (off). When on, progress and read status are written to each note's properties under `bsr`, as in the original plugin. The reading library, read tags and "mark as read" need it.

## Install

```bash
./install.sh
```

This builds the plugin and copies `main.js`, `manifest.json` and `styles.css` into the Manuscript vault's `.obsidian/plugins/paragraph-step-reader/`. It backs up any existing copy to `.obsidian/plugin-backups/` first. Pass a vault path to install somewhere else. Afterwards, turn the plugin off and on again in Settings → Community plugins.

Requires Obsidian 1.13 or later, because the settings page uses Obsidian's searchable settings.

## Known limitations

- Paragraph focus works in Reading view only. In Editing view, only the reading position is tracked.
- Indented text that Markdown treats as a code block is skipped in *Paragraphs* mode. Switch to *All blocks* to stop on it.
- "Toggle block highlight" wraps the paragraph in `==…==` in the note. That is the one command that edits your text, and it only runs when you call it.
- The Chinese translations cover only the strings from the original plugin. New settings are in English.

## Development

```bash
npm install
npm run build
```

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
