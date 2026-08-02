import { t, formatRemainingTime } from "src/i18n";
import ReadingViewEnhancer from "src/main";
import { formatProgressPercent, type ReadingStats } from "src/reading-state";
import { setProgressWidth } from "src/styles";
import { getActiveView, getProgressBarContainer } from "src/utils";

const PROGRESS_BAR_CLASS = "bsr-progress-bar";

export default class ReadingProgressBar {
	private plugin: ReadingViewEnhancer;
	private barEl: HTMLElement | null = null;
	private fillEl: HTMLElement | null = null;
	private labelEl: HTMLElement | null = null;
	private boundHost: HTMLElement | null = null;

	constructor(plugin: ReadingViewEnhancer) {
		this.plugin = plugin;
	}

	activate() {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.attachToActiveView();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.attachToActiveView();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on("changed", (file) => {
				const view = getActiveView(this.plugin);
				if (view?.file?.path === file.path) {
					this.refreshFromCache();
				}
			}),
		);
	}

	update(stats: ReadingStats) {
		if (!this.plugin.settings.showReadingProgressBar) {
			this.hide();
			return;
		}

		this.ensureBar();
		if (!this.fillEl || !this.labelEl) return;

		setProgressWidth(this.fillEl, stats.progress);

		const parts: string[] = [formatProgressPercent(stats.progress)];

		if (this.plugin.settings.showReadingStats) {
			parts.push(formatRemainingTime(this.plugin, stats.remainingMinutes));
			parts.push(
				stats.read
					? t(this.plugin, "common.read")
					: t(this.plugin, "common.unread"),
			);
			if (stats.read && stats.finished) {
				parts.push(stats.finished);
			}
		}

		this.labelEl.setText(parts.join(" · "));
		this.barEl?.removeClass("bsr-progress-bar-hidden");
	}

	hide() {
		this.barEl?.addClass("bsr-progress-bar-hidden");
	}

	private refreshFromCache() {
		const view = getActiveView(this.plugin);
		if (!view?.file) return;
		const state = this.plugin.readingPosition.getCachedStats(view.file.path);
		if (state) this.update(state);
	}

	private attachToActiveView() {
		const view = getActiveView(this.plugin);
		const container = getProgressBarContainer(view);
		if (!container) {
			this.detach();
			return;
		}

		if (container === this.boundHost) return;

		this.detach();
		this.boundHost = container;
		this.ensureBar();
	}

	private ensureBar() {
		if (!this.boundHost) return;
		if (this.barEl?.parentElement === this.boundHost) return;

		this.barEl = this.boundHost.createDiv({ cls: PROGRESS_BAR_CLASS });
		const track = this.barEl.createDiv({ cls: "bsr-progress-track" });
		this.fillEl = track.createDiv({ cls: "bsr-progress-fill" });
		this.labelEl = this.barEl.createDiv({ cls: "bsr-progress-label" });
	}

	private detach() {
		this.barEl?.remove();
		this.barEl = null;
		this.fillEl = null;
		this.labelEl = null;
		this.boundHost = null;
	}
}
