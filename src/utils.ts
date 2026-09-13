import { MarkdownView, WorkspaceLeaf } from "obsidian";
import ReadingViewEnhancer from "./main";

export function getReadingViewContainer(activeView: MarkdownView | null) {
	if (activeView == null) return null;
	return activeView.previewMode.containerEl;
}

export function getSourceViewContainer(activeView: MarkdownView | null) {
	if (activeView == null) return null;
	const container = activeView.containerEl.querySelector(
		".markdown-source-view.mod-cm6, .markdown-source-view",
	);
	return container?.instanceOf(HTMLElement) ? container : null;
}

export function getSourceViewScroller(activeView: MarkdownView | null) {
	if (activeView == null) return null;
	const scroller = activeView.containerEl.querySelector(
		".markdown-source-view.mod-cm6 .cm-scroller, .markdown-source-view .cm-scroller",
	);
	return scroller?.instanceOf(HTMLElement) ? scroller : null;
}

export function isReadingView(activeView: MarkdownView | null) {
	if (activeView == null) return false;
	return activeView.currentMode === activeView.previewMode;
}

export function isEditingView(activeView: MarkdownView | null) {
	if (activeView == null) return false;
	return !isReadingView(activeView);
}

export function getProgressBarContainer(activeView: MarkdownView | null) {
	if (activeView == null) return null;
	// Attach outside the scrollable preview/source so sticky layout cannot
	// reset scroll when the bar updates or images load.
	const viewContent = activeView.containerEl.querySelector(".view-content");
	return viewContent?.instanceOf(HTMLElement)
		? viewContent
		: activeView.containerEl;
}

export function getScrollContainer(activeView: MarkdownView | null) {
	if (activeView == null) return null;
	return isReadingView(activeView)
		? getReadingViewContainer(activeView)
		: getSourceViewScroller(activeView);
}

export function getActiveView(plugin: ReadingViewEnhancer) {
	return plugin.app.workspace.getActiveViewOfType(MarkdownView);
}

export function findMarkdownViewForFile(
	plugin: ReadingViewEnhancer,
	filePath: string,
): MarkdownView | null {
	for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === filePath) {
			return view;
		}
	}
	return null;
}

export function findReadingViewForFile(
	plugin: ReadingViewEnhancer,
	filePath: string,
): MarkdownView | null {
	const view = findMarkdownViewForFile(plugin, filePath);
	if (!view || !isReadingView(view)) return null;
	return view;
}

export function findMarkdownLeafForLibraryOpen(
	plugin: ReadingViewEnhancer,
): WorkspaceLeaf {
	const markdownLeaves = plugin.app.workspace.getLeavesOfType("markdown");
	return markdownLeaves[0] ?? plugin.app.workspace.getLeaf(false);
}

export function applyPreviewScroll(view: MarkdownView, scrollTop: number): void {
	view.previewMode.applyScroll(Math.max(0, scrollTop));
}

export function applySourceScroll(view: MarkdownView, scrollTop: number): void {
	const scroller = getSourceViewScroller(view);
	if (!scroller) return;
	scroller.scrollTop = Math.max(0, scrollTop);
}

export function resolveSourceScrollTop(
	view: MarkdownView,
	state: { scrollTop: number; scrollRatio: number },
): number {
	// Prefer ratio while layout is still settling (same as preview).
	if (state.scrollRatio > 0.001) {
		const scroller = getSourceViewScroller(view);
		if (scroller) {
			const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
			if (maxScroll > 0) return state.scrollRatio * maxScroll;
		}
	}

	if (state.scrollTop > 0) return state.scrollTop;
	return 0;
}

export function resolvePreviewScrollTop(
	view: MarkdownView,
	state: { scrollTop: number; scrollRatio: number },
): number {
	// Prefer ratio: absolute scrollTop is wrong while images/lazy blocks still loading.
	if (state.scrollRatio > 0.001) {
		const container = getReadingViewContainer(view);
		if (container) {
			const scrollable =
				container.scrollHeight > container.clientHeight
					? container
					: (() => {
							let node: HTMLElement | null = container.parentElement;
							while (node) {
								if (node.scrollHeight > node.clientHeight) return node;
								node = node.parentElement;
							}
							return null;
					  })();

			if (scrollable) {
				const maxScroll = Math.max(
					0,
					scrollable.scrollHeight - scrollable.clientHeight,
				);
				if (maxScroll > 0) return state.scrollRatio * maxScroll;
			}
		}
	}

	if (state.scrollTop > 0) return state.scrollTop;
	return 0;
}

export async function waitMs(ms: number): Promise<void> {
	await new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});
}
