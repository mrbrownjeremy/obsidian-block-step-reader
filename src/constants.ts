/**
 * Class name for the preview view
 */
export const MARKDOWN_PREVIEW_VIEW = "markdown-preview-view";

/**
 * Class name for the frontmatter element
 */
export const FRONTMATTER = "frontmatter";

/**
 * List of selectors for block elements
 */
export const BLOCKS = [
	"p",
	"li",
	"table",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"pre",
	"blockquote",
	"img",
	"video",
	"audio",
	"iframe",
	"[data-callout]",
];

/**
 * Class name for block selector
 */
export const BLOCK_SELECTOR = "rve-block-selector";

/**
 * Attribute name for block elements
 */
export const BLOCK_ATTR = "data-rve-block";

/**
 * Attribute name for prose units used by paragraph navigation:
 * paragraphs, plus list items that have no paragraph of their own.
 */
export const PARAGRAPH_ATTR = "data-rve-paragraph";

/**
 * Class on a scroller that gets extra space at the end, so the last
 * paragraphs can still be scrolled to the top of the pane.
 */
export const END_SPACER = "bsr-end-spacer";

/**
 * Class name for selected block
 */
export const SELECTED_BLOCK = "rve-selected-block";

/**
 * Selector for collapse indicators
 */
export const COLLAPSE_INDICATORS = [".collapse-indicator", ".callout-fold"];

/**
 * Class name for collapsed block
 */
export const IS_COLLAPSED = "is-collapsed";

/** Sidebar reading library view type */
export const READING_LIBRARY_VIEW_TYPE = "bsr-reading-library";

/** Support link shown in settings and manifest (Ko-fi) */
export const SUPPORT_KOFI_URL = "https://ko-fi.com/bigmonk";
