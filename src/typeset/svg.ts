import type { Shaper, TextLayout } from "./interfaces/index.ts";

/** Baseline position below the em-box top; the centre of a turned glyph's cell is found from it. */
const baselineShare = 0.88;

const fmt = (value: number) => Number(value.toFixed(2));

/** Glyph outlines of one layout as SVG paths (font units flipped to y-down and scaled to pixels). */
export const layoutPaths = (shaper: Shaper, layout: TextLayout) => {
  const scale = layout.fontSize / shaper.upem;
  return layout.glyphs.map((glyph) => {
    const place = `translate(${fmt(glyph.x)} ${fmt(glyph.y)}) scale(${fmt(scale * 1000) / 1000} ${-fmt(scale * 1000) / 1000})`;
    const turn = glyph.rotate
      ? `rotate(90 ${fmt(glyph.x + layout.fontSize / 2)} ${fmt(glyph.y - (baselineShare - 0.5) * layout.fontSize)}) `
      : "";
    return `<path d="${shaper.glyphPath(glyph.id)}" transform="${turn}${place}"/>`;
  }).join("");
};

/**
 * One text block placed on the page: the layout box (width x height, upright) is centred at (cx, cy) and
 * turned by `angle` degrees, so slanted text is re-typeset at its original angle. Text on art gets a white
 * outline painted under the fill.
 */
export const placedBlockSvg = (
  shaper: Shaper,
  layout: TextLayout,
  box: { cx: number; cy: number; width: number; height: number; angle: number },
  outline: boolean,
) => {
  const transform = `translate(${fmt(box.cx)} ${fmt(box.cy)}) rotate(${fmt(box.angle)}) translate(${fmt(-box.width / 2)} ${fmt(-box.height / 2)})`;
  const stroke = outline ? ` stroke="#ffffff" stroke-width="${fmt(Math.max(2, layout.fontSize * 0.12) * (shaper.upem / layout.fontSize))}" stroke-linejoin="round" paint-order="stroke"` : "";
  return `<g transform="${transform}" fill="#111111"${stroke}>${layoutPaths(shaper, layout)}</g>`;
};

export const pageOverlaySvg = (width: number, height: number, blocks: readonly string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${blocks.join("")}</svg>`;
