import { MarkdownView, TFile } from "obsidian";
import ReadingViewEnhancer from "src/main";
import {
	BSR_FRONTMATTER_KEY,
	DEFAULT_USER_READING_STATE,
	type UserReadingState,
} from "./types";
import { computeProgressFromLine, countReadingUnits } from "./stats";
import { applyReadTagToFrontmatter } from "./read-tags";

export function getUserId(plugin: ReadingViewEnhancer): string {
	const id = plugin.settings.userId.trim();
	return id.length > 0 ? id : "default";
}

export function readUserStateFromCache(
	plugin: ReadingViewEnhancer,
	file: TFile,
): UserReadingState | null {
	const cache = plugin.app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter as unknown;
	if (!isRecord(frontmatter)) return null;

	const bsr = frontmatter[BSR_FRONTMATTER_KEY];
	if (!isRecord(bsr)) return null;

	const userId = getUserId(plugin);
	const raw = bsr[userId];
	if (!isRecord(raw)) return null;

	return normalizeUserState(raw);
}

export async function writeUserState(
	plugin: ReadingViewEnhancer,
	file: TFile,
	patch: Partial<UserReadingState>,
): Promise<void> {
	if (!plugin.settings.writeProgressToFrontmatter) return;
	const userId = getUserId(plugin);

	await plugin.app.fileManager.processFrontMatter(file, (rawFrontmatter) => {
		const frontmatter = rawFrontmatter as unknown;
		if (!isRecord(frontmatter)) return;

		const existingBsr = frontmatter[BSR_FRONTMATTER_KEY];
		const bsr: Record<string, unknown> = isRecord(existingBsr)
			? existingBsr
			: {};

		const userRaw = bsr[userId];
		const current = normalizeUserState(isRecord(userRaw) ? userRaw : {});
		const merged = { ...current, ...patch, updatedAt: Date.now() };
		bsr[userId] = merged;
		frontmatter[BSR_FRONTMATTER_KEY] = bsr;

		if (plugin.settings.syncReadTags) {
			applyReadTagToFrontmatter(frontmatter, userId, merged.read);
		}
	});
}

export async function markAsRead(
	plugin: ReadingViewEnhancer,
	file: TFile,
	totalWords: number,
): Promise<void> {
	await writeUserState(plugin, file, {
		read: true,
		finished: new Date().toISOString().slice(0, 10),
		progress: 1,
		totalWords,
		wordsRead: totalWords,
	});
}

export async function markAsUnread(
	plugin: ReadingViewEnhancer,
	file: TFile,
): Promise<void> {
	await writeUserState(plugin, file, {
		read: false,
		finished: null,
	});
}

export async function getFileText(
	plugin: ReadingViewEnhancer,
	file: TFile,
): Promise<string> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (view?.file?.path === file.path) {
		return view.editor.getValue();
	}
	return plugin.app.vault.read(file);
}

export async function getFileReadingUnitsAsync(
	plugin: ReadingViewEnhancer,
	file: TFile,
): Promise<number> {
	const text = await getFileText(plugin, file);
	return countReadingUnits(stripFrontmatter(text));
}

export function buildPositionPatch(
	lineStart: number,
	scrollRatio: number,
	totalLines: number,
	totalWords: number,
	scrollTop = 0,
): Partial<UserReadingState> {
	const progress = computeProgressFromLine(lineStart, totalLines);
	const wordsRead = Math.round(totalWords * progress);

	return {
		lineStart,
		scrollRatio,
		scrollTop,
		progress,
		totalWords,
		wordsRead,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripFrontmatter(text: string): string {
	const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return match ? text.slice(match[0].length) : text;
}

function normalizeUserState(raw: Record<string, unknown>): UserReadingState {
	return {
		progress: toNumber(raw.progress, DEFAULT_USER_READING_STATE.progress),
		lineStart: toNumber(raw.lineStart, DEFAULT_USER_READING_STATE.lineStart),
		scrollRatio: toNumber(
			raw.scrollRatio,
			DEFAULT_USER_READING_STATE.scrollRatio,
		),
		scrollTop: toNumber(raw.scrollTop, DEFAULT_USER_READING_STATE.scrollTop),
		updatedAt: toNumber(raw.updatedAt, DEFAULT_USER_READING_STATE.updatedAt),
		read: Boolean(raw.read),
		finished:
			typeof raw.finished === "string" && raw.finished.length > 0
				? raw.finished
				: null,
		totalWords: toNumber(
			raw.totalWords,
			DEFAULT_USER_READING_STATE.totalWords,
		),
		wordsRead: toNumber(raw.wordsRead, DEFAULT_USER_READING_STATE.wordsRead),
	};
}

function toNumber(value: unknown, fallback: number): number {
	if (typeof value === "number" && !Number.isNaN(value)) return value;
	if (typeof value === "string") {
		const parsed = parseFloat(value);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return fallback;
}
