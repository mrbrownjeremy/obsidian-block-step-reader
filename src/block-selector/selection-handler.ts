import ReadingViewEnhancer from "src/main";
import {
	BLOCK_SELECTOR,
	COLLAPSE_INDICATORS,
	MARKDOWN_PREVIEW_VIEW,
	SELECTED_BLOCK,
} from "../constants";
import {
	closestUnit,
	findAdjacentUnit,
	findTopVisibleUnit,
	hasHiddenPart,
	isAtScrollEnd,
	isOutsideViewport,
	nextFrame,
	pageTarget,
	prefersReducedMotion,
	scrollToTop,
	targetScrollTop,
} from "./selection-util";
import { getActiveView, getReadingViewContainer, isReadingView } from "src/utils";
import type { MarkdownViewModeType } from "obsidian";

const INTERACTIVE =
	"a, input, textarea, select, button, summary, label, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='button'], .modal, .menu";

/** How many times to scroll ahead looking for a block Obsidian has not rendered yet. */
const MAX_RENDER_ATTEMPTS = 8;

/**
 * Handle block selection.
 * This class is used by BlockSelector.
 */
export default class SelectionHandler {
	plugin: ReadingViewEnhancer;
	selectedBlock: HTMLElement | null;
	startX: number;
	startY: number;
	private stepping = false;
	private settleToken = 0;
	/** Where a running smooth scroll is headed, so a quick next press can finish it. */
	private inFlight: { scroller: HTMLElement; top: number } | null = null;

	constructor(plugin: ReadingViewEnhancer) {
		this.plugin = plugin;
		this.selectedBlock = null;
	}

	readonly onMouseTouchStart = (e: MouseEvent | TouchEvent): void => {
		this.handleMouseTouchStart(e);
	};

	readonly onMouseTouchEnd = (e: MouseEvent | TouchEvent): void => {
		this.handleMouseTouchEnd(e);
	};

	readonly onKeyDown = (e: KeyboardEvent): void => {
		this.handleKeyDown(e);
	};

	/**
	 * Keys pressed while nothing has focus (just after opening a note, or
	 * after Escape) go to the page body, not to the note. Treat next/previous
	 * there as "start from the paragraph at the top of the screen".
	 */
	readonly onDocumentKeyDown = (e: KeyboardEvent): void => {
		if (e.defaultPrevented || e.isComposing) return;
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		const doc = (e.target as Node | null)?.ownerDocument ?? activeDocument;
		if (doc.activeElement && doc.activeElement !== doc.body) return;
		if (doc.querySelector(".modal-container, .menu, .suggestion-container")) return;

		const view = getActiveView(this.plugin);
		if (!isReadingView(view)) return;
		const container = getReadingViewContainer(view);
		if (!container || !container.hasClass(BLOCK_SELECTOR)) return;

		const settings = this.plugin.settings;
		const direction = this.pressed(settings.nextBlockKeys, e)
			? 1
			: this.pressed(settings.prevBlockKeys, e)
				? -1
				: 0;
		if (!direction) return;
		e.preventDefault();
		void this.step(direction, container);
	};

	isSelected(block: HTMLElement) {
		return block === this.selectedBlock;
	}

	/**
	 * Select block element and, unless `preventScroll` is set, scroll it to
	 * the configured position.
	 *
	 * @param block {HTMLElement} Block element
	 */
	select(block: HTMLElement, options?: { center?: boolean; preventScroll?: boolean }) {
		if (this.selectedBlock && this.selectedBlock !== block) {
			this.selectedBlock.removeClass(SELECTED_BLOCK);
		}

		// Focus without letting the browser scroll; positioning is ours.
		block.focus({ preventScroll: true });
		block.addClass(SELECTED_BLOCK);
		this.selectedBlock = block;

		if (!options?.preventScroll) this.scrollToFocus(block);

		const container =
			(block.closest(".markdown-reading-view") as HTMLElement | null) ??
			getReadingViewContainer(getActiveView(this.plugin));
		if (container) {
			this.plugin.readingPosition.onBlockSelected(block, container);
		}
	}

	/**
	 * Deselect block element.
	 * If there is no selected block, do nothing.
	 */
	deselect() {
		this.settleToken++;
		this.inFlight = null;
		if (this.selectedBlock) {
			this.selectedBlock.removeClass(SELECTED_BLOCK);
			this.selectedBlock.blur();
			this.selectedBlock = null;
		}
	}

	/**
	 * Move focus to the next (1) or previous (-1) unit in the reading view
	 * that contains `container`, or in the active view.
	 */
	async step(direction: 1 | -1, container?: HTMLElement | null): Promise<void> {
		const root = container ?? getReadingViewContainer(getActiveView(this.plugin));
		const scroller = root?.querySelector<HTMLElement>(`.${MARKDOWN_PREVIEW_VIEW}`);
		if (!root || !scroller || this.stepping) return;

		const { navigationUnit: unit, topMargin } = this.plugin.settings;
		const current = this.currentBlockIn(root);

		// Pressed again before the last scroll finished: jump to where it was
		// going, so the decision below is made from the settled layout.
		if (this.inFlight?.scroller === scroller) {
			scroller.scrollTop = this.inFlight.top;
			this.inFlight = null;
		}

		// Nothing focused here yet, or the reader scrolled away from it:
		// start from the paragraph at the top of the screen.
		if (!current || isOutsideViewport(current, scroller)) {
			const top = findTopVisibleUnit(scroller, unit, topMargin);
			if (top) this.select(top);
			return;
		}

		// Long paragraph: read through it a screen at a time before moving on.
		if (hasHiddenPart(current, scroller, topMargin, direction)) {
			this.smoothScroll(scroller, pageTarget(current, scroller, topMargin, direction));
			current.focus({ preventScroll: true });
			return;
		}

		this.stepping = true;
		try {
			let next = findAdjacentUnit(scroller, current, unit, direction);
			// Obsidian renders long notes lazily. If the neighbour is not in the
			// DOM yet, scroll toward it so Obsidian renders it, then look again.
			for (
				let attempt = 0;
				!next && attempt < MAX_RENDER_ATTEMPTS && !isAtScrollEnd(scroller, direction);
				attempt++
			) {
				scroller.scrollTop += direction * scroller.clientHeight * 0.5;
				await nextFrame();
				await nextFrame();
				if (!current.isConnected) break;
				next = findAdjacentUnit(scroller, current, unit, direction);
			}
			if (next) this.select(next);
			else if (current.isConnected) this.scrollToFocus(current);
		} finally {
			this.stepping = false;
		}
	}

	/**
	 * Scroll the reading pane so the block sits at the configured alignment.
	 */
	scrollToFocus(block: HTMLElement, instant = false): void {
		const { autoScrollOnFocus, scrollAlignment, topMargin } = this.plugin.settings;
		if (!autoScrollOnFocus) return;

		const scroller = block.closest<HTMLElement>(`.${MARKDOWN_PREVIEW_VIEW}`);
		if (!scroller) return;

		const top = targetScrollTop(block, scroller, scrollAlignment, topMargin);
		if (top === null) {
			this.settleToken++;
			return;
		}
		if (instant) {
			this.settleToken++;
			this.inFlight = null;
			scroller.scrollTop = top;
			return;
		}

		// Obsidian may re-measure sections while a smooth scroll is running,
		// which shifts the target. Correct once the scroll has settled.
		this.smoothScroll(scroller, top, () => {
			if (!block.isConnected) return;
			const corrected = targetScrollTop(block, scroller, scrollAlignment, topMargin);
			if (corrected !== null && Math.abs(corrected - scroller.scrollTop) > 2) {
				scroller.scrollTop = corrected;
			}
		});
	}

	/**
	 * Scroll to `top`, animated unless the user prefers otherwise, and run
	 * `onSettled` once the scroll ends (unless another scroll replaced it).
	 */
	private smoothScroll(scroller: HTMLElement, top: number, onSettled?: () => void): void {
		const token = ++this.settleToken;
		if (this.scrollBehavior() !== "smooth") {
			this.inFlight = null;
			scroller.scrollTop = top;
			onSettled?.();
			return;
		}

		this.inFlight = { scroller, top };
		scrollToTop(scroller, top, "smooth");
		const settle = () => {
			window.clearTimeout(fallback);
			scroller.removeEventListener("scrollend", settle);
			if (token !== this.settleToken) return;
			this.inFlight = null;
			onSettled?.();
		};
		const fallback = window.setTimeout(settle, 900);
		scroller.addEventListener("scrollend", settle);
	}

	/**
	 * Record the starting point of mouse or touch event.
	 *
	 * @param e Mouse or touch event
	 */
	handleMouseTouchStart(e: MouseEvent | TouchEvent) {
		const { x, y } = this.clientXY(e);
		this.startX = x;
		this.startY = y;
	}

	/**
	 * Calculate the distance between the starting point and the end point.
	 * If the distance is less than 10, it is considered as a tap and
	 * fires the `handleTap` method.
	 *
	 * @param e Mouse or touch event
	 */
	handleMouseTouchEnd(e: MouseEvent | TouchEvent) {
		const { x: endX, y: endY } = this.clientXY(e);

		const distance = Math.sqrt(
			Math.pow(endX - this.startX, 2) + Math.pow(endY - this.startY, 2)
		);

		if (distance < 10) {
			this.handleTap(e);
		}
	}

	/**
	 * Select or toggle collapse on tap. Tapping never scrolls: the paragraph
	 * you clicked stays where it is.
	 *
	 * @param e Mouse or touch event
	 */
	private handleTap(e: MouseEvent | TouchEvent) {
		if (e instanceof MouseEvent && e.button !== 0) return;
		const target = e.target;
		if (!(target instanceof Element)) return;
		if (target.closest(INTERACTIVE)) return;
		// Leave double-click / shift-click text selections alone.
		const selection = target.ownerDocument.getSelection();
		if (selection && !selection.isCollapsed) return;

		const block = closestUnit(target, this.plugin.settings.navigationUnit);
		if (block) {
			if (this.isSelected(block)) this.toggleCollapse(block);
			else this.select(block, { preventScroll: true });
			return;
		}

		// Clicked empty space in the note: keep the current focus and make
		// sure keys reach it again.
		const container = e.currentTarget;
		if (
			container instanceof HTMLElement &&
			this.selectedBlock &&
			container.contains(this.selectedBlock)
		) {
			this.selectedBlock.focus({ preventScroll: true });
		}
	}

	private clientXY(e: MouseEvent | TouchEvent) {
		if (e instanceof MouseEvent) {
			return { x: e.clientX, y: e.clientY };
		} else {
			const touch = e.touches[0] ?? e.changedTouches[0];
			return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
		}
	}

	/**
	 * On keydown, navigate between blocks or toggle collapse.
	 *
	 * @param e {KeyboardEvent} Keyboard event
	 */
	private handleKeyDown(e: KeyboardEvent) {
		if (e.defaultPrevented || e.isComposing) return;
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (!isReadingView(getActiveView(this.plugin))) return;

		const container = e.currentTarget;
		if (!(container instanceof HTMLElement)) return;

		const target = e.target;
		if (
			target instanceof Element &&
			target !== this.selectedBlock &&
			target.closest(INTERACTIVE)
		) {
			return;
		}

		const settings = this.plugin.settings;
		if (this.pressed(settings.nextBlockKeys, e)) {
			e.preventDefault();
			void this.step(1, container);
		} else if (this.pressed(settings.prevBlockKeys, e)) {
			e.preventDefault();
			void this.step(-1, container);
		} else if (this.pressed(settings.toggleCollapseKeys, e)) {
			const block = this.currentBlockIn(container);
			if (!block) return;
			e.preventDefault();
			this.toggleCollapse(block);
		} else if (this.pressed(settings.deselectKeys, e)) {
			if (!this.currentBlockIn(container)) return;
			e.preventDefault();
			this.deselect();
		}
	}

	private pressed(keys: string, e: KeyboardEvent) {
		const keysOrCodes = keys.split(/\s+/).filter(Boolean);
		return keysOrCodes.includes(e.code) || keysOrCodes.includes(e.key);
	}

	/** The selected block, if it is still rendered inside `container`. */
	private currentBlockIn(container: HTMLElement): HTMLElement | null {
		const block = this.selectedBlock;
		if (!block || !block.isConnected || !container.contains(block)) return null;
		return block;
	}

	private scrollBehavior(): ScrollBehavior {
		return this.plugin.settings.smoothScrolling && !prefersReducedMotion()
			? "smooth"
			: "auto";
	}

	/**
	 * Select top block in the view
	 *
	 * @param viewContainer {HTMLElement} View container element
	 */
	selectTopBlockInTheView(viewContainer: HTMLElement, options?: { preventScroll?: boolean }) {
		const scroller =
			viewContainer.querySelector<HTMLElement>(`.${MARKDOWN_PREVIEW_VIEW}`) ??
			viewContainer;
		const { navigationUnit, topMargin } = this.plugin.settings;
		const top = findTopVisibleUnit(scroller, navigationUnit, topMargin);
		if (top) this.select(top, options);
	}

	/**
	 * Toggle collapse.
	 *
	 * @param block Block element
	 */
	private toggleCollapse(block: HTMLElement) {
		const collapseIndicator = block.querySelector(
			COLLAPSE_INDICATORS.join(",")
		) as HTMLElement;
		if (collapseIndicator) {
			collapseIndicator.click();
		}
	}

	/**
	 * Toggle block highlight.
	 */
	async selectedBlockHighlight() {
		if (this.selectedBlock == null) return;
		await this.toggleBlockHighlight(this.selectedBlock);
	}

	/**
	 * Toggles highlight of the given block element.
	 *
	 * @param block Block element to toggle highlight
	 */
	private async toggleBlockHighlight(block: HTMLElement) {
		const view = getActiveView(this.plugin);
		if (view == null || view.file == null) return;
		const editor = view.editor;

		const lineStartStr = block.getAttribute("data-rve-line-start");
		const lineEndStr = block.getAttribute("data-rve-line-end");
		if (!lineStartStr || !lineEndStr) return;

		const lineStart = parseInt(lineStartStr, 10);
		const lineEnd = parseInt(lineEndStr, 10);
		const startPos = { line: lineStart, ch: 0 };
		const endPos = { line: lineEnd, ch: view.editor.getLine(lineEnd).length };
		const selectedText = editor.getRange(startPos, endPos);

		// editor instance might not be initialized
		this.changeMode("source");
		view.containerEl.addClass("bsr-hide-view");

		if (selectedText.startsWith("==") && selectedText.endsWith("==")) {
			editor.replaceRange(selectedText.slice(2, -2), startPos, endPos);
		} else {
			editor.replaceRange("==" + selectedText + "==", startPos, endPos);
		}

		this.changeMode("preview");
		view.containerEl.removeClass("bsr-hide-view");
	}

	private changeMode(mode: MarkdownViewModeType): void {
		const view = getActiveView(this.plugin);
		if (view == null) return;

		const state = view.getState();
		void view.setState({ ...state, mode }, { history: true });
	}
}
