const BODY_CLASSES = [
	"bsr-collapse-always-on",
	"bsr-collapse-right",
	"bsr-align-checkbox",
	"bsr-scrollable-code",
	"bsr-focus-highlight",
	"bsr-focus-dim",
	"bsr-end-spacer",
] as const;

function getBody(): HTMLElement {
	return window.activeDocument.body;
}

export function applyBlockColorCss(blockColor: {
	color: string;
	transparency: number;
}): void {
	const percentage = blockColor.transparency / 100;
	const colorWithAlpha = blockColor.color.replace(
		/\d+\s*\)$/,
		`${percentage})`,
	);
	getBody().setCssProps({
		"--bsr-block-color": colorWithAlpha,
	});
}

export function setBodyFeature(
	className: (typeof BODY_CLASSES)[number],
	active: boolean,
): void {
	getBody().toggleClass(className, active);
}

export function applyReadingFeatures(settings: {
	alwaysOnCollapseIndicator: boolean;
	collapseIndicatorOnTheRightSide: boolean;
	alignCheckboxToIndentationGuide: boolean;
	scrollableCode: boolean;
	highlightFocused: boolean;
	dimUnfocused: boolean;
	unfocusedOpacity: number;
	autoScrollOnFocus: boolean;
	scrollAlignment: string;
}): void {
	setBodyFeature(
		"bsr-collapse-always-on",
		settings.alwaysOnCollapseIndicator,
	);
	setBodyFeature(
		"bsr-collapse-right",
		settings.collapseIndicatorOnTheRightSide,
	);
	setBodyFeature(
		"bsr-align-checkbox",
		settings.alignCheckboxToIndentationGuide,
	);
	setBodyFeature("bsr-scrollable-code", settings.scrollableCode);
	setBodyFeature("bsr-focus-highlight", settings.highlightFocused);
	setBodyFeature("bsr-focus-dim", settings.dimUnfocused);
	// Room after the last paragraph so it can still reach the top of the pane.
	setBodyFeature(
		"bsr-end-spacer",
		settings.autoScrollOnFocus && settings.scrollAlignment === "top",
	);
	const opacity = Math.max(0, Math.min(100, settings.unfocusedOpacity)) / 100;
	getBody().setCssProps({ "--bsr-unfocused-opacity": String(opacity) });
}

export function cleanupReadingFeatures(): void {
	for (const className of BODY_CLASSES) {
		getBody().removeClass(className);
	}
	getBody().style.removeProperty("--bsr-unfocused-opacity");
	getBody().style.removeProperty("--bsr-block-color");
}

export function setProgressWidth(element: HTMLElement, progress: number): void {
	element.setCssProps({
		"--bsr-progress-width": `${Math.round(progress * 100)}%`,
	});
}
