import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { t, formatRemainingTime } from "src/i18n";
import ReadingViewEnhancer from "src/main";
import { READING_LIBRARY_VIEW_TYPE } from "src/constants";
import { queryLibrary } from "./service";
import { setProgressWidth } from "src/styles";
import { findMarkdownLeafForLibraryOpen, waitMs } from "src/utils";
import type { LibraryFilter, LibraryQuery, LibrarySort } from "./types";

export default class ReadingLibraryView extends ItemView {
	private plugin: ReadingViewEnhancer;
	private query: LibraryQuery;
	private listEl: HTMLElement | null = null;
	private filterContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ReadingViewEnhancer) {
		super(leaf);
		this.plugin = plugin;
		this.query = {
			filter: plugin.settings.libraryDefaultFilter,
			sort: plugin.settings.libraryDefaultSort,
			search: "",
			includeAllNotes: plugin.settings.libraryIncludeAllNotes,
		};
	}

	getViewType(): string {
		return READING_LIBRARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t(this.plugin, "library.title");
	}

	getIcon(): string {
		return "library";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("bsr-library-view");

		this.renderToolbar(this.contentEl);
		this.listEl = this.contentEl.createDiv({ cls: "bsr-library-list" });
		this.render();

		this.registerEvent(
			this.plugin.app.metadataCache.on("changed", () => this.render()),
		);
		this.registerEvent(
			this.plugin.app.vault.on("create", () => this.render()),
		);
		this.registerEvent(
			this.plugin.app.vault.on("delete", () => this.render()),
		);
		this.registerEvent(
			this.plugin.app.vault.on("rename", () => this.render()),
		);
	}

	async onClose(): Promise<void> {
		this.listEl = null;
		this.filterContainer = null;
	}

	refresh(): void {
		this.render();
	}

	setFilter(filter: LibraryFilter): void {
		this.query.filter = filter;
		this.updateFilterButtons();
		this.render();
	}

	setSort(sort: LibrarySort): void {
		this.query.sort = sort;
		this.render();
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "bsr-library-toolbar" });

		this.filterContainer = toolbar.createDiv({ cls: "bsr-library-filters" });
		this.renderFilterButtons();

		const controls = toolbar.createDiv({ cls: "bsr-library-controls" });

		const sortSelect = controls.createEl("select", { cls: "dropdown" });
		const sortOptions: LibrarySort[] = [
			"updated",
			"progress-desc",
			"progress-asc",
			"title",
			"finished",
			"remaining",
		];
		for (const sort of sortOptions) {
			sortSelect.createEl("option", {
				value: sort,
				text: this.sortLabel(sort),
			});
		}
		sortSelect.value = this.query.sort;
		sortSelect.addEventListener("change", () => {
			this.setSort(sortSelect.value as LibrarySort);
		});

		const searchInput = controls.createEl("input", {
			cls: "bsr-library-search",
			type: "search",
			placeholder: t(this.plugin, "library.searchPlaceholder"),
		});
		searchInput.addEventListener("input", () => {
			this.query.search = searchInput.value;
			this.render();
		});

		const refreshBtn = controls.createEl("button", {
			cls: "clickable-icon",
			text: t(this.plugin, "common.refresh"),
		});
		refreshBtn.addEventListener("click", () => this.render());
	}

	private renderFilterButtons(): void {
		if (!this.filterContainer) return;
		this.filterContainer.empty();

		const filters: LibraryFilter[] = ["all", "reading", "unread", "read"];
		for (const filter of filters) {
			const btn = this.filterContainer.createEl("button", {
				cls: "bsr-library-filter",
				text: this.filterLabel(filter),
			});
			if (filter === this.query.filter) btn.addClass("is-active");
			btn.addEventListener("click", () => this.setFilter(filter));
		}
	}

	private updateFilterButtons(): void {
		if (!this.filterContainer) return;
		const buttons = this.filterContainer.querySelectorAll(".bsr-library-filter");
		buttons.forEach((btn, index) => {
			const filters: LibraryFilter[] = ["all", "reading", "unread", "read"];
			btn.toggleClass("is-active", filters[index] === this.query.filter);
		});
	}

	private render(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		this.query.includeAllNotes = this.plugin.settings.libraryIncludeAllNotes;
		const entries = queryLibrary(this.plugin, this.query);

		if (entries.length === 0) {
			this.listEl.createDiv({
				cls: "bsr-library-empty",
				text: t(this.plugin, "library.empty"),
			});
			return;
		}

		for (const entry of entries) {
			const item = this.listEl.createDiv({ cls: "bsr-library-item" });

			const main = item.createDiv({ cls: "bsr-library-item-main" });
			main.createDiv({
				cls: "bsr-library-item-title",
				text: entry.title,
			});
			main.createDiv({
				cls: "bsr-library-item-path",
				text: entry.filePath,
			});

			const meta = item.createDiv({ cls: "bsr-library-item-meta" });
			meta.createDiv({
				cls: "bsr-library-item-progress-text",
				text: `${Math.round(entry.progress * 100)}%`,
			});

			const track = meta.createDiv({ cls: "bsr-library-item-track" });
			const fill = track.createDiv({ cls: "bsr-library-item-fill" });
			setProgressWidth(fill, entry.progress);

			const subtitle = item.createDiv({ cls: "bsr-library-item-subtitle" });
			subtitle.setText(this.entrySubtitle(entry));

			item.addEventListener("click", (event) => {
				event.preventDefault();
				void this.openEntry(entry.filePath);
			});
		}
	}

	private entrySubtitle(entry: ReturnType<typeof queryLibrary>[number]): string {
		if (entry.read) {
			if (entry.finished) {
				return `${t(this.plugin, "common.read")} · ${t(this.plugin, "library.item.finishedOn", { date: entry.finished })}`;
			}
			return t(this.plugin, "common.read");
		}

		if (entry.progress <= 0 && !entry.hasActivity) {
			return t(this.plugin, "library.item.noActivity");
		}

		return `${t(this.plugin, "common.unread")} · ${formatRemainingTime(this.plugin, entry.remainingMinutes)}`;
	}

	private async openEntry(filePath: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		const { workspace } = this.plugin.app;
		const targetLeaf = findMarkdownLeafForLibraryOpen(this.plugin);

		await targetLeaf.openFile(file, { active: true });
		workspace.setActiveLeaf(targetLeaf, { focus: true });

		const view = targetLeaf.view;
		if (view instanceof MarkdownView && view.getState().mode !== "preview") {
			await view.setState(
				{ ...view.getState(), mode: "preview" },
				{ history: false },
			);
		}

		await waitMs(50);
		this.plugin.blockSelector.requestRestoreForFile(file.path);
	}

	private filterLabel(filter: LibraryFilter): string {
		const map: Record<LibraryFilter, "library.filter.all" | "library.filter.reading" | "library.filter.unread" | "library.filter.read"> = {
			all: "library.filter.all",
			reading: "library.filter.reading",
			unread: "library.filter.unread",
			read: "library.filter.read",
		};
		return t(this.plugin, map[filter]);
	}

	private sortLabel(sort: LibrarySort): string {
		const map: Record<LibrarySort, TranslationSortKey> = {
			updated: "library.sort.updated",
			"progress-asc": "library.sort.progressAsc",
			"progress-desc": "library.sort.progressDesc",
			title: "library.sort.title",
			finished: "library.sort.finished",
			remaining: "library.sort.remaining",
		};
		return t(this.plugin, map[sort]);
	}
}

type TranslationSortKey =
	| "library.sort.updated"
	| "library.sort.progressAsc"
	| "library.sort.progressDesc"
	| "library.sort.title"
	| "library.sort.finished"
	| "library.sort.remaining";
