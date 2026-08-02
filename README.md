# Block Step Reader（渐读）

中文名：**渐读** · 英文名：Block Step Reader · [中文说明](README.zh-CN.md)

> Fork and continuation of [Galacsh/obsidian-reading-view-enhancer](https://github.com/Galacsh/obsidian-reading-view-enhancer) (upstream unavailable). Original block navigation by Galacsh (MIT). Additional maintenance and reading-position features by [gorf](https://github.com/gorf).

Block Step Reader improves reading in Obsidian, with a focus on Reader-like step reading:

- Keyboard block navigation (`J` / `K` or arrow keys)
- Highlight the current block
- Auto-center the current block when moving with the keyboard
- Reading progress bar and remaining-time estimate in **reading view and editing view**
- **Reading library** sidebar with filters and sorting
- Mark notes as read / unread
- Remember and restore reading position **per user in note frontmatter** (shared-vault friendly; works in reading and editing views)
- **Multi-language UI**: English, 简体中文, 繁體中文

## Quick start

1. Install `main.js` and `manifest.json` into `.obsidian/plugins/block-step-reader/`
2. Enable **Block Step Reader** in community plugins
3. Open a note in **reading view** or **editing view**
4. Turn on **Enable Block Selector** in plugin settings
5. Set your **User ID** if the vault is shared with others
6. Click the **library** ribbon icon or run **Open reading library**
7. Use `J` / `↓` for next block, `K` / `↑` for previous block

## Reading library

Like Readwise Reader's library, the sidebar view supports:

| Filter | Shows |
|--------|--------|
| To read / 待读 | Unfinished notes only (excludes marked-as-read) |
| Reading / 在读 | Started but not finished |
| Unread / 未读 | Not started or explicitly unread |
| Read / 已读 | Marked as read |

Sort by:

- Recently updated
- Progress (low → high / high → low)
- Title
- Date finished
- Time remaining

Click a note to open it in reading view. Use the search box to filter by title or path.

Settings under **Reading experience**:

- **Include all vault notes** — list every markdown file as unread, or only notes with saved progress
- **Library default filter / sort**

## Shared vaults & frontmatter

Reading progress and read status are stored in each note's frontmatter under `bsr.<userId>`:

```yaml
---
bsr:
  alice:
    progress: 0.42
    lineStart: 15
    scrollRatio: 0.35
    read: false
    finished: null
    totalWords: 3200
    wordsRead: 1344
    updatedAt: 1718880000000
  bob:
    progress: 1
    read: true
    finished: "2026-06-20"
---
```

Set **User ID** in plugin settings so each person keeps their own progress in the same note.

## Language

Set **Language** under **Reading experience**:

- **Auto** — follows Obsidian's language
- **English** — plugin name: Block Step Reader
- **简体中文** — plugin name: 渐读
- **繁體中文** — plugin name: 漸讀

## Support

If this plugin helps your reading workflow, consider [buying me a coffee on Ko-fi](https://ko-fi.com/bigmonk).

The same link appears in plugin settings under **Support**, and in Obsidian's plugin directory via `fundingUrl`.

## Publish to the community plugin marketplace

See [PUBLISHING.md](PUBLISHING.md) for the full checklist and submission steps.

## Install

### Community plugins (after approval)

Search for **Block Step Reader** in Obsidian → Settings → Community plugins.

### BRAT

1. Install **Obsidian42-BRAT**
2. Add beta plugin: `https://github.com/gorf/obsidian-block-step-reader`

### Manual / local build

```powershell
git clone https://github.com/gorf/obsidian-block-step-reader.git
cd obsidian-block-step-reader
npm install
npm run build
```

Copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/block-step-reader/`.

Or run:

```powershell
.\install-to-vault.ps1 -VaultPath "D:\path\to\your\vault"
```

## Keyboard defaults

| Key | Action |
|-----|--------|
| `↓` / `J` | Next block (auto-centers when enabled) |
| `↑` / `K` | Previous block (auto-centers when enabled) |
| `←` / `→` / `H` / `L` | Toggle collapse |
| `Escape` | Deselect block |

## Development

```powershell
npm run build
.\install-to-vault.ps1
.\publish-github.ps1
```

## License

MIT. Original work by Galacsh; maintenance fork by gorf.
