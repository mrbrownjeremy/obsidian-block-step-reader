import { BLOCK_ATTR, PARAGRAPH_ATTR } from "../constants";

export type NavigationUnit = "paragraphs" | "blocks";
export type ScrollAlignment = "top" | "center" | "nearest";

/** Lines of the previous screen kept visible when paging through a tall block. */
const PAGE_OVERLAP = 48;

export function unitAttr(unit: NavigationUnit): string {
	return unit === "paragraphs" ? PARAGRAPH_ATTR : BLOCK_ATTR;
}

export function isUnit(element: Element, unit: NavigationUnit): boolean {
	return element.getAttribute(unitAttr(unit)) === "true";
}

/**
 * The closest navigable unit containing `target`, or null.
 */
export function closestUnit(
	target: Element,
	unit: NavigationUnit,
): HTMLElement | null {
	const found = target.closest(`[${unitAttr(unit)}="true"]`);
	return found instanceof HTMLElement ? found : null;
}

/**
 * Navigable units currently rendered in the reading view, in document order.
 * Obsidian only keeps the sections near the viewport in the DOM, so this list
 * is short even for very long notes. Units hidden by a collapsed heading or
 * callout are skipped.
 */
export function getRenderedUnits(
	scroller: HTMLElement,
	unit: NavigationUnit,
): HTMLElement[] {
	return Array.from(
		scroller.querySelectorAll<HTMLElement>(`[${unitAttr(unit)}="true"]`),
	).filter((el) => el.getClientRects().length > 0);
}

export function findAdjacentUnit(
	scroller: HTMLElement,
	current: HTMLElement,
	unit: NavigationUnit,
	direction: 1 | -1,
): HTMLElement | null {
	const units = getRenderedUnits(scroller, unit);
	const index = units.indexOf(current);
	if (index >= 0) return units[index + direction] ?? null;

	// Current block is not a unit in this mode (e.g. the mode just changed):
	// pick the first unit after / last unit before it in document order.
	if (direction === 1) {
		return (
			units.find(
				(el) =>
					current.compareDocumentPosition(el) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			) ?? null
		);
	}
	for (let i = units.length - 1; i >= 0; i--) {
		if (
			current.compareDocumentPosition(units[i]) &
			Node.DOCUMENT_POSITION_PRECEDING
		) {
			return units[i];
		}
	}
	return null;
}

/**
 * First unit whose bottom is below the reading line (top of the scroller
 * plus the top margin) — i.e. the paragraph the reader is looking at.
 */
export function findTopVisibleUnit(
	scroller: HTMLElement,
	unit: NavigationUnit,
	topMargin: number,
): HTMLElement | null {
	const line = scroller.getBoundingClientRect().top + Math.min(topMargin, 40);
	const units = getRenderedUnits(scroller, unit);
	return units.find((el) => el.getBoundingClientRect().bottom > line + 4) ?? null;
}

export function isOutsideViewport(block: HTMLElement, scroller: HTMLElement): boolean {
	const rect = block.getBoundingClientRect();
	const view = scroller.getBoundingClientRect();
	return rect.bottom <= view.top || rect.top >= view.bottom;
}

/**
 * True when the block is taller than the reading area and part of it is
 * still hidden in the given direction. Used to page through long paragraphs
 * before moving on, so nothing is skipped.
 */
export function hasHiddenPart(
	block: HTMLElement,
	scroller: HTMLElement,
	topMargin: number,
	direction: 1 | -1,
): boolean {
	const rect = block.getBoundingClientRect();
	const view = scroller.getBoundingClientRect();
	if (direction === 1) return rect.bottom > view.bottom + 1;
	return rect.top < view.top + topMargin - 1;
}

/**
 * Scroll by one screen within a tall block, never past its start or end.
 */
export function pageTarget(
	block: HTMLElement,
	scroller: HTMLElement,
	topMargin: number,
	direction: 1 | -1,
): number {
	const rect = block.getBoundingClientRect();
	const view = scroller.getBoundingClientRect();
	const page = Math.max(80, scroller.clientHeight - topMargin - PAGE_OVERLAP);
	let delta: number;
	if (direction === 1) {
		delta = Math.min(page, rect.bottom - view.bottom);
	} else {
		delta = -Math.min(page, view.top + topMargin - rect.top);
	}
	return scroller.scrollTop + delta;
}

/**
 * Compute where the scroller should be so the block sits at the requested
 * alignment. Returns null when no scrolling is needed.
 */
export function targetScrollTop(
	block: HTMLElement,
	scroller: HTMLElement,
	alignment: ScrollAlignment,
	topMargin: number,
): number | null {
	const rect = block.getBoundingClientRect();
	const view = scroller.getBoundingClientRect();
	const height = scroller.clientHeight;
	const margin = Math.max(0, Math.min(200, topMargin));
	const tall = rect.height > height - margin;
	const topDelta = rect.top - view.top - margin;

	let delta: number;
	if (alignment === "top" || tall) {
		delta = topDelta;
	} else if (alignment === "center") {
		delta = rect.top + rect.height / 2 - (view.top + height / 2);
	} else {
		const bottomDelta = rect.bottom - (view.top + height - margin);
		if (topDelta < 0) delta = topDelta;
		else if (bottomDelta > 0) delta = bottomDelta;
		else return null;
	}

	if (Math.abs(delta) < 1) return null;
	const max = scroller.scrollHeight - scroller.clientHeight;
	return Math.max(0, Math.min(max, scroller.scrollTop + delta));
}

export function scrollToTop(
	scroller: HTMLElement,
	top: number,
	behavior: ScrollBehavior,
): void {
	if (behavior === "smooth") {
		scroller.scrollTo({ top, behavior });
	} else {
		scroller.scrollTop = top;
	}
}

export function isAtScrollEnd(scroller: HTMLElement, direction: 1 | -1): boolean {
	if (direction === -1) return scroller.scrollTop <= 0;
	return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
}

export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		window.requestAnimationFrame(() => resolve());
	});
}
