import { toHex, toRgba } from "color2k";
import type { PluginSettingTab, SettingDefinitionItem } from "obsidian";
import { SUPPORT_KOFI_URL } from "../constants";
import { t } from "../i18n";
import ReadingViewEnhancer from "../main";
import { buildReadTag, getUserId, runSyncAllReadTagsCommand } from "../reading-state";
import type { LibraryFilter, LibrarySort } from "../reading-library/types";

/** Settings whose change must be reflected in the body classes / CSS vars. */
const STYLE_KEYS = new Set([
	"highlightFocused",
	"dimUnfocused",
	"unfocusedOpacity",
	"scrollAlignment",
	"autoScrollOnFocus",
	"alwaysOnCollapseIndicator",
	"collapseIndicatorOnTheRightSide",
	"alignCheckboxToIndentationGuide",
	"scrollableCode",
]);

export function onSettingChanged(
	plugin: ReadingViewEnhancer,
	tab: PluginSettingTab,
	key: string,
): void {
	if (STYLE_KEYS.has(key)) plugin.applyStyles();
	tab.refreshDomState();
}

export function buildSettingDefinitions(
	plugin: ReadingViewEnhancer,
	tab: PluginSettingTab,
): SettingDefinitionItem[] {
	const s = plugin.settings;
	const save = async () => {
		await plugin.saveSettings();
		plugin.applyStyles();
		tab.refreshDomState();
	};

	return [
		{
			type: "group",
			heading: "Paragraph focus",
			items: [
				{
					name: "Step through",
					desc: "Paragraphs skips headings, tables, code and images and stops on every paragraph and list item. All blocks stops on everything.",
					control: {
						type: "dropdown",
						key: "navigationUnit",
						options: { paragraphs: "Paragraphs", blocks: "All blocks" },
					},
				},
				{
					name: "Highlight focused paragraph",
					desc: "Tint the background of the focused paragraph.",
					control: { type: "toggle", key: "highlightFocused" },
				},
				{
					name: "Highlight color",
					aliases: ["block color", "accent"],
					visible: () => s.highlightFocused,
					render: (setting) => {
						setting.addColorPicker((color) => {
							color.setValue(toHex(s.blockColor.color)).onChange(async (value) => {
								s.blockColor.color = toRgba(value);
								await save();
							});
							setting.addButton((button) =>
								button.setButtonText("Use accent color").onClick(async () => {
									const accent = getComputedStyle(plugin.app.workspace.containerEl)
										.getPropertyValue("--color-accent")
										.trim();
									s.blockColor.color = toRgba(accent);
									color.setValue(toHex(s.blockColor.color));
									await save();
								}),
							);
						});
					},
				},
				{
					name: "Highlight strength",
					aliases: ["transparency", "block color transparency"],
					visible: () => s.highlightFocused,
					render: (setting) => {
						setting.addSlider((slider) =>
							slider
								.setLimits(0, 100, 1)
								.setDynamicTooltip()
								.setValue(s.blockColor.transparency)
								.onChange(async (value) => {
									s.blockColor.transparency = value;
									await save();
								}),
						);
					},
				},
				{
					name: "Dim surrounding content",
					desc: "Fade everything in the note except the focused paragraph. The rest of Obsidian is left alone.",
					control: { type: "toggle", key: "dimUnfocused" },
				},
				{
					name: "Surrounding content opacity",
					desc: "0% hides it completely, 100% leaves it untouched.",
					aliases: ["dim", "fade"],
					visible: () => s.dimUnfocused,
					control: {
						type: "slider",
						key: "unfocusedOpacity",
						min: 0,
						max: 100,
						step: 5,
						displayFormat: (value) => `${value}%`,
					},
				},
			],
		},
		{
			type: "group",
			heading: "Scrolling",
			items: [
				{
					name: "Scroll to the focused paragraph",
					desc: "When you move with the keyboard, scroll the note so the new paragraph is in place. Clicking a paragraph never scrolls.",
					aliases: ["auto-scroll", "auto-center"],
					control: { type: "toggle", key: "autoScrollOnFocus" },
				},
				{
					name: "Position",
					desc: "Top puts the paragraph's first line at the top of the pane. Center centers it. Nearest scrolls only as far as needed to show it. Paragraphs taller than the pane always start at the top.",
					aliases: ["alignment", "scroll alignment"],
					visible: () => s.autoScrollOnFocus,
					control: {
						type: "dropdown",
						key: "scrollAlignment",
						options: { top: "Top", center: "Center", nearest: "Nearest" },
					},
				},
				{
					name: "Top margin",
					desc: "Space left above the focused paragraph.",
					visible: () => s.autoScrollOnFocus && s.scrollAlignment !== "center",
					control: {
						type: "slider",
						key: "topMargin",
						min: 0,
						max: 200,
						step: 4,
						displayFormat: (value) => `${value} px`,
					},
				},
				{
					name: "Smooth scrolling",
					desc: "Animate the scroll. Turned off automatically when macOS is set to reduce motion.",
					visible: () => s.autoScrollOnFocus,
					control: { type: "toggle", key: "smoothScrolling" },
				},
			],
		},
		{
			type: "group",
			heading: "Keys",
			items: [
				{
					name: "How keys work",
					desc: "These keys work in Reading view while the note has focus. Separate alternatives with spaces, using key or code names such as ArrowDown or KeyJ. To use other shortcuts, assign the “Focus next paragraph”, “Focus previous paragraph” and “Clear paragraph focus” commands in Settings → Hotkeys.",
					searchable: false,
				},
				{
					name: "Next paragraph",
					aliases: ["next block", "keyboard", "hotkey"],
					control: { type: "text", key: "nextBlockKeys", placeholder: "ArrowDown KeyJ" },
				},
				{
					name: "Previous paragraph",
					aliases: ["previous block", "keyboard", "hotkey"],
					control: { type: "text", key: "prevBlockKeys", placeholder: "ArrowUp KeyK" },
				},
				{
					name: "Clear focus",
					aliases: ["deselect", "keyboard", "hotkey"],
					control: { type: "text", key: "deselectKeys", placeholder: "Escape" },
				},
				{
					name: "Fold or unfold",
					desc: "Folds the focused heading, list item or callout.",
					aliases: ["toggle collapse", "keyboard", "hotkey"],
					control: { type: "text", key: "toggleCollapseKeys", placeholder: "ArrowLeft ArrowRight" },
				},
			],
		},
		{
			type: "group",
			heading: "Reading position",
			items: [
				{
					name: "Remember reading position",
					desc: "Reopen each note at the paragraph you were on. Stored in this plugin's own data, never in your notes.",
					control: { type: "toggle", key: "rememberReadingPosition" },
				},
				{
					name: t(plugin, "settings.showRestoreNotice"),
					desc: t(plugin, "settings.showRestoreNoticeDesc"),
					visible: () => s.rememberReadingPosition,
					control: { type: "toggle", key: "showRestoreNotice" },
				},
				{
					name: "Focus the top paragraph when opening a note",
					desc: "If a note has no saved position, focus the first paragraph on screen.",
					aliases: ["auto-select top block"],
					control: { type: "toggle", key: "autoSelectTopBlock" },
				},
				{
					name: t(plugin, "settings.saveDelay"),
					desc: "How long to wait after you move before remembering the position.",
					visible: () => s.rememberReadingPosition,
					control: { type: "number", key: "readingPositionSaveDelayMs", min: 100, max: 5000, step: 100 },
				},
				{
					name: t(plugin, "settings.restoreDelay"),
					desc: t(plugin, "settings.restoreDelayDesc"),
					visible: () => s.rememberReadingPosition,
					control: { type: "number", key: "readingPositionRestoreDelayMs", min: 0, max: 3000, step: 50 },
				},
			],
		},
		{
			type: "group",
			heading: "Progress in notes",
			items: [
				{
					name: "Save progress to note frontmatter",
					desc: "Off keeps your notes untouched. On writes progress and read status into each note's YAML properties (under bsr), which the reading library and read tags need.",
					aliases: ["save reading progress", "frontmatter", "yaml", "properties"],
					control: { type: "toggle", key: "writeProgressToFrontmatter" },
				},
				{
					name: t(plugin, "settings.userId"),
					desc: t(plugin, "settings.userIdDesc"),
					visible: () => s.writeProgressToFrontmatter,
					control: { type: "text", key: "userId", placeholder: "default" },
				},
				{
					name: t(plugin, "settings.autoMarkRead"),
					desc: t(plugin, "settings.autoMarkReadDesc"),
					visible: () => s.writeProgressToFrontmatter,
					control: { type: "toggle", key: "autoMarkReadAtEnd" },
				},
				{
					name: t(plugin, "settings.syncReadTags"),
					desc: t(plugin, "settings.syncReadTagsDesc", { tag: buildReadTag(getUserId(plugin)) }),
					visible: () => s.writeProgressToFrontmatter,
					control: { type: "toggle", key: "syncReadTags" },
				},
				{
					name: t(plugin, "settings.syncReadTagsNow"),
					desc: t(plugin, "settings.syncReadTagsNowDesc"),
					visible: () => s.writeProgressToFrontmatter && s.syncReadTags,
					action: () => {
						void runSyncAllReadTagsCommand(plugin);
					},
				},
			],
		},
		{
			type: "group",
			heading: "Progress bar",
			items: [
				{
					name: t(plugin, "settings.showProgressBar"),
					desc: t(plugin, "settings.showProgressBarDesc"),
					control: { type: "toggle", key: "showReadingProgressBar" },
				},
				{
					name: t(plugin, "settings.showStats"),
					desc: t(plugin, "settings.showStatsDesc"),
					visible: () => s.showReadingProgressBar,
					control: { type: "toggle", key: "showReadingStats" },
				},
				{
					name: t(plugin, "settings.wpm"),
					desc: "Used to estimate the reading time left.",
					visible: () => s.showReadingProgressBar,
					control: { type: "number", key: "wordsPerMinute", min: 50, max: 2000, step: 10 },
				},
			],
		},
		{
			type: "group",
			heading: t(plugin, "library.title"),
			items: [
				{
					name: t(plugin, "library.includeAllNotes"),
					desc: t(plugin, "library.includeAllNotesDesc"),
					control: { type: "toggle", key: "libraryIncludeAllNotes" },
				},
				{
					name: t(plugin, "settings.libraryDefaultFilter"),
					desc: t(plugin, "settings.libraryDefaultFilterDesc"),
					control: { type: "dropdown", key: "libraryDefaultFilter", options: filterOptions(plugin) },
				},
				{
					name: t(plugin, "settings.libraryDefaultSort"),
					desc: t(plugin, "settings.libraryDefaultSortDesc"),
					control: { type: "dropdown", key: "libraryDefaultSort", options: sortOptions(plugin) },
				},
			],
		},
		{
			type: "group",
			heading: "Other",
			items: [
				{
					name: "Always show fold arrows",
					aliases: ["collapse indicator"],
					desc: "Keep the fold arrows next to headings and lists visible in Reading view.",
					control: { type: "toggle", key: "alwaysOnCollapseIndicator" },
				},
				{
					name: "Fold arrows on the right (experimental)",
					aliases: ["collapse indicator"],
					desc: "Move fold arrows to the right side. May shift some layouts.",
					control: { type: "toggle", key: "collapseIndicatorOnTheRightSide" },
				},
				{
					name: "Align checkboxes to indentation guides",
					control: { type: "toggle", key: "alignCheckboxToIndentationGuide" },
				},
				{
					name: "Scrollable code blocks",
					desc: "Scroll long code lines sideways instead of wrapping them.",
					control: { type: "toggle", key: "scrollableCode" },
				},
				{
					name: "Enable paragraph focus",
					desc: "Turn off to keep only the other features. Reopen notes to apply.",
					aliases: ["block selector"],
					control: { type: "toggle", key: "enableBlockSelector" },
				},
				{
					name: "Turn off paragraph focus on mobile",
					aliases: ["block selector"],
					control: { type: "toggle", key: "disableBlockSelectorOnMobile" },
				},
				{
					name: t(plugin, "settings.locale"),
					desc: t(plugin, "settings.localeDesc"),
					control: {
						type: "dropdown",
						key: "locale",
						options: {
							auto: t(plugin, "settings.locale.auto"),
							en: t(plugin, "settings.locale.en"),
							"zh-CN": t(plugin, "settings.locale.zhCN"),
							"zh-TW": t(plugin, "settings.locale.zhTW"),
						},
					},
				},
				{
					name: `About ${plugin.manifest.name} ${plugin.manifest.version}`,
					desc: "A fork of Block Step Reader by gorf. Support the original author on Ko-fi.",
					searchable: false,
					action: () => {
						window.open(SUPPORT_KOFI_URL, "_blank");
					},
				},
			],
		},
	];
}

function filterOptions(plugin: ReadingViewEnhancer): Record<LibraryFilter, string> {
	return {
		all: t(plugin, "library.filter.all"),
		reading: t(plugin, "library.filter.reading"),
		unread: t(plugin, "library.filter.unread"),
		read: t(plugin, "library.filter.read"),
	};
}

function sortOptions(plugin: ReadingViewEnhancer): Record<LibrarySort, string> {
	return {
		updated: t(plugin, "library.sort.updated"),
		"progress-desc": t(plugin, "library.sort.progressDesc"),
		"progress-asc": t(plugin, "library.sort.progressAsc"),
		title: t(plugin, "library.sort.title"),
		finished: t(plugin, "library.sort.finished"),
		remaining: t(plugin, "library.sort.remaining"),
	};
}
