import { PluginSettingTab } from "obsidian";
import ReadingViewEnhancer from "../main";
import {
	buildSettingDefinitions,
	renderSettingsTab,
	type SettingDefinitionItem,
} from "./definitions";
import type { LocaleSetting } from "../i18n";
import type { LibraryFilter, LibrarySort } from "../reading-library/types";

export interface RveSettings {
	blockColor: {
		color: string;
		transparency: number;
	};
	enableBlockSelector: boolean;
	disableBlockSelectorOnMobile: boolean;
	alwaysOnCollapseIndicator: boolean;
	scrollableCode: boolean;
	autoSelectTopBlock: boolean;
	collapseIndicatorOnTheRightSide: boolean;
	alignCheckboxToIndentationGuide: boolean;
	nextBlockKeys: string;
	prevBlockKeys: string;
	toggleCollapseKeys: string;
	deselectKeys: string;
	rememberReadingPosition: boolean;
	showRestoreNotice: boolean;
	readingPositionSaveDelayMs: number;
	readingPositionRestoreDelayMs: number;
	userId: string;
	showReadingProgressBar: boolean;
	showReadingStats: boolean;
	autoCenterBlock: boolean;
	wordsPerMinute: number;
	autoMarkReadAtEnd: boolean;
	locale: LocaleSetting;
	libraryDefaultFilter: LibraryFilter;
	libraryDefaultSort: LibrarySort;
	libraryIncludeAllNotes: boolean;
	syncReadTags: boolean;
}

export const DEFAULT_SETTINGS: RveSettings = {
	blockColor: {
		color: "rgba(139, 108, 239, 1)", // Obsidian default color
		transparency: 20,
	},
	enableBlockSelector: true,
	disableBlockSelectorOnMobile: false,
	alwaysOnCollapseIndicator: false,
	scrollableCode: false,
	autoSelectTopBlock: false,
	collapseIndicatorOnTheRightSide: false,
	alignCheckboxToIndentationGuide: false,
	nextBlockKeys: "ArrowDown KeyJ",
	prevBlockKeys: "ArrowUp KeyK",
	toggleCollapseKeys: "ArrowLeft ArrowRight KeyH KeyL",
	deselectKeys: "Escape",
	rememberReadingPosition: true,
	showRestoreNotice: false,
	readingPositionSaveDelayMs: 2000,
	readingPositionRestoreDelayMs: 300,
	userId: "default",
	showReadingProgressBar: true,
	showReadingStats: true,
	autoCenterBlock: true,
	wordsPerMinute: 300,
	autoMarkReadAtEnd: false,
	locale: "auto",
	libraryDefaultFilter: "all",
	libraryDefaultSort: "updated",
	libraryIncludeAllNotes: false,
	syncReadTags: true,
};

// ===================================================================

/**
 * Settings tab.
 * In this tab, you can change settings.
 *
 * - Block color
 * - Enable/Disable Block Selector
 */
export class RveSettingTab extends PluginSettingTab {
	plugin: ReadingViewEnhancer;

	constructor(plugin: ReadingViewEnhancer) {
		super(plugin.app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return buildSettingDefinitions(this.plugin);
	}

	/**
	 * Displays settings tab.
	 */
	display() {
		renderSettingsTab(this.containerEl, this.plugin);
	}
}
