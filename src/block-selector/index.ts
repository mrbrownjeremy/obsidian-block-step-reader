import { Platform, TFile, type MarkdownPostProcessorContext } from "obsidian";

import ReadingViewEnhancer from "src/main";
import SelectionHandler from "./selection-handler";
import { BLOCKS, BLOCK_ATTR, BLOCK_SELECTOR, FRONTMATTER } from "../constants";
import { getActiveView } from "src/utils";

export default class BlockSelector {
	plugin: ReadingViewEnhancer;
	selectionHandler: SelectionHandler;
	private lastOpenedPath: string | null = null;

	private readonly blockifyProcessor = (
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void => {
		this.blockify(element, context);
	};

	private readonly onActiveLeafChange = (): void => {
		const view = getActiveView(this.plugin);
		const path = view?.file?.path ?? null;
		const pending = this.plugin.readingPosition.getPendingRestorePath();
		const sessionPath = this.plugin.readingPosition.getSessionFilePath();
		const switchedFile = Boolean(path && path !== this.lastOpenedPath);

		if (pending && path && pending !== path) {
			this.plugin.readingPosition.clearRestorePending();
			this.selectionHandler.deselect();
			this.plugin.readingPosition.resetReadingSession();
		} else if (!pending && switchedFile) {
			// Only reset when actually opening a different note.
			// Focus flickers (sidebar, command palette) must NOT re-restore.
			this.selectionHandler.deselect();
			this.plugin.readingPosition.resetReadingSession();
		}

		if (path) {
			this.lastOpenedPath = path;
		}

		// Restore only when the note actually changed (or first open).
		if (
			switchedFile &&
			path &&
			this.plugin.readingPosition.hasSavedPosition(path) &&
			sessionPath !== path
		) {
			this.plugin.readingPosition.clearUserInteraction(path);
			this.plugin.readingPosition.scheduleRestore(path);
		}
	};

	private readonly onFileOpen = (file: TFile | null): void => {
		if (!file) return;
		const path = file.path;
		const switchedFile = path !== this.lastOpenedPath;
		this.lastOpenedPath = path;

		if (!switchedFile) return;
		if (!this.plugin.readingPosition.hasSavedPosition(path)) return;

		// Fresh note open — start a restore once.
		if (this.plugin.readingPosition.getSessionFilePath() !== path) {
			this.plugin.readingPosition.clearUserInteraction(path);
			this.plugin.readingPosition.scheduleRestore(path);
		}
	};

	constructor(plugin: ReadingViewEnhancer) {
		this.plugin = plugin;
		this.selectionHandler = new SelectionHandler(plugin);
	}

	activate(): void {
		this.plugin.registerMarkdownPostProcessor(this.blockifyProcessor);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on(
				"active-leaf-change",
				this.onActiveLeafChange,
			),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", this.onFileOpen),
		);
	}

	autoSelectTopBlock(): void {
		const view = getActiveView(this.plugin);
		const path = view?.file?.path;
		if (path) this.plugin.readingPosition.scheduleRestore(path);
	}

	requestRestoreForFile(filePath: string): void {
		this.lastOpenedPath = null; // force treat as new open from library
		this.plugin.readingPosition.resetReadingSession();
		this.plugin.readingPosition.clearUserInteraction(filePath);
		this.plugin.readingPosition.scheduleRestore(filePath);
	}

	selectTopBlockInTheView(viewContainer: HTMLElement): void {
		this.selectionHandler.selectTopBlockInTheView(viewContainer);
	}

	toggleBlockHighlight(): void {
		void this.selectionHandler.selectedBlockHighlight();
	}

	private blockify(
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void {
		if (!this.plugin.settings.enableBlockSelector) return;

		if (
			(Platform.isMobile || Platform.isMobileApp) &&
			this.plugin.settings.disableBlockSelectorOnMobile
		) {
			return;
		}

		const container = this.getPostProcessorContainer(element);
		if (container && this.isContainerNotInitialized(container)) {
			this.initializeContainer(container);
		}

		this.elementsToBlocks(element, context);

		if (this.plugin.readingPosition.isRestorePendingForPath(context.sourcePath)) {
			this.plugin.readingPosition.nudgeRestoreIfPending(context.sourcePath);
		}
	}

	private getPostProcessorContainer(element: HTMLElement): HTMLElement | null {
		const container = element.closest(".markdown-reading-view");
		return container?.instanceOf(HTMLElement) ? container : null;
	}

	private isContainerNotInitialized(container: HTMLElement): boolean {
		return !container.hasClass(BLOCK_SELECTOR);
	}

	private initializeContainer(container: HTMLElement): void {
		container.addClass(BLOCK_SELECTOR);

		container.addEventListener(
			"mousedown",
			this.selectionHandler.onMouseTouchStart,
		);
		container.addEventListener(
			"touchstart",
			this.selectionHandler.onMouseTouchStart,
		);
		container.addEventListener(
			"mouseup",
			this.selectionHandler.onMouseTouchEnd,
		);
		container.addEventListener(
			"touchend",
			this.selectionHandler.onMouseTouchEnd,
		);
		container.addEventListener(
			"focusout",
			this.selectionHandler.onContainerFocusOut,
		);
		container.addEventListener("keydown", this.selectionHandler.onKeyDown);
	}

	private elementsToBlocks(
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void {
		const section = context.getSectionInfo(element);
		const elements = element.querySelectorAll(BLOCKS.join(", "));
		elements.forEach((el) => {
			if (el.hasClass(FRONTMATTER)) return;
			el.setAttribute(BLOCK_ATTR, "true");
			el.setAttribute("tabindex", "-1");
			if (section?.lineStart != null && section?.lineEnd != null) {
				el.setAttribute("data-rve-line-start", section.lineStart.toString());
				el.setAttribute("data-rve-line-end", section.lineEnd.toString());
			}
		});
	}
}
