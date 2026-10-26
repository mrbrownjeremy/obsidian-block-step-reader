import { Notice, TFile } from "obsidian";
import { t } from "src/i18n";
import ReadingViewEnhancer from "src/main";
import { getUserId, readUserStateFromCache } from "./frontmatter";

const BSR_TAG_PREFIX = "bsr";

/** Build tag `bsr/{userId}/read` for IRN exclude-tags and similar integrations. */
export function buildReadTag(userId: string): string {
	const safeId = sanitizeUserIdForTag(userId);
	return `${BSR_TAG_PREFIX}/${safeId}/read`;
}

export function sanitizeUserIdForTag(userId: string): string {
	const trimmed = userId.trim();
	if (!trimmed) return "default";
	return trimmed.replace(/[#,\s/]/g, "-");
}

export function applyReadTagToFrontmatter(
	frontmatter: Record<string, unknown>,
	userId: string,
	read: boolean,
): void {
	const readTag = buildReadTag(userId);
	const tags = normalizeTags(frontmatter.tags);
	const withoutMine = tags.filter((tag) => tag !== readTag);

	if (read) {
		withoutMine.push(readTag);
	}

	if (withoutMine.length > 0) {
		frontmatter.tags = withoutMine;
	} else if ("tags" in frontmatter) {
		delete frontmatter.tags;
	}
}

export async function syncReadTagsForFile(
	plugin: ReadingViewEnhancer,
	file: TFile,
	read: boolean,
): Promise<void> {
	if (!plugin.settings.writeProgressToFrontmatter || !plugin.settings.syncReadTags) return;

	const userId = getUserId(plugin);
	await plugin.app.fileManager.processFrontMatter(file, (rawFrontmatter) => {
		const frontmatter = rawFrontmatter as unknown;
		if (!isRecord(frontmatter)) return;
		applyReadTagToFrontmatter(frontmatter, userId, read);
	});
}

export async function syncAllReadTags(
	plugin: ReadingViewEnhancer,
): Promise<number> {
	if (!plugin.settings.writeProgressToFrontmatter || !plugin.settings.syncReadTags) return 0;

	const userId = getUserId(plugin);
	let updated = 0;

	for (const file of plugin.app.vault.getMarkdownFiles()) {
		const state = readUserStateFromCache(plugin, file);
		if (!state) continue;

		let changed = false;
		await plugin.app.fileManager.processFrontMatter(file, (rawFrontmatter) => {
			const frontmatter = rawFrontmatter as unknown;
			if (!isRecord(frontmatter)) return;

			const before = normalizeTags(frontmatter.tags);
			applyReadTagToFrontmatter(frontmatter, userId, state.read);
			const after = normalizeTags(frontmatter.tags);
			changed = JSON.stringify(before) !== JSON.stringify(after);
		});

		if (changed) updated++;
	}

	return updated;
}

export async function runSyncAllReadTagsCommand(
	plugin: ReadingViewEnhancer,
): Promise<void> {
	const count = await syncAllReadTags(plugin);
	new Notice(t(plugin, "notice.readTagsSynced", { count: String(count) }));
}

function normalizeTags(tags: unknown): string[] {
	if (Array.isArray(tags)) {
		return tags.map((tag) => String(tag).replace(/^#/, "").trim()).filter(Boolean);
	}
	if (typeof tags === "string") {
		return tags
			.split(/[,，\s]+/)
			.map((tag) => tag.replace(/^#/, "").trim())
			.filter(Boolean);
	}
	return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
