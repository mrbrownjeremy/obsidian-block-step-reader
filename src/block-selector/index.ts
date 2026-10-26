import {
	MarkdownView,
	Platform,
	TFile,
	type MarkdownPostProcessorContext,
} from "obsidian";

import ReadingViewEnhancer from "src/main";
import SelectionHandler from "./selection-handler";
import {
	BLOCKS,
	BLOCK_ATTR,
	BLOCK_SELECTOR,
	FRONTMATTER,
	PARAGRAPH_ATTR,
	SELECTED_BLOCK,
} from "../constants";
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
		this.plugin.app.workspace.onLayoutReady(() => this.initializeOpenContainers());
		this.plugin.registerDomEvent(
			window.document,
			"keydown",
			this.selectionHandler.onDocumentKeyDown,
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () =>
				this.initializeOpenContainers(),
			),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on(
				"active-leaf-change",
				this.onActiveLeafChange,
			),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", this.onFileOpen),
		);
		// Leave open notes as we found them when the plugin is disabled.
		this.plugin.register(() => {
			this.selectionHandler.deselect();
			window.activeDocument
				.querySelectorAll(`.${SELECTED_BLOCK}`)
				.forEach((el) => el.removeClass(SELECTED_BLOCK));
			window.activeDocument
				.querySelectorAll(`.${BLOCK_SELECTOR}`)
				.forEach((el) => el.removeClass(BLOCK_SELECTOR));
		});
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
		if (!this.isEnabledOnThisDevice()) return;

		// The section is usually not attached to the page yet while it is
		// post-processed, so look the reading view up from the workspace.
		this.initializeOpenContainers();

		this.elementsToBlocks(element, context);

		if (this.plugin.readingPosition.isRestorePendingForPath(context.sourcePath)) {
			this.plugin.readingPosition.nudgeRestoreIfPending(context.sourcePath);
		}
	}

	/**
	 * Attach listeners to every open Reading view that does not have them yet.
	 */
	initializeOpenContainers(): void {
		if (!this.isEnabledOnThisDevice()) return;
		this.plugin.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			if (!(leaf.view instanceof MarkdownView)) return;
			const container = leaf.view.previewMode.containerEl;
			if (this.isContainerNotInitialized(container)) {
				this.initializeContainer(container);
			}
		});
	}

	private isEnabledOnThisDevice(): boolean {
		if (!this.plugin.settings.enableBlockSelector) return false;
		return !(
			(Platform.isMobile || Platform.isMobileApp) &&
			this.plugin.settings.disableBlockSelectorOnMobile
		);
	}

	private isContainerNotInitialized(container: HTMLElement): boolean {
		return !container.hasClass(BLOCK_SELECTOR);
	}

	private initializeContainer(container: HTMLElement): void {
		container.addClass(BLOCK_SELECTOR);

		const { selectionHandler } = this;
		this.plugin.registerDomEvent(container, "mousedown", selectionHandler.onMouseTouchStart);
		this.plugin.registerDomEvent(container, "touchstart", selectionHandler.onMouseTouchStart, { passive: true });
		this.plugin.registerDomEvent(container, "mouseup", selectionHandler.onMouseTouchEnd);
		this.plugin.registerDomEvent(container, "touchend", selectionHandler.onMouseTouchEnd);
		this.plugin.registerDomEvent(container, "keydown", selectionHandler.onKeyDown);
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
			if (isProseUnit(el)) el.setAttribute(PARAGRAPH_ATTR, "true");
			el.setAttribute("tabindex", "-1");
			if (section?.lineStart != null && section?.lineEnd != null) {
				el.setAttribute("data-rve-line-start", section.lineStart.toString());
				el.setAttribute("data-rve-line-end", section.lineEnd.toString());
			}
		});
	}
}

/**
 * Paragraph navigation stops on prose: paragraphs (including those inside
 * list items, quotes and callouts) and list items that have no paragraph of
 * their own. Headings, tables, code and media are skipped.
 */
function isProseUnit(el: Element): boolean {
	if (el.tagName === "P") {
		return Boolean(el.textContent?.trim()) || el.querySelector("img, .internal-embed") != null;
	}
	if (el.tagName === "LI") {
		return !Array.from(el.children).some((child) => child.tagName === "P");
	}
	return false;
}
