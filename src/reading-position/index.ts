import { Notice, TFile } from "obsidian";
import { t } from "src/i18n";
import ReadingViewEnhancer from "src/main";
import SelectionHandler from "src/block-selector/selection-handler";
import { BLOCK_ATTR } from "src/constants";
import {
	buildPositionPatch,
	buildReadingStats,
	getFileReadingUnitsAsync,
	markAsRead,
	markAsUnread,
	readUserStateFromCache,
	writeUserState,
	type ReadingStats,
	type UserReadingState,
} from "src/reading-state";
import ReadingProgressBar from "src/reading-ui/progress-bar";
import {
	applyPreviewScroll,
	applySourceScroll,
	findMarkdownViewForFile,
	findReadingViewForFile,
	getActiveView,
	getReadingViewContainer,
	getScrollContainer,
	getSourceViewScroller,
	isReadingView,
	resolvePreviewScrollTop,
	resolveSourceScrollTop,
	waitMs,
} from "src/utils";
import type { MarkdownView } from "obsidian";
import type { ReadingPosition, ReadingPositionStore } from "./types";

export default class ReadingPositionManager {
	private plugin: ReadingViewEnhancer;
	private saveTimer: number | null = null;
	private saveGeneration = 0;
	private suppressSaveUntil = 0;
	private scrollListener: ((event: Event) => void) | null = null;
	private boundContainer: HTMLElement | null = null;
	private progressBar: ReadingProgressBar;
	private statsCache = new Map<string, ReadingStats>();
	private totalWordsCache = new Map<string, number>();
	private restoring = false;
	private sessionFilePath: string | null = null;
	private pendingRestorePath: string | null = null;
	private restoreTimer: number | null = null;
	private restoreInFlight = false;
	private restoreAttempts = 0;
	private lastNudgeAt = 0;
	private suppressDeselectUntil = 0;
	/** Avoid re-restoring the same file+mode on noisy layout-change events. */
	private lastRestoredModeKey: string | null = null;
	private static readonly MAX_RESTORE_ATTEMPTS = 8;

	constructor(plugin: ReadingViewEnhancer) {
		this.plugin = plugin;
		this.progressBar = new ReadingProgressBar(plugin);
	}

	activate() {
		this.progressBar.activate();

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.attachScrollListener();
				this.refreshProgressForActiveFile();
				this.maybeRestoreAfterModeChange();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.attachScrollListener();
				this.refreshProgressForActiveFile();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on("changed", (file) => {
				this.refreshProgressForFile(file);
			}),
		);
	}

	onBlockSelected(
		block: HTMLElement,
		container: HTMLElement,
		options?: { center?: boolean },
	) {
		if (options?.center && this.plugin.settings.autoCenterBlock) {
			scrollBlockToCenter(block);
		}

		const view = getActiveView(this.plugin);
		if (view?.file) {
			this.sessionFilePath = view.file.path;
		}

		if (!this.plugin.settings.rememberReadingPosition) {
			this.updateProgressUi(block, container);
			return;
		}

		if (this.shouldSuppressSave()) {
			this.updateProgressUi(block, container);
			return;
		}

		this.queueSave(container, block);
		this.updateProgressUi(block, container);
		void this.maybeAutoMarkRead(block, container);
	}

	resetReadingSession(): void {
		this.sessionFilePath = null;
		this.lastRestoredModeKey = null;
		this.cancelPendingSave();
	}

	/** Quiet restore: one delayed attempt, few quiet retries. No polling loop. */
	scheduleRestore(filePath: string): void {
		if (!this.plugin.settings.rememberReadingPosition) return;
		if (!this.hasSavedPosition(filePath)) return;

		this.pendingRestorePath = filePath;
		this.restoreAttempts = 0;

		if (this.restoreTimer) {
			window.clearTimeout(this.restoreTimer);
			this.restoreTimer = null;
		}

		const delay = Math.max(
			200,
			this.plugin.settings.readingPositionRestoreDelayMs,
		);

		this.restoreTimer = window.setTimeout(() => {
			this.restoreTimer = null;
			void this.runRestore(filePath);
		}, delay);
	}

	/** Called when markdown blocks finish rendering; at most once per ~300ms. */
	nudgeRestoreIfPending(filePath: string): void {
		if (!this.isRestorePendingForPath(filePath)) return;
		if (this.restoreInFlight) return;

		const now = Date.now();
		if (now - this.lastNudgeAt < 300) return;
		this.lastNudgeAt = now;

		if (this.restoreTimer) {
			window.clearTimeout(this.restoreTimer);
			this.restoreTimer = null;
		}

		this.restoreTimer = window.setTimeout(() => {
			this.restoreTimer = null;
			void this.runRestore(filePath);
		}, 80);
	}

	shouldSuppressDeselect(): boolean {
		return this.restoring || Date.now() < this.suppressDeselectUntil;
	}

	clearRestorePending(): void {
		this.pendingRestorePath = null;
		this.restoreAttempts = 0;
		if (this.restoreTimer) {
			window.clearTimeout(this.restoreTimer);
			this.restoreTimer = null;
		}
	}

	getPendingRestorePath(): string | null {
		return this.pendingRestorePath;
	}

	isRestorePendingForPath(filePath: string): boolean {
		return this.pendingRestorePath === filePath;
	}

	isRestorePending(file: TFile): boolean {
		return this.pendingRestorePath === file.path;
	}

	hasActiveReadingSelection(): boolean {
		const view = getActiveView(this.plugin);
		if (!view?.file || !isReadingView(view)) return false;

		const container = getReadingViewContainer(view);
		const block = this.plugin.blockSelector.selectionHandler.selectedBlock;
		if (!block || !container) return false;

		return container.contains(block);
	}

	private async runRestore(filePath: string): Promise<void> {
		if (!this.isRestorePendingForPath(filePath)) return;
		if (this.restoreInFlight) return;

		this.restoreInFlight = true;
		try {
			const restored = await this.tryRestoreAsync(
				undefined,
				this.plugin.blockSelector.selectionHandler,
				filePath,
			);

			if (restored) return;

			this.restoreAttempts++;
			if (
				this.restoreAttempts < ReadingPositionManager.MAX_RESTORE_ATTEMPTS &&
				this.isRestorePendingForPath(filePath)
			) {
				this.restoreTimer = window.setTimeout(() => {
					this.restoreTimer = null;
					void this.runRestore(filePath);
				}, 250);
				return;
			}

			this.clearRestorePending();

			if (this.plugin.settings.autoSelectTopBlock) {
				const view = findReadingViewForFile(this.plugin, filePath);
				const container = getReadingViewContainer(view);
				if (container) {
					this.plugin.blockSelector.selectTopBlockInTheView(container);
				}
			}
		} finally {
			this.restoreInFlight = false;
		}
	}

	async tryRestoreAsync(
		_container: HTMLElement | undefined,
		selectionHandler: SelectionHandler,
		filePath?: string,
	): Promise<boolean> {
		if (!this.plugin.settings.rememberReadingPosition) return false;

		const view = this.resolveMarkdownView(filePath);
		const file = this.resolveReadingFile(filePath, view);
		if (!file || !view) return false;

		const state = this.resolveReadingState(file);
		if (!state || !this.hasRestorablePosition(state)) return false;

		if (isReadingView(view)) {
			return this.tryRestoreReadingView(view, file, state, selectionHandler);
		}

		return this.tryRestoreEditingView(view, file, state);
	}

	private async tryRestoreReadingView(
		view: MarkdownView,
		file: TFile,
		state: UserReadingState,
		selectionHandler: SelectionHandler,
	): Promise<boolean> {
		const container = getReadingViewContainer(view);
		if (!container) return false;

		const blockCount = container.querySelectorAll(`[${BLOCK_ATTR}=true]`).length;
		if (blockCount === 0) return false;

		this.restoring = true;
		this.suppressDeselectUntil = Date.now() + 1200;
		this.cancelPendingSave();

		const scrollTop = resolvePreviewScrollTop(view, state);
		applyPreviewScroll(view, scrollTop);
		await waitMs(40);

		const block = this.findBlockByLine(container, state.lineStart);
		if (!block) {
			this.restoring = false;
			return false;
		}

		// Highlight without forcing scroll or stealing focus loops.
		selectionHandler.select(block, { center: false, preventScroll: true });
		applyPreviewScroll(view, scrollTop);

		this.completeRestore(file, state, "preview");
		return true;
	}

	private async tryRestoreEditingView(
		view: MarkdownView,
		file: TFile,
		state: UserReadingState,
	): Promise<boolean> {
		const scroller = getSourceViewScroller(view);
		if (!scroller) return false;

		const lineCount = view.editor.lineCount();
		if (lineCount <= 0) return false;

		this.restoring = true;
		this.cancelPendingSave();

		const line = Math.max(0, Math.min(state.lineStart, lineCount - 1));

		// Prefer line-based restore so reading ↔ editing stay aligned.
		if (state.lineStart > 0 || state.progress > 0.001) {
			view.editor.setCursor({ line, ch: 0 });
			view.editor.scrollIntoView(
				{ from: { line, ch: 0 }, to: { line, ch: 0 } },
				true,
			);
		} else {
			const scrollTop = resolveSourceScrollTop(view, state);
			if (scrollTop <= 0 && state.scrollRatio <= 0.001) {
				this.restoring = false;
				return false;
			}
			applySourceScroll(view, scrollTop);
		}

		await waitMs(40);
		this.completeRestore(file, state, "source");
		return true;
	}

	private maybeRestoreAfterModeChange(): void {
		const view = getActiveView(this.plugin);
		const path = view?.file?.path;
		if (!path || !this.hasSavedPosition(path)) return;

		const modeKey = this.getModeKey(
			path,
			isReadingView(view) ? "preview" : "source",
		);
		if (this.lastRestoredModeKey === modeKey) return;
		if (this.hasActiveReadingSelection()) return;

		// Already waiting for this note — nudge instead of resetting the timer.
		if (this.isRestorePendingForPath(path)) {
			this.nudgeRestoreIfPending(path);
			return;
		}

		this.scheduleRestore(path);
	}

	private getModeKey(filePath: string, mode: "preview" | "source"): string {
		return `${filePath}:${mode}`;
	}

	private resolveMarkdownView(filePath?: string): MarkdownView | null {
		if (filePath) {
			return (
				findMarkdownViewForFile(this.plugin, filePath) ??
				getActiveView(this.plugin)
			);
		}
		return getActiveView(this.plugin);
	}

	private resolveReadingFile(
		filePath: string | undefined,
		view: MarkdownView | null,
	): TFile | null {
		if (filePath) {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) return file;
		}
		return view?.file ?? null;
	}

	private hasRestorablePosition(state: UserReadingState): boolean {
		return (
			state.lineStart > 0 ||
			state.scrollTop > 0 ||
			state.scrollRatio > 0.001 ||
			state.progress > 0.001
		);
	}

	private completeRestore(
		file: TFile,
		state: UserReadingState,
		mode: "preview" | "source",
	): void {
		this.restoring = false;
		this.suppressSaveUntil = Date.now() + 1000;
		this.suppressDeselectUntil = Date.now() + 1200;
		this.sessionFilePath = file.path;
		this.lastRestoredModeKey = this.getModeKey(file.path, mode);
		this.pendingRestorePath = null;
		this.restoreAttempts = 0;
		if (this.restoreTimer) {
			window.clearTimeout(this.restoreTimer);
			this.restoreTimer = null;
		}
		this.updateProgressFromState(file, state);

		if (this.plugin.settings.showRestoreNotice) {
			new Notice(t(this.plugin, "notice.restored"));
		}
	}

	async saveNow() {
		const view = getActiveView(this.plugin);
		const container = getScrollContainer(view);
		const block = isReadingView(view)
			? this.plugin.blockSelector.selectionHandler.selectedBlock
			: null;
		if (!view?.file || !container) return;

		await this.persistPosition(view.file, container, block);
		new Notice(t(this.plugin, "notice.saved"));
	}

	async restoreNow(selectionHandler: SelectionHandler) {
		const view = getActiveView(this.plugin);
		const path = view?.file?.path;
		if (!path) {
			new Notice(t(this.plugin, "notice.noPosition"));
			return;
		}

		this.pendingRestorePath = path;
		this.restoreAttempts = 0;
		const restored = await this.tryRestoreAsync(undefined, selectionHandler, path);
		if (!restored) new Notice(t(this.plugin, "notice.noPosition"));
	}

	async markCurrentAsRead() {
		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		const totalWords = await this.getTotalWords(file);
		await markAsRead(this.plugin, file, totalWords);
		this.refreshProgressForFile(file);
		new Notice(t(this.plugin, "notice.markedRead"));
	}

	async markCurrentAsUnread() {
		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		await markAsUnread(this.plugin, file);
		this.refreshProgressForFile(file);
		new Notice(t(this.plugin, "notice.markedUnread"));
	}

	clearAll() {
		this.plugin.readingPositions = {};
		void this.plugin.savePluginData();
		new Notice(t(this.plugin, "notice.clearedLegacy"));
	}

	hasSavedPosition(filePath: string | undefined): boolean {
		if (!filePath) return false;
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return Boolean(this.plugin.readingPositions[filePath]);
		}
		return Boolean(readUserStateFromCache(this.plugin, file));
	}

	getCachedStats(filePath: string): ReadingStats | null {
		return this.statsCache.get(filePath) ?? null;
	}

	private resolveReadingState(file: TFile): UserReadingState | null {
		const fromFrontmatter = readUserStateFromCache(this.plugin, file);
		if (fromFrontmatter) return fromFrontmatter;

		const legacy = this.plugin.readingPositions[file.path];
		if (!legacy) return null;

		return {
			progress: 0,
			lineStart: legacy.lineStart,
			scrollRatio: legacy.scrollRatio,
			scrollTop: 0,
			updatedAt: legacy.updatedAt,
			read: false,
			finished: null,
			totalWords: 0,
			wordsRead: 0,
		};
	}

	private queueSave(container: HTMLElement, block: HTMLElement | null) {
		if (this.shouldSuppressSave()) return;

		if (this.saveTimer) window.clearTimeout(this.saveTimer);

		const generation = ++this.saveGeneration;
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.flushSave(container, block, generation);
		}, this.plugin.settings.readingPositionSaveDelayMs);
	}

	private cancelPendingSave(): void {
		if (this.saveTimer) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.saveGeneration++;
	}

	private shouldSuppressSave(): boolean {
		return this.restoring || Date.now() < this.suppressSaveUntil;
	}

	private async flushSave(
		container: HTMLElement,
		block: HTMLElement | null,
		generation: number,
	) {
		if (generation !== this.saveGeneration) return;

		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		const currentBlock =
			this.plugin.blockSelector.selectionHandler.selectedBlock ?? block;
		await this.persistPosition(file, container, currentBlock, generation);
	}

	private async persistPosition(
		file: TFile,
		container: HTMLElement,
		block: HTMLElement | null,
		generation?: number,
	) {
		if (generation !== undefined && generation !== this.saveGeneration) {
			return;
		}

		const view =
			findMarkdownViewForFile(this.plugin, file.path) ?? getActiveView(this.plugin);
		const scrollable = getScrollableElement(container) ?? container;
		const scrollRatio = scrollable ? getScrollRatio(scrollable) : 0;
		const lineStart = this.resolveLineStart(view, block, scrollRatio);
		if (lineStart < 0) return;

		const scrollTop =
			view && isReadingView(view)
				? view.previewMode.getScroll()
				: scrollable?.scrollTop ?? 0;
		const totalLines = view?.editor.lineCount() ?? 1;
		const totalWords = await this.getTotalWords(file);
		const patch = buildPositionPatch(
			lineStart,
			scrollRatio,
			totalLines,
			totalWords,
			scrollTop,
		);

		await writeUserState(this.plugin, file, patch);

		delete this.plugin.readingPositions[file.path];
		await this.plugin.savePluginData();

		const state = readUserStateFromCache(this.plugin, file);
		if (state) this.updateProgressFromState(file, state);
	}

	private async getTotalWords(file: TFile): Promise<number> {
		const cached = this.totalWordsCache.get(file.path);
		if (cached !== undefined) return cached;

		const totalWords = await getFileReadingUnitsAsync(this.plugin, file);
		this.totalWordsCache.set(file.path, totalWords);
		return totalWords;
	}

	private updateProgressUi(block: HTMLElement | null, container: HTMLElement) {
		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		void this.updateProgressUiAsync(file, block, container);
	}

	private async updateProgressUiAsync(
		file: TFile,
		block: HTMLElement | null,
		container: HTMLElement,
	) {
		const totalWords = await this.getTotalWords(file);
		const cachedState = readUserStateFromCache(this.plugin, file);
		const view = getActiveView(this.plugin);
		const totalLines = view?.editor.lineCount() ?? 1;
		const scrollable = getScrollableElement(container) ?? container;
		const scrollRatio = scrollable ? getScrollRatio(scrollable) : 0;
		const lineStart = this.resolveLineStart(view, block, scrollRatio);

		const patch =
			lineStart >= 0
				? buildPositionPatch(lineStart, scrollRatio, totalLines, totalWords)
				: {};

		const stats = buildReadingStats(
			{ ...cachedState, ...patch },
			totalWords,
			this.plugin.settings.wordsPerMinute,
		);

		this.statsCache.set(file.path, stats);
		this.progressBar.update(stats);
	}

	private updateProgressFromState(file: TFile, state: UserReadingState) {
		void this.getTotalWords(file).then((totalWords) => {
			const stats = buildReadingStats(
				state,
				totalWords,
				this.plugin.settings.wordsPerMinute,
			);
			this.statsCache.set(file.path, stats);
			this.progressBar.update(stats);
		});
	}

	private refreshProgressForActiveFile() {
		const view = getActiveView(this.plugin);
		if (!view?.file) {
			this.progressBar.hide();
			return;
		}

		if (this.hasActiveReadingSelection()) {
			const container = getScrollContainer(view);
			const block = this.plugin.blockSelector.selectionHandler.selectedBlock;
			if (container && block) {
				this.updateProgressUi(block, container);
				return;
			}
		}

		const container = getScrollContainer(view);
		if (container) {
			const block = isReadingView(view)
				? this.plugin.blockSelector.selectionHandler.selectedBlock
				: null;
			this.updateProgressUi(block, container);
			return;
		}

		this.refreshProgressForFile(view.file);
	}

	private refreshProgressForFile(file: TFile) {
		this.totalWordsCache.delete(file.path);
		const state = readUserStateFromCache(this.plugin, file);
		if (state) {
			this.updateProgressFromState(file, state);
			return;
		}

		void this.getTotalWords(file).then((totalWords) => {
			const stats = buildReadingStats({}, totalWords, this.plugin.settings.wordsPerMinute);
			this.statsCache.set(file.path, stats);
			this.progressBar.update(stats);
		});
	}

	private async maybeAutoMarkRead(block: HTMLElement, container: HTMLElement) {
		if (!this.plugin.settings.autoMarkReadAtEnd || this.restoring) return;

		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		const state = readUserStateFromCache(this.plugin, file);
		if (state?.read) return;

		const blocks = container.querySelectorAll<HTMLElement>(`[${BLOCK_ATTR}=true]`);
		if (blocks.length === 0) return;

		const lastBlock = blocks[blocks.length - 1];
		if (block !== lastBlock) return;

		const totalWords = await this.getTotalWords(file);
		await markAsRead(this.plugin, file, totalWords);
		this.refreshProgressForFile(file);
		new Notice(t(this.plugin, "notice.autoMarkedRead"));
	}

	private findBlockByLine(
		container: HTMLElement,
		lineStart: number,
	): HTMLElement | null {
		const blocks = container.querySelectorAll<HTMLElement>(
			`[${BLOCK_ATTR}=true]`,
		);

		let fallback: HTMLElement | null = null;
		for (const block of Array.from(blocks)) {
			const blockLine = this.getBlockLineStart(block);
			if (blockLine === lineStart) return block;
			if (blockLine >= 0 && blockLine <= lineStart) fallback = block;
		}

		return fallback;
	}

	private getBlockLineStart(block: HTMLElement | null): number {
		if (!block) return -1;
		const value = block.getAttribute("data-rve-line-start");
		if (!value) return -1;
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? -1 : parsed;
	}

	private attachScrollListener() {
		const view = getActiveView(this.plugin);
		const container = getScrollContainer(view);
		if (!container || container === this.boundContainer) return;

		this.detachScrollListener();

		this.boundContainer = container;
		this.scrollListener = () => {
			if (this.shouldSuppressSave()) return;

			if (!this.plugin.settings.rememberReadingPosition) {
				const block =
					isReadingView(view)
						? this.plugin.blockSelector.selectionHandler.selectedBlock
						: null;
				this.updateProgressUi(block, container);
				return;
			}

			const block = isReadingView(view)
				? this.plugin.blockSelector.selectionHandler.selectedBlock
				: null;
			this.queueSave(container, block);
			this.updateProgressUi(block, container);
		};
		container.addEventListener("scroll", this.scrollListener, {
			passive: true,
		});
	}

	private detachScrollListener() {
		if (this.boundContainer && this.scrollListener) {
			this.boundContainer.removeEventListener("scroll", this.scrollListener);
		}
		this.boundContainer = null;
		this.scrollListener = null;
	}

	private resolveLineStart(
		view: MarkdownView | null,
		block: HTMLElement | null,
		scrollRatio: number,
	): number {
		const blockLineStart = this.getBlockLineStart(block);
		if (blockLineStart >= 0) return blockLineStart;

		const totalLines = Math.max(1, view?.editor.lineCount() ?? 1);
		return Math.min(
			totalLines - 1,
			Math.max(0, Math.round(scrollRatio * (totalLines - 1))),
		);
	}
}

export function scrollBlockToCenter(block: HTMLElement): void {
	const scrollable = getScrollableParent(block);
	if (!scrollable) {
		block.scrollIntoView({ block: "center", behavior: "smooth" });
		return;
	}

	const blockRect = block.getBoundingClientRect();
	const scrollableRect = scrollable.getBoundingClientRect();
	const blockCenter = blockRect.top + blockRect.height / 2;
	const viewportCenter = scrollableRect.top + scrollableRect.height / 2;
	scrollable.scrollBy({
		top: blockCenter - viewportCenter,
		behavior: "smooth",
	});
}

function getScrollableParent(node: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = node;
	while (current) {
		if (current.scrollHeight > current.clientHeight) return current;
		current = current.parentElement;
	}
	return null;
}

export function getScrollableElement(
	container: HTMLElement,
): HTMLElement | null {
	if (container.scrollHeight > container.clientHeight) return container;

	let node: HTMLElement | null = container.parentElement;
	while (node) {
		if (node.scrollHeight > node.clientHeight) return node;
		node = node.parentElement;
	}

	return null;
}

export function getScrollRatio(scrollable: HTMLElement): number {
	const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
	if (maxScroll <= 0) return 0;
	return scrollable.scrollTop / maxScroll;
}

export function applyScrollRatio(
	scrollable: HTMLElement,
	ratio: number,
): void {
	const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
	scrollable.scrollTop = Math.max(0, Math.min(1, ratio)) * maxScroll;
}

export type { ReadingPosition, ReadingPositionStore };
