# 渐读（Block Step Reader）

> 中文文档 · [English README](README.md)

**渐读**是 Obsidian 的一款阅读增强插件，让你像 Readwise Reader 一样，一段一段地读长文，而不是对着满屏文字发呆。

Fork 自 [Galacsh/obsidian-reading-view-enhancer](https://github.com/Galacsh/obsidian-reading-view-enhancer)（上游已不可用）。段落导航功能原作者 Galacsh（MIT），阅读进度、阅读库等后续维护由 [gorf](https://github.com/gorf) 完成。

---

## 它能帮你做什么？

| 功能 | 说明 |
|------|------|
| 逐段阅读 | 用 `J` / `K` 或方向键，一次只聚焦一个段落（block） |
| 高亮当前段 | 当前段落自动高亮，读到哪里一目了然 |
| 自动居中 | 切换段落时，当前段滚到屏幕中央（可关） |
| 阅读进度条 | 在阅读模式和编辑模式里显示百分比、剩余时间、已读/未读字数 |
| 阅读库 | 侧边栏管理待读、在读、未读、已读笔记 |
| 已读/未读标记 | 命令或读至文末自动标记 |
| 记住阅读位置 | 进度存在笔记 frontmatter，阅读/编辑模式打开都会续读 |
| 多人共用库 | 每人设一个 User ID，同一条笔记各自独立进度 |
| 多语言界面 | 简体中文、繁体中文、English |

---

## 快速上手

1. 安装插件（见下方「安装方式」）
2. 打开 Obsidian → **设置 → 社区插件**，启用 **渐读**（或 Block Step Reader）
3. 打开任意笔记，切换到**阅读模式**或**编辑模式**
4. 进入插件设置，打开 **Enable Block Selector（启用段落选择器）**
5. 若库是多人共用的，在设置里填写你的 **User ID**
6. 点击左侧功能区 **图书馆** 图标，或运行命令 **打开阅读库**
7. 用 `J` / `↓` 下一段，`K` / `↑` 上一段，开始「渐读」

---

## 阅读库

类似 Readwise Reader 的文库，侧边栏支持筛选与排序：

| 筛选 | 含义 |
|------|------|
| 待读 | 未完成且未标记已读的笔记 |
| 在读 | 有进度、尚未读完 |
| 未读 | 尚未开始，或明确标记为未读 |
| 已读 | 已标记读完 |

排序方式：最近更新、进度（升序/降序）、标题、完成日期、剩余时间。

点击条目可在阅读模式中打开；顶部搜索框可按标题或路径过滤。

**阅读体验**相关设置：

- **Include all vault notes（包含库内全部笔记）** — 列出所有 Markdown 为未读，或仅显示有进度的笔记
- **Library default filter / sort（阅读库默认筛选/排序）**

---

## 共用库与 frontmatter

阅读进度和已读状态写在每条笔记的 frontmatter 里，键名为 `bsr.<userId>`：

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

在插件设置里填写 **User ID**，同一篇笔记里每个人都能保留自己的进度。

---

## 语言设置

在 **Reading experience（阅读体验）** 里选择 **Language（语言）**：

- **Auto** — 跟随 Obsidian 系统语言
- **English** — 插件名显示 Block Step Reader
- **简体中文** — 插件名显示「渐读」
- **繁體中文** — 插件名显示「漸讀」

---

## 默认快捷键

| 按键 | 作用 |
|------|------|
| `↓` / `J` | 下一段（开启自动居中时会滚到屏幕中央） |
| `↑` / `K` | 上一段 |
| `←` / `→` / `H` / `L` | 折叠/展开当前段 |
| `Escape` | 取消选中 |

可在插件设置的 **Keys** 里自定义。

---

## 安装方式

### 社区插件（审核通过后）

Obsidian → **设置 → 社区插件**，搜索 **Block Step Reader** 或 **渐读**。

> 若暂时搜不到，可用下方 BRAT 或手动安装；审核通过后会在应用内直接搜索到。

### BRAT（推荐：审核期间）

1. 安装 **Obsidian42-BRAT**
2. 添加 Beta 插件：`https://github.com/gorf/obsidian-block-step-reader`

### 手动安装 / 本地构建

```powershell
git clone https://github.com/gorf/obsidian-block-step-reader.git
cd obsidian-block-step-reader
npm install
npm run build
```

将 `main.js`、`manifest.json`、`styles.css` 复制到库目录：

`.obsidian/plugins/block-step-reader/`

或使用脚本：

```powershell
.\install-to-vault.ps1 -VaultPath "D:\你的库路径"
```

---

## 支持作者

如果这个插件对你的阅读流程有帮助，欢迎 [在 Ko-fi 请我喝杯咖啡](https://ko-fi.com/bigmonk)。

插件设置里的 **Support** 区块，以及 Obsidian 插件目录中的 `fundingUrl`，也指向同一链接。

---

## 开发与发布

```powershell
npm run build
.\install-to-vault.ps1
.\publish-github.ps1
```

上架社区插件的完整清单见 [PUBLISHING.md](PUBLISHING.md)。

---

## 许可证

MIT。原作者 Galacsh；维护 Fork 作者 gorf。
