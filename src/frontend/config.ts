/**
 * Frontend configuration constants.
 */

// ── Export ────────────────────────────────────────────────────────────────────

/** Number of pages rendered simultaneously when exporting to PDF. */
export const PDF_EXPORT_PAGE_CONCURRENCY = 20;
// ── OCR Preview ───────────────────────────────────────────────────────────────

/** Default RGBA background color for polygon translation overlays. */
export const DEFAULT_POLYGON_BG_COLOR = "rgba(0,0,0,0.72)";

/**
 * Given a CSS `rgba(r,g,b,a)` polygon background color, return the text color
 * ("white" or "#1a1a1a") that maximises readability over that background.
 *
 * We simulate alpha-compositing on white (typical manga page) so a nearly-transparent
 * overlay correctly yields dark text.
 */
export function polygonTextColor(bgColor: string): string {
  const m = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return "white";
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const a = parseFloat(m[4] ?? "1");
  // Composite onto white (255,255,255)
  const cr = r * a + 255 * (1 - a);
  const cg = g * a + 255 * (1 - a);
  const cb = b * a + 255 * (1 - a);
  // Relative luminance (WCAG formula)
  const toLinear = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * toLinear(cr) + 0.7152 * toLinear(cg) + 0.0722 * toLinear(cb);
  // WCAG contrast: white on bg vs dark on bg — pick whichever gives higher contrast ratio
  return L > 0.179 ? "#1a1a1a" : "white";
}
