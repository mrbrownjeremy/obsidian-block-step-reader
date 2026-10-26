import { PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import ReadingViewEnhancer from "../main";
import { buildSettingDefinitions, onSettingChanged } from "./definitions";
import type { LocaleSetting } from "../i18n";
import type { LibraryFilter, LibrarySort } from "../reading-library/types";
import type { NavigationUnit, ScrollAlignment } from "../block-selector/selection-util";

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
	navigationUnit: NavigationUnit;
	highlightFocused: boolean;
	dimUnfocused: boolean;
	/** Opacity of everything except the focused paragraph, 0–100. */
	unfocusedOpacity: number;
	autoScrollOnFocus: boolean;
	scrollAlignment: ScrollAlignment;
	/** Gap between the focused paragraph and the top of the pane, in px. */
	topMargin: number;
	smoothScrolling: boolean;
	/** Remember where you were in each note, in this plugin's own data. */
	rememberReadingPosition: boolean;
	/** Also write progress and read status into note frontmatter. */
	writeProgressToFrontmatter: boolean;
	showRestoreNotice: boolean;
	readingPositionSaveDelayMs: number;
	readingPositionRestoreDelayMs: number;
	userId: string;
	showReadingProgressBar: boolean;
	showReadingStats: boolean;
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
	navigationUnit: "paragraphs",
	highlightFocused: true,
	dimUnfocused: true,
	unfocusedOpacity: 25,
	autoScrollOnFocus: true,
	scrollAlignment: "top",
	topMargin: 40,
	smoothScrolling: true,
	rememberReadingPosition: true,
	writeProgressToFrontmatter: false,
	showRestoreNotice: false,
	readingPositionSaveDelayMs: 2000,
	readingPositionRestoreDelayMs: 300,
	userId: "default",
	showReadingProgressBar: true,
	showReadingStats: true,
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
 * Settings tab, rendered from declarative definitions (Obsidian 1.13+),
 * so every setting is searchable from the settings search box.
 */
export class RveSettingTab extends PluginSettingTab {
	plugin: ReadingViewEnhancer;

	constructor(plugin: ReadingViewEnhancer) {
		super(plugin.app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return buildSettingDefinitions(this.plugin, this);
	}

	getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	/**
	 * Settings share data.json with saved reading positions, so always save
	 * through the plugin rather than the default (which would drop them).
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
		onSettingChanged(this.plugin, this, key);
	}
}
