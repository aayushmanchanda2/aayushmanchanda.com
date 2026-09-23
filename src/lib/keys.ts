/**
 * Whether a document-level key listener may act on this press.
 *
 * Every layer that handles a key calls `preventDefault()`, and every listener
 * asks this first, so a key the top layer took (the palette's Escape) is never
 * handled again by the layer under it (the sites panel). One press, one layer
 * (design.md §4). A press mid-IME belongs to the text field.
 */
export const ownsKey = (event: KeyboardEvent): boolean => !event.defaultPrevented && !event.isComposing;
