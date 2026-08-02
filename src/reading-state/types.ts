/** Frontmatter key for per-user reading state in shared vaults. */
export const BSR_FRONTMATTER_KEY = "bsr";

export interface UserReadingState {
	progress: number;
	lineStart: number;
	scrollRatio: number;
	scrollTop: number;
	updatedAt: number;
	read: boolean;
	finished: string | null;
	totalWords: number;
	wordsRead: number;
}

export interface ReadingStats {
	progress: number;
	totalWords: number;
	wordsRead: number;
	remainingMinutes: number;
	read: boolean;
	finished: string | null;
}

export const DEFAULT_USER_READING_STATE: UserReadingState = {
	progress: 0,
	lineStart: 0,
	scrollRatio: 0,
	scrollTop: 0,
	updatedAt: 0,
	read: false,
	finished: null,
	totalWords: 0,
	wordsRead: 0,
};
