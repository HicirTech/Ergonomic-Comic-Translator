import { boundingBoxOfPoints, boxCenter, expandBox, intersectionArea } from "../../src/geometry/box.ts";
import type { Point } from "../../src/geometry/interfaces/index.ts";
import { rotatePoint } from "../../src/geometry/rotated-rect.ts";
import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { normalizeForCer } from "../metrics/ocr-metrics.ts";
import {
  bubblePadPx,
  bubbleRoles,
  kindDirection,
  maxFontSizePx,
  maxSfxFontSizePx,
  maxSlantDeg,
  minFontSizePx,
  minSlantDeg,
  multiLineRoles,
  outlinedKinds,
  pageHeightPx,
  pageMarginPx,
  pageRoles,
  pageWidthPx,
  readingBandPx,
  sfxFontScale,
  sfxPushStepPx,
  sfxRimAnglesDeg,
  sfxStrokeShare,
  sfxTextGapPx,
  stackedLinePitch,
} from "./constants.ts";
import { fitLine } from "./fit-line.ts";
import type { GroundTruthBlock, GroundTruthLine, LayoutKind, Quad, SfxMark, SyntheticPage } from "./interfaces/index.ts";
import { layoutQuad, linePolygon } from "./line-geometry.ts";
import { assertGlyphsPresent } from "./missing-glyph.ts";
import { insideBubble } from "./painted-surface.ts";
import { createRng, rngInt } from "./rng.ts";
import { corpusTexts, lineGroups, sfxTexts, singleSentences } from "./sentences.ts";

type PageRole = (typeof pageRoles)[number];

interface BlockSpec {
  kind: LayoutKind;
  lines: readonly string[];
  angle: number;
  bubble: boolean;
  center: Point;
}

const sentenceKeyOf = (lines: readonly string[]) => normalizeForCer(lines.join(""));

const backgroundOf = (role: PageRole): SyntheticPage["background"] => {
  if (role === "art-h" || role === "art-v") return "dark";
  if (role === "mixed") return "texture";
  return "paper";
};

const usesGroup = (kind: PageRole | LayoutKind) => multiLineRoles.has(kind);

/** Fixed slots. Sizes at the maximum font still leave a gap; planPages throws if a seed violates that. */
const specsFor = (role: PageRole, single: string, group: readonly string[], slant: number, artLine: string): BlockSpec[] => {
  if (role === "mixed") {
    return [
      { kind: "h-block", lines: group, angle: 0, bubble: true, center: { x: 420, y: 430 } },
      { kind: "v-column", lines: [single], angle: 0, bubble: false, center: { x: 1020, y: 980 } },
      { kind: "art-h", lines: [artLine], angle: 0, bubble: false, center: { x: 640, y: 1560 } },
    ];
  }
  const kind = role;
  return [{
    kind,
    lines: usesGroup(kind) ? group : [single],
    angle: kind === "slant-h" || kind === "slant-v" ? slant : 0,
    bubble: bubbleRoles.has(kind),
    center: { x: pageWidthPx / 2, y: pageHeightPx / 2 },
  }];
};

const buildBlock = (shaper: Shaper, spec: BlockSpec, fontSize: number, id: string): GroundTruthBlock => {
  const direction = kindDirection[spec.kind];
  const outline = outlinedKinds.has(spec.kind);
  const fitted = spec.lines.map((text) => fitLine(shaper, text, direction, fontSize, outline));
  const cross = direction === "h" ? fitted[0]!.height : fitted[0]!.width;
  const pitch = Math.max(fontSize * stackedLinePitch, cross);
  const along = Math.max(...fitted.map((line) => (direction === "h" ? line.width : line.height)));
  const span = (fitted.length - 1) * pitch + cross;
  const width = direction === "h" ? along : span;
  const height = direction === "h" ? span : along;
  const lines: GroundTruthLine[] = fitted.map((line, order) => {
    const delta = (order - (fitted.length - 1) / 2) * pitch;
    const local = direction === "h" ? { x: 0, y: delta } : { x: -delta, y: 0 };
    const point = rotatePoint({ x: spec.center.x + local.x, y: spec.center.y + local.y }, spec.center, spec.angle);
    return {
      text: line.text,
      order,
      cx: point.x,
      cy: point.y,
      width: line.width,
      height: line.height,
      polygon: linePolygon(direction, point, line.width, line.height, spec.angle),
    };
  });
  return {
    id,
    kind: spec.kind,
    direction,
    angle: spec.angle,
    readingOrder: 0,
    sentenceKey: sentenceKeyOf(lines.map((line) => line.text)),
    bubble: spec.bubble,
    fontSize,
    cx: spec.center.x,
    cy: spec.center.y,
    width,
    height,
    polygon: layoutQuad(spec.center, width, height, spec.angle),
    lines,
  };
};

const assertOnPage = (page: SyntheticPage) => {
  for (const block of page.blocks) {
    for (const point of block.polygon) {
      const inside = point.x >= pageMarginPx && point.y >= pageMarginPx
        && point.x <= pageWidthPx - pageMarginPx && point.y <= pageHeightPx - pageMarginPx;
      if (!inside) throw new Error(`Block ${block.id} leaves the page at (${point.x}, ${point.y})`);
    }
  }
  for (let left = 0; left < page.blocks.length; left += 1) {
    for (let right = left + 1; right < page.blocks.length; right += 1) {
      const a = boundingBoxOfPoints(page.blocks[left]!.polygon);
      const b = boundingBoxOfPoints(page.blocks[right]!.polygon);
      if (intersectionArea(a, b) > 0) {
        throw new Error(`Blocks overlap: ${page.blocks[left]!.id} and ${page.blocks[right]!.id}`);
      }
    }
  }
};

const insideMargins = (point: Point) =>
  point.x >= pageMarginPx && point.y >= pageMarginPx && point.x <= pageWidthPx - pageMarginPx && point.y <= pageHeightPx - pageMarginPx;

/** Corners and three points between each pair, so a crossing edge counts even when no corner is inside. */
const edgeSamples = (polygon: Quad) => polygon.flatMap((point, index) => {
  const next = polygon[(index + 1) % polygon.length]!;
  return [0, 0.25, 0.5, 0.75].map((share) => ({ x: point.x + (next.x - point.x) * share, y: point.y + (next.y - point.y) * share }));
});

/**
 * Art lettering across the outline of the page's bubble. Tries the directions around the bubble in order and
 * pushes the lettering outward until it clears every block; it is placed at the first spot that still
 * reaches into the bubble and stays on the page. Null when the page has no bubble or no direction works.
 */
const placeSfx = (shaper: Shaper, blocks: readonly GroundTruthBlock[], fontSize: number, rng: () => number, id: string): SfxMark | null => {
  const host = blocks.find((block) => block.bubble);
  if (!host) return null;
  const text = sfxTexts[rngInt(rng, 0, sfxTexts.length - 1)]!;
  const size = Math.min(maxSfxFontSizePx, Math.round(fontSize * sfxFontScale));
  const angle = rngInt(rng, minSlantDeg, maxSlantDeg) * (rng() < 0.5 ? -1 : 1);
  const fitted = fitLine(shaper, text, "h", size, false);
  const stroke = sfxStrokeShare * size;
  const width = fitted.width + stroke * 2;
  const height = fitted.height + stroke * 2;
  const disc = expandBox(boundingBoxOfPoints(host.polygon), bubblePadPx);
  const middle = boxCenter(disc);
  const clear = blocks.map((block) => expandBox(boundingBoxOfPoints(block.polygon), sfxTextGapPx));
  for (const degrees of sfxRimAnglesDeg) {
    const radians = (degrees * Math.PI) / 180;
    const rim = { x: middle.x + ((disc.x1 - disc.x0) / 2) * Math.cos(radians), y: middle.y + ((disc.y1 - disc.y0) / 2) * Math.sin(radians) };
    for (let push = 0; push <= Math.max(width, height); push += sfxPushStepPx) {
      const at = { x: rim.x + push * Math.cos(radians), y: rim.y + push * Math.sin(radians) };
      const polygon = layoutQuad(at, width, height, angle);
      if (!polygon.every(insideMargins)) break;
      if (!edgeSamples(polygon).some((point) => insideBubble(point, disc))) break;
      const bounds = boundingBoxOfPoints(polygon);
      if (clear.some((box) => intersectionArea(bounds, box) > 0)) continue;
      return { id, text, fontSize: size, angle, cx: at.x, cy: at.y, width, height, polygon };
    }
  }
  return null;
};

const assignReadingOrder = (blocks: GroundTruthBlock[]) => {
  const ordered = [...blocks].sort((a, b) => {
    if (Math.abs(a.cy - b.cy) > readingBandPx) return a.cy - b.cy;
    return b.cx - a.cx;
  });
  ordered.forEach((block, index) => {
    block.readingOrder = index;
  });
  return ordered;
};

const planPage = (shaper: Shaper, seed: number, index: number, rng: () => number): SyntheticPage => {
  const fontSize = rngInt(rng, minFontSizePx, maxFontSizePx);
  const slant = rngInt(rng, minSlantDeg, maxSlantDeg) * (rng() < 0.5 ? -1 : 1);
  const role = pageRoles[index % pageRoles.length]!;
  const groupIndex = Math.floor(index / pageRoles.length);
  const single = singleSentences[(groupIndex + (seed % singleSentences.length)) % singleSentences.length]!;
  const artLine = singleSentences[(groupIndex + (seed % singleSentences.length) + 1) % singleSentences.length]!;
  const group = lineGroups[(groupIndex + (seed % lineGroups.length)) % lineGroups.length]!;
  const id = `p${String(index).padStart(4, "0")}`;
  const blocks = specsFor(role, single, group, slant, artLine).map((spec, blockIndex) =>
    buildBlock(shaper, spec, fontSize, `${id}-b${blockIndex}`));
  const sfx = placeSfx(shaper, blocks, fontSize, rng, `${id}-s0`);
  const page: SyntheticPage = {
    id,
    seed,
    index,
    width: pageWidthPx,
    height: pageHeightPx,
    background: backgroundOf(role),
    blocks: assignReadingOrder(blocks),
    sfx: sfx ? [sfx] : [],
  };
  assertOnPage(page);
  return page;
};

/** Same seed and count always return the same pages. Checks the font before placing any text. */
export const planSyntheticPages = (shaper: Shaper, seed: number, pageCount: number) => {
  assertGlyphsPresent(shaper, corpusTexts);
  const rng = createRng(seed);
  return Array.from({ length: pageCount }, (_, index) => planPage(shaper, seed, index, rng));
};
