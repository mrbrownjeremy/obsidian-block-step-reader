import ReadingViewEnhancer from "src/main";
import {
	getActiveView,
	getReadingViewContainer,
	isReadingView,
} from "src/utils";
import { MarkdownView, Platform } from "obsidian";
import { t } from "src/i18n";
import { activateReadingLibrary } from "src/reading-library";
import { runSyncAllReadTagsCommand } from "src/reading-state";
import type { RveCommand } from ".";

export const rerenderAllReadingViews: RveCommand = (
	plugin: ReadingViewEnhancer,
) => ({
	id: "rerender-all-reading-views",
	name: t(plugin, "cmd.rerender"),
	callback: () => {
		const { workspace } = plugin.app;
		workspace.getLeavesOfType("markdown").forEach((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.getState().mode === "preview") {
				view.previewMode.rerender(true);
			}
		});
	},
});

export const selectTopBlockInTheView: RveCommand = (
	plugin: ReadingViewEnhancer,
) => ({
	id: "select-top-block-in-the-view",
	name: t(plugin, "cmd.selectTopBlock"),
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (checking) {
			if (!isReadingView(activeView)) return false;
			else if (isNotEnabled(plugin)) return false;
			else if (isMobileAndDisabled(plugin)) return false;
			else return true;
		} else {
			const container = getReadingViewContainer(activeView);
			if (container) {
				plugin.blockSelector.selectTopBlockInTheView(container);
			}

			return true;
		}
	},
});

const focusCommand = (
	id: string,
	name: string,
	run: (plugin: ReadingViewEnhancer, container: HTMLElement) => void,
): RveCommand => (plugin: ReadingViewEnhancer) => ({
	id,
	name,
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (!isReadingView(activeView)) return false;
		if (isNotEnabled(plugin) || isMobileAndDisabled(plugin)) return false;
		const container = getReadingViewContainer(activeView);
		if (!container) return false;
		if (!checking) run(plugin, container);
		return true;
	},
});

export const focusNextParagraph = focusCommand(
	"focus-next-paragraph",
	"Focus next paragraph",
	(plugin, container) => void plugin.blockSelector.selectionHandler.step(1, container),
);

export const focusPreviousParagraph = focusCommand(
	"focus-previous-paragraph",
	"Focus previous paragraph",
	(plugin, container) => void plugin.blockSelector.selectionHandler.step(-1, container),
);

export const clearParagraphFocus = focusCommand(
	"clear-paragraph-focus",
	"Clear paragraph focus",
	(plugin) => plugin.blockSelector.selectionHandler.deselect(),
);

export const saveReadingPosition: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "save-reading-position",
	name: t(plugin, "cmd.savePosition"),
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (checking) {
			return Boolean(activeView?.file) && !isNotEnabled(plugin);
		}
		void plugin.readingPosition.saveNow();
		return true;
	},
});

export const restoreReadingPosition: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "restore-reading-position",
	name: t(plugin, "cmd.restorePosition"),
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (checking) {
			return Boolean(activeView?.file) && !isNotEnabled(plugin);
		}
		void plugin.readingPosition.restoreNow(plugin.blockSelector.selectionHandler);
		return true;
	},
});

export const clearReadingPositions: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "clear-reading-positions",
	name: t(plugin, "cmd.clearPositions"),
	callback: () => {
		plugin.readingPosition.clearAll();
	},
});

export const markNoteAsRead: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "mark-note-as-read",
	name: t(plugin, "cmd.markRead"),
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (checking) {
			return Boolean(activeView?.file) && !isNotEnabled(plugin);
		}
		void plugin.readingPosition.markCurrentAsRead();
		return true;
	},
});

export const markNoteAsUnread: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "mark-note-as-unread",
	name: t(plugin, "cmd.markUnread"),
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (checking) {
			return Boolean(activeView?.file) && !isNotEnabled(plugin);
		}
		void plugin.readingPosition.markCurrentAsUnread();
		return true;
	},
});

export const toggleBlockHighlight: RveCommand = (
	plugin: ReadingViewEnhancer,
) => ({
	id: "toggle-block-highlight",
	name: t(plugin, "cmd.toggleHighlight"),
	checkCallback: (checking: boolean): boolean => {
		const activeView = getActiveView(plugin);
		if (checking) {
			if (!isReadingView(activeView)) return false;
			else if (isNotEnabled(plugin)) return false;
			else if (isMobileAndDisabled(plugin)) return false;
			else return true;
		} else {
			const container = getReadingViewContainer(activeView);
			if (container) {
				plugin.blockSelector.toggleBlockHighlight();
			}

			return true;
		}
	},
});

export const openReadingLibrary: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "open-reading-library",
	name: t(plugin, "cmd.openLibrary"),
	callback: () => {
		void activateReadingLibrary(plugin);
	},
});

export const focusReadingLibrary: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "focus-reading-library",
	name: t(plugin, "cmd.focusLibrary"),
	callback: () => {
		void activateReadingLibrary(plugin);
	},
});

export const syncReadTags: RveCommand = (plugin: ReadingViewEnhancer) => ({
	id: "sync-read-tags",
	name: t(plugin, "cmd.syncReadTags"),
	callback: () => {
		void runSyncAllReadTagsCommand(plugin);
	},
});

const isNotEnabled = (plugin: ReadingViewEnhancer) => {
	return !plugin.settings.enableBlockSelector;
};

const isMobileAndDisabled = (plugin: ReadingViewEnhancer) => {
	return (
		(Platform.isMobile || Platform.isMobileApp) &&
		plugin.settings.disableBlockSelectorOnMobile
	);
};

export const COMMAND_FACTORIES: RveCommand[] = [
	rerenderAllReadingViews,
	selectTopBlockInTheView,
	focusNextParagraph,
	focusPreviousParagraph,
	clearParagraphFocus,
	saveReadingPosition,
	restoreReadingPosition,
	clearReadingPositions,
	markNoteAsRead,
	markNoteAsUnread,
	toggleBlockHighlight,
	openReadingLibrary,
	focusReadingLibrary,
	syncReadTags,
];
