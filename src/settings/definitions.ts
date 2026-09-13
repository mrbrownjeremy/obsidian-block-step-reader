import type { Setting } from "obsidian";
import { t } from "../i18n";
import ReadingViewEnhancer from "../main";
import { buildReadTag, getUserId } from "../reading-state";
import BlockSelectorSettings from "./block";
import KeysSettings from "./keys";
import MiscellaneousSettings from "./miscellaneous";
import SupportSettings from "./support";

interface SettingGroupLike {
	listEl: HTMLElement;
}

export interface SettingDefinitionRender {
	name: string;
	desc?: string;
	searchable?: boolean;
	render: (setting: Setting, group: SettingGroupLike) => void | (() => void);
}

export interface SettingDefinitionEmpty {
	name: string;
	desc?: string;
	aliases?: string[];
	searchable?: boolean;
}

export type SettingDefinitionItem =
	| SettingDefinitionRender
	| SettingDefinitionEmpty;

export function renderSettingsTab(
	containerEl: HTMLElement,
	plugin: ReadingViewEnhancer,
): void {
	containerEl.empty();
	new BlockSelectorSettings(containerEl, plugin);
	new MiscellaneousSettings(containerEl, plugin);
	new KeysSettings(containerEl, plugin);
	new SupportSettings(containerEl, plugin);
}

function searchEntries(plugin: ReadingViewEnhancer): SettingDefinitionEmpty[] {
	return [
		{
			name: "Block color",
			desc: "Set background color of the block in reading view.",
		},
		{
			name: "Block color transparency",
			desc: "Set transparency of the block highlight color.",
		},
		{
			name: "Enable block selector",
			desc: "Restart is needed to apply changes.",
		},
		{
			name: "Disable block selector on mobile",
			desc: "Disable block selector on mobile devices.",
		},
		{
			name: "Always-on collapse indicator",
			desc: "Always show collapse indicators in reading view.",
		},
		{
			name: "Scrollable code",
			desc: "Make code blocks horizontally scrollable in reading view.",
		},
		{
			name: t(plugin, "settings.rememberPosition"),
			desc: t(plugin, "settings.rememberPositionDesc"),
		},
		{
			name: t(plugin, "settings.locale"),
			desc: t(plugin, "settings.localeDesc"),
		},
		{
			name: t(plugin, "settings.userId"),
			desc: t(plugin, "settings.userIdDesc"),
		},
		{
			name: t(plugin, "settings.showProgressBar"),
			desc: t(plugin, "settings.showProgressBarDesc"),
		},
		{
			name: t(plugin, "settings.showStats"),
			desc: t(plugin, "settings.showStatsDesc"),
		},
		{
			name: t(plugin, "settings.autoCenter"),
			desc: t(plugin, "settings.autoCenterDesc"),
		},
		{
			name: t(plugin, "settings.wpm"),
			desc: t(plugin, "settings.wpmDesc"),
		},
		{
			name: t(plugin, "settings.autoMarkRead"),
			desc: t(plugin, "settings.autoMarkReadDesc"),
		},
		{
			name: t(plugin, "settings.syncReadTags"),
			desc: t(plugin, "settings.syncReadTagsDesc", {
				tag: buildReadTag(getUserId(plugin)),
			}),
		},
		{
			name: t(plugin, "library.includeAllNotes"),
			desc: t(plugin, "library.includeAllNotesDesc"),
		},
		{
			name: t(plugin, "settings.libraryDefaultFilter"),
			desc: t(plugin, "settings.libraryDefaultFilterDesc"),
		},
		{
			name: t(plugin, "settings.libraryDefaultSort"),
			desc: t(plugin, "settings.libraryDefaultSortDesc"),
		},
		{
			name: "Next block",
			desc: "Keys to select next block.",
			aliases: ["keyboard", "hotkey"],
		},
		{
			name: "Previous block",
			desc: "Keys to select previous block.",
			aliases: ["keyboard", "hotkey"],
		},
		{
			name: "Toggle collapse",
			desc: "Keys to toggle collapse state of the selected block.",
			aliases: ["keyboard", "hotkey"],
		},
		{
			name: "Deselect block",
			desc: "Keys to deselect the current block.",
			aliases: ["keyboard", "hotkey"],
		},
		{
			name: t(plugin, "settings.buyMeACoffee"),
			desc: t(plugin, "settings.supportDesc"),
		},
	];
}

export function buildSettingDefinitions(
	plugin: ReadingViewEnhancer,
): SettingDefinitionItem[] {
	return [
		{
			name: "Block Step Reader",
			searchable: false,
			render: (_setting, group) => {
				renderSettingsTab(group.listEl, plugin);
			},
		},
		...searchEntries(plugin),
	];
}
