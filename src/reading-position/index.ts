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
	isEditingView,
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
	private editorKeyListener: ((event: KeyboardEvent) => void) | null = null;
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
	/** After restore, briefly refuse jump-to-top overwrites. No scroll fighting. */
	private settle: {
		path: string;
		lineStart: number;
		scrollRatio: number;
		progress: number;
		mode: "preview" | "source";
	} | null = null;
	private settleUntil = 0;
	private floorProgress = 0;
	private floorUntil = 0;
	/** Live progress kept in memory so we don't rewrite the note while reading. */
	private memoryStates = new Map<string, UserReadingState>();
	private lastFrontmatterFingerprint = new Map<string, string>();
	private pluginDataSaveTimer: number | null = null;
	private pendingFmPath: string | null = null;
	/** Highest progress seen this visit — used to ignore jump-to-top glitches. */
	private progressHighWater = new Map<string, number>();
	/** User moved cursor / scrolled in edit mode — cancel auto-restore for this note. */
	private userInteractedPaths = new Set<string>();
	private static readonly MAX_RESTORE_ATTEMPTS = 16;
	/** Accept fallback block only when this close to the saved line. */
	private static readonly LINE_MATCH_SLACK = 3;

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
				// Do NOT restore here — layout-change is very noisy and caused jumps.
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				void this.flushPendingFrontmatter("leaf-change");
				this.attachScrollListener();
				this.refreshProgressForActiveFile();
				this.maybeRestoreAfterModeChange();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on("changed", (file) => {
				this.refreshProgressForFile(file);
			}),
		);
		this.plugin.register(() => {
			void this.flushPendingFrontmatter("unload");
		});
	}

	onBlockSelected(block: HTMLElement, container: HTMLElement) {
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
		this.stopSettleGuard();
		this.cancelPendingSave();
	}

	getSessionFilePath(): string | null {
		return this.sessionFilePath;
	}

	clearUserInteraction(filePath: string): void {
		this.userInteractedPaths.delete(filePath);
	}

	onUserInteraction(filePath: string): void {
		if (!filePath) return;
		this.userInteractedPaths.add(filePath);
		this.cancelRestoreForFile(filePath);
	}

	private cancelRestoreForFile(filePath: string): void {
		if (!this.isRestorePendingForPath(filePath)) return;
		this.clearRestorePending();
	}

	/** Quiet restore: one delayed attempt, few quiet retries. No polling loop. */
	scheduleRestore(filePath: string): void {
		if (!this.plugin.settings.rememberReadingPosition) return;
		if (!this.hasSavedPosition(filePath)) return;

		// Already restored this note+mode in the current session — don't yank again.
		const view =
			findMarkdownViewForFile(this.plugin, filePath) ?? getActiveView(this.plugin);
		if (view?.file?.path === filePath) {
			const modeKey = this.getModeKey(
				filePath,
				isReadingView(view) ? "preview" : "source",
			);
			if (this.lastRestoredModeKey === modeKey) return;
		}

		if (this.settle && this.settle.path !== filePath) {
			this.stopSettleGuard();
		}

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
		// Vim j / manual scroll in edit mode — never fight the user with restore retries.
		if (this.userInteractedPaths.has(filePath)) {
			this.clearRestorePending();
			return;
		}

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

		// Soft-scroll by ratio first (adapts to current height while blocks load).
		const softTop = resolvePreviewScrollTop(view, {
			scrollTop: 0,
			scrollRatio: state.scrollRatio,
		});
		if (softTop > 0) applyPreviewScroll(view, softTop);
		await waitMs(40);

		const block = this.findBlockByLine(container, state.lineStart);
		if (state.lineStart > 0 && !block) {
			// Target paragraph not rendered yet — keep retrying.
			this.restoring = false;
			return false;
		}

		if (block) {
			// Highlight without stealing scroll; pin by ratio (stable) not by re-centering.
			selectionHandler.select(block, { preventScroll: true });
			const pinnedTop = resolvePreviewScrollTop(view, {
				scrollTop: 0,
				scrollRatio: state.scrollRatio,
			});
			applyPreviewScroll(view, pinnedTop > 0 ? pinnedTop : softTop);
			// Then put the paragraph exactly where keyboard focus would put it.
			selectionHandler.scrollToFocus(block, true);
		} else if (state.scrollRatio > 0.001) {
			applyPreviewScroll(view, softTop);
		} else {
			this.restoring = false;
			return false;
		}

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

		const currentLine = view.editor.getCursor().line;

		if (this.userInteractedPaths.has(file.path)) {
			this.completeRestoreFromEditor(view, file);
			return true;
		}

		// User already read past the saved line (e.g. vim j) — do not scroll backward.
		if (currentLine > state.lineStart + 3 && state.lineStart > 0) {
			this.completeRestoreFromEditor(view, file);
			return true;
		}

		// Corrupt state: progress mid-doc but lineStart stuck at 0 — trust the cursor.
		if (state.lineStart <= 2 && state.progress > 0.08 && currentLine > 10) {
			this.completeRestoreFromEditor(view, file);
			return true;
		}

		this.restoring = true;
		this.cancelPendingSave();

		const line = Math.max(0, Math.min(state.lineStart, lineCount - 1));

		if (this.userInteractedPaths.has(file.path)) {
			this.restoring = false;
			this.completeRestoreFromEditor(view, file);
			return true;
		}

		if (state.lineStart > 0 || state.progress > 0.001) {
			if (currentLine <= line + 3) {
				view.editor.setCursor({ line, ch: 0 });
				view.editor.scrollIntoView(
					{ from: { line, ch: 0 }, to: { line, ch: 0 } },
					true,
				);
			}
		} else if (state.scrollRatio > 0.001) {
			const scrollTop = resolveSourceScrollTop(view, state);
			if (scrollTop <= 0) {
				this.restoring = false;
				return false;
			}
			applySourceScroll(view, scrollTop);
		} else {
			this.restoring = false;
			return false;
		}

		await waitMs(40);
		this.completeRestore(file, state, "source");
		return true;
	}

	private completeRestoreFromEditor(view: MarkdownView, file: TFile): void {
		const state = this.buildStateFromEditor(view, file);
		this.completeRestore(file, state, "source");
	}

	private buildStateFromEditor(view: MarkdownView, file: TFile): UserReadingState {
		const lineStart = Math.max(0, view.editor.getCursor().line);
		const totalLines = Math.max(1, view.editor.lineCount());
		const scroller = getSourceViewScroller(view);
		const scrollRatio = scroller ? getScrollRatio(scroller) : 0;
		const scrollTop = scroller?.scrollTop ?? 0;
		const previous = this.resolveReadingState(file);
		const totalWords = this.totalWordsCache.get(file.path) ?? previous?.totalWords ?? 0;
		const patch = buildPositionPatch(
			lineStart,
			scrollRatio,
			totalLines,
			totalWords,
			scrollTop,
		);

		return {
			progress: patch.progress ?? 0,
			lineStart: patch.lineStart ?? lineStart,
			scrollRatio: patch.scrollRatio ?? scrollRatio,
			scrollTop: patch.scrollTop ?? scrollTop,
			read: previous?.read ?? false,
			finished: previous?.finished ?? null,
			totalWords: patch.totalWords ?? totalWords,
			wordsRead: patch.wordsRead ?? 0,
			updatedAt: Date.now(),
		};
	}

	private maybeRestoreAfterModeChange(): void {
		const view = getActiveView(this.plugin);
		const path = view?.file?.path;
		if (!path || !this.hasSavedPosition(path)) return;

		if (this.userInteractedPaths.has(path)) return;

		const modeKey = this.getModeKey(
			path,
			isReadingView(view) ? "preview" : "source",
		);
		if (this.lastRestoredModeKey === modeKey) return;

		// Only for real reading ↔ editing flips on the same note.
		if (this.sessionFilePath !== path) return;
		if (!this.lastRestoredModeKey?.startsWith(`${path}:`)) return;

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
		this.suppressSaveUntil = Date.now() + 800;
		this.suppressDeselectUntil = Date.now() + 1200;
		this.sessionFilePath = file.path;
		this.lastRestoredModeKey = this.getModeKey(file.path, mode);
		this.pendingRestorePath = null;
		this.restoreAttempts = 0;
		if (this.restoreTimer) {
			window.clearTimeout(this.restoreTimer);
			this.restoreTimer = null;
		}
		this.memoryStates.set(file.path, { ...state, updatedAt: Date.now() });
		this.progressHighWater.set(
			file.path,
			Math.max(this.progressHighWater.get(file.path) ?? 0, state.progress),
		);
		this.settle = {
			path: file.path,
			lineStart: state.lineStart,
			scrollRatio: state.scrollRatio,
			progress: state.progress,
			mode,
		};
		this.settleUntil = Date.now() + 3000;
		this.floorProgress = Math.max(0, state.progress);
		this.floorUntil = Date.now() + 3000;
		this.updateProgressFromState(file, state);

		if (this.plugin.settings.showRestoreNotice) {
			new Notice(t(this.plugin, "notice.restored"));
		}
	}

	private stopSettleGuard(): void {
		this.settle = null;
		this.settleUntil = 0;
	}

	async saveNow() {
		const view = getActiveView(this.plugin);
		const container = getScrollContainer(view);
		const block = isReadingView(view)
			? this.plugin.blockSelector.selectionHandler.selectedBlock
			: null;
		if (!view?.file || !container) return;

		await this.persistPosition(view.file, container, block);
		this.pendingFmPath = view.file.path;
		await this.flushPendingFrontmatter("manual");
		new Notice(t(this.plugin, "notice.saved"));
	}

	async restoreNow(selectionHandler: SelectionHandler) {
		const view = getActiveView(this.plugin);
		const path = view?.file?.path;
		if (!path) {
			new Notice(t(this.plugin, "notice.noPosition"));
			return;
		}

		this.clearUserInteraction(path);
		this.pendingRestorePath = path;
		this.restoreAttempts = 0;
		const restored = await this.tryRestoreAsync(undefined, selectionHandler, path);
		if (!restored) new Notice(t(this.plugin, "notice.noPosition"));
	}

	async markCurrentAsRead() {
		if (!this.requireFrontmatterWrites()) return;
		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		const totalWords = await this.getTotalWords(file);
		await markAsRead(this.plugin, file, totalWords);
		this.refreshProgressForFile(file);
		new Notice(t(this.plugin, "notice.markedRead"));
	}

	async markCurrentAsUnread() {
		if (!this.requireFrontmatterWrites()) return;
		const view = getActiveView(this.plugin);
		const file = view?.file;
		if (!file) return;

		await markAsUnread(this.plugin, file);
		this.refreshProgressForFile(file);
		new Notice(t(this.plugin, "notice.markedUnread"));
	}

	/** Read status lives in frontmatter; tell the user when that is switched off. */
	private requireFrontmatterWrites(): boolean {
		if (this.plugin.settings.writeProgressToFrontmatter) return true;
		new Notice(
			"Turn on “Save progress to note frontmatter” in the plugin settings to mark notes as read.",
		);
		return false;
	}

	clearAll() {
		this.plugin.readingPositions = {};
		void this.plugin.savePluginData();
		new Notice(t(this.plugin, "notice.clearedLegacy"));
	}

	hasSavedPosition(filePath: string | undefined): boolean {
		if (!filePath) return false;
		if (this.memoryStates.has(filePath)) return true;
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (this.plugin.readingPositions[filePath]) return true;
		if (!(file instanceof TFile)) return false;
		return Boolean(readUserStateFromCache(this.plugin, file));
	}

	getCachedStats(filePath: string): ReadingStats | null {
		return this.statsCache.get(filePath) ?? null;
	}

	private resolveReadingState(file: TFile): UserReadingState | null {
		const memory = this.memoryStates.get(file.path);
		const fromFrontmatter = readUserStateFromCache(this.plugin, file);

		if (memory && fromFrontmatter) {
			return memory.updatedAt >= fromFrontmatter.updatedAt
				? memory
				: fromFrontmatter;
		}
		if (memory) return memory;
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

		// Don't overwrite a real mid-article position with a jump-to-top glitch.
		// Keep this check for the whole visit, not just a few seconds after open.
		const previous = this.resolveReadingState(file);
		const highWater = Math.max(
			this.progressHighWater.get(file.path) ?? 0,
			previous?.progress ?? 0,
		);
		const nextProgress = patch.progress ?? 0;
		const looksLikeJumpToTop =
			highWater > 0.08 &&
			nextProgress < highWater - 0.05 &&
			scrollRatio < 0.04 &&
			lineStart <= 2;
		if (looksLikeJumpToTop) {
			return;
		}

		const merged: UserReadingState = {
			progress: patch.progress ?? previous?.progress ?? 0,
			lineStart: patch.lineStart ?? previous?.lineStart ?? 0,
			scrollRatio: patch.scrollRatio ?? previous?.scrollRatio ?? 0,
			scrollTop: patch.scrollTop ?? previous?.scrollTop ?? 0,
			read: previous?.read ?? false,
			finished: previous?.finished ?? null,
			totalWords: patch.totalWords ?? previous?.totalWords ?? 0,
			wordsRead: patch.wordsRead ?? previous?.wordsRead ?? 0,
			updatedAt: Date.now(),
		};
		this.memoryStates.set(file.path, merged);
		this.progressHighWater.set(
			file.path,
			Math.max(highWater, merged.progress),
		);
		this.pendingFmPath = file.path;
		this.updateProgressFromState(file, merged);

		// Durable backup that does NOT rewrite the note (no preview jump).
		// Never persist a near-zero glitch over a real mid-article position.
		if (merged.progress > 0.01 || merged.lineStart > 0 || merged.scrollRatio > 0.01) {
			this.plugin.readingPositions[file.path] = {
				lineStart: merged.lineStart,
				scrollRatio: merged.scrollRatio,
				updatedAt: merged.updatedAt,
			};
			this.schedulePluginDataSave();
		}

		if (this.settle?.path === file.path) {
			this.settle.lineStart = merged.lineStart;
			this.settle.scrollRatio = merged.scrollRatio;
			this.settle.progress = merged.progress;
		}
	}

	private schedulePluginDataSave(): void {
		if (this.pluginDataSaveTimer) window.clearTimeout(this.pluginDataSaveTimer);
		this.pluginDataSaveTimer = window.setTimeout(() => {
			this.pluginDataSaveTimer = null;
			void this.plugin.savePluginData();
		}, 1000);
	}

	async flushPendingFrontmatter(
		reason: "leaf-change" | "unload" | "manual" = "leaf-change",
	): Promise<void> {
		// Notes stay untouched unless the user opted in; positions live in plugin data.
		if (!this.plugin.settings.writeProgressToFrontmatter) {
			this.pendingFmPath = null;
			return;
		}
		if (reason === "unload") {
			const dirty = new Set<string>();
			if (this.pendingFmPath) dirty.add(this.pendingFmPath);
			for (const [path, state] of this.memoryStates) {
				const fingerprint = this.fingerprintState(state);
				if (this.lastFrontmatterFingerprint.get(path) !== fingerprint) {
					dirty.add(path);
				}
			}
			for (const path of dirty) {
				await this.writeFrontmatterForPath(path, false);
			}
			return;
		}

		const path = this.pendingFmPath;
		if (!path) return;

		if (reason === "manual") {
			await this.writeFrontmatterForPath(path, true);
			return;
		}

		// leaf-change: ONLY write when this note is no longer open in any pane.
		// Clicking the sidebar used to clear "active markdown view" while the note
		// was still visible — we wrote frontmatter, Obsidian remounted preview,
		// and the page jumped to the top. That was the mid-reading jump.
		if (findMarkdownViewForFile(this.plugin, path)) {
			return;
		}

		await this.writeFrontmatterForPath(path, false);
	}

	private fingerprintState(state: UserReadingState): string {
		return `${state.lineStart}:${state.progress.toFixed(3)}:${state.scrollRatio.toFixed(3)}`;
	}

	private async writeFrontmatterForPath(
		path: string,
		reapplyIfActive: boolean,
	): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			if (this.pendingFmPath === path) this.pendingFmPath = null;
			return;
		}

		const state = this.memoryStates.get(path);
		if (!state) {
			if (this.pendingFmPath === path) this.pendingFmPath = null;
			return;
		}

		const fingerprint = this.fingerprintState(state);
		if (this.lastFrontmatterFingerprint.get(path) === fingerprint) {
			if (this.pendingFmPath === path) this.pendingFmPath = null;
			return;
		}

		const patch: Partial<UserReadingState> = {
			lineStart: state.lineStart,
			scrollRatio: state.scrollRatio,
			scrollTop: state.scrollTop,
			progress: state.progress,
			totalWords: state.totalWords,
			wordsRead: state.wordsRead,
			read: state.read,
			finished: state.finished,
		};

		const activePath = getActiveView(this.plugin)?.file?.path;
		const pinState = { ...state };
		const view = findMarkdownViewForFile(this.plugin, path);
		const mode: "preview" | "source" =
			view && isReadingView(view) ? "preview" : "source";

		await writeUserState(this.plugin, file, patch);

		this.lastFrontmatterFingerprint.set(path, fingerprint);
		if (this.pendingFmPath === path) this.pendingFmPath = null;

		delete this.plugin.readingPositions[path];
		await this.plugin.savePluginData();

		// Only re-pin when the user explicitly saved while still viewing.
		if (reapplyIfActive && activePath === path) {
			this.suppressSaveUntil = Date.now() + 1200;
			this.floorProgress = Math.max(this.floorProgress, pinState.progress);
			this.floorUntil = Date.now() + 2000;
			await waitMs(80);
			this.reapplyPinnedState(file, pinState, mode);
		}
	}

	private reapplyPinnedState(
		file: TFile,
		state: UserReadingState,
		mode: "preview" | "source",
	): void {
		const view = findMarkdownViewForFile(this.plugin, file.path);
		if (!view) return;

		this.restoring = true;
		this.cancelPendingSave();
		try {
			if (mode === "preview" && isReadingView(view)) {
				const container = getReadingViewContainer(view);
				if (!container) return;
				const block =
					state.lineStart > 0
						? this.findBlockByLine(container, state.lineStart)
						: null;
				if (block) {
					this.plugin.blockSelector.selectionHandler.scrollToFocus(block, true);
				} else {
					const top = resolvePreviewScrollTop(view, {
						scrollTop: 0,
						scrollRatio: state.scrollRatio,
					});
					applyPreviewScroll(view, top);
				}
			} else if (mode === "source" && !isReadingView(view)) {
				const lineCount = view.editor.lineCount();
				if (lineCount <= 0) return;
				const line = Math.max(0, Math.min(state.lineStart, lineCount - 1));
				if (state.lineStart > 0 || state.progress > 0.001) {
					view.editor.scrollIntoView(
						{ from: { line, ch: 0 }, to: { line, ch: 0 } },
						true,
					);
				} else if (state.scrollRatio > 0.001) {
					applySourceScroll(
						view,
						resolveSourceScrollTop(view, {
							scrollTop: 0,
							scrollRatio: state.scrollRatio,
						}),
					);
				}
			}
		} finally {
			this.restoring = false;
			this.suppressSaveUntil = Math.max(this.suppressSaveUntil, Date.now() + 800);
		}
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
		const cachedState = this.resolveReadingState(file);
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
		const state = this.resolveReadingState(file);
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
		if (
			!this.plugin.settings.writeProgressToFrontmatter ||
			!this.plugin.settings.autoMarkReadAtEnd ||
			this.restoring
		) {
			return;
		}

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
		if (lineStart < 0) return null;

		const blocks = container.querySelectorAll<HTMLElement>(
			`[${BLOCK_ATTR}=true]`,
		);

		let fallback: HTMLElement | null = null;
		let fallbackLine = -1;
		for (const block of Array.from(blocks)) {
			const blockLine = this.getBlockLineStart(block);
			if (blockLine === lineStart) return block;
			if (blockLine >= 0 && blockLine <= lineStart && blockLine > fallbackLine) {
				fallback = block;
				fallbackLine = blockLine;
			}
		}

		// Far fallback means the real paragraph is not rendered yet — keep waiting.
		if (
			fallback &&
			lineStart - fallbackLine <= ReadingPositionManager.LINE_MATCH_SLACK
		) {
			return fallback;
		}

		return null;
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
			const activeView = getActiveView(this.plugin);
			const activeContainer = getScrollContainer(activeView);
			if (!activeView?.file || activeContainer !== container) return;

			if (isEditingView(activeView)) {
				this.onUserInteraction(activeView.file.path);
			}

			if (this.shouldSuppressSave()) return;

			if (!this.plugin.settings.rememberReadingPosition) {
				const block =
					isReadingView(activeView)
						? this.plugin.blockSelector.selectionHandler.selectedBlock
						: null;
				this.updateProgressUi(block, container);
				return;
			}

			const block = isReadingView(activeView)
				? this.plugin.blockSelector.selectionHandler.selectedBlock
				: null;
			this.queueSave(container, block);
			this.updateProgressUi(block, container);
		};
		container.addEventListener("scroll", this.scrollListener, {
			passive: true,
		});

		if (view && isEditingView(view)) {
			this.editorKeyListener = () => {
				const activeView = getActiveView(this.plugin);
				if (activeView?.file && isEditingView(activeView)) {
					this.onUserInteraction(activeView.file.path);
				}
			};
			container.addEventListener("keydown", this.editorKeyListener, true);
		}
	}

	private detachScrollListener() {
		if (this.boundContainer && this.scrollListener) {
			this.boundContainer.removeEventListener("scroll", this.scrollListener);
		}
		if (this.boundContainer && this.editorKeyListener) {
			this.boundContainer.removeEventListener(
				"keydown",
				this.editorKeyListener,
				true,
			);
		}
		this.boundContainer = null;
		this.scrollListener = null;
		this.editorKeyListener = null;
	}

	private resolveLineStart(
		view: MarkdownView | null,
		block: HTMLElement | null,
		scrollRatio: number,
	): number {
		const blockLineStart = this.getBlockLineStart(block);
		if (blockLineStart >= 0) return blockLineStart;

		// Edit / vim mode: cursor line is authoritative — scrollRatio on cm-scroller lies.
		if (view && isEditingView(view)) {
			return Math.max(0, view.editor.getCursor().line);
		}

		const totalLines = Math.max(1, view?.editor.lineCount() ?? 1);
		return Math.min(
			totalLines - 1,
			Math.max(0, Math.round(scrollRatio * (totalLines - 1))),
		);
	}
}

export function getScrollableElement(
	container: HTMLElement,
): HTMLElement | null {
	if (container.scrollHeight > container.clientHeight) return container;

	// Reading view: the scroller is inside `.markdown-reading-view`.
	const inner = container.querySelector(".markdown-preview-view");
	if (inner instanceof HTMLElement && inner.scrollHeight > inner.clientHeight) {
		return inner;
	}

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
