import { boundingBoxOfPoints, intersectionArea } from "../../src/geometry/box.ts";
import type { Point } from "../../src/geometry/interfaces/index.ts";
import { rotatePoint } from "../../src/geometry/rotated-rect.ts";
import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { normalizeForCer } from "../metrics/ocr-metrics.ts";
import {
  bubbleRoles,
  kindDirection,
  maxFontSizePx,
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
  stackedLinePitch,
} from "./constants.ts";
import { fitLine } from "./fit-line.ts";
import type { GroundTruthBlock, GroundTruthLine, LayoutKind, SyntheticPage } from "./interfaces/index.ts";
import { layoutQuad, linePolygon } from "./line-geometry.ts";
import { assertGlyphsPresent } from "./missing-glyph.ts";
import { createRng, rngInt } from "./rng.ts";
import { corpusTexts, lineGroups, singleSentences } from "./sentences.ts";

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
  const page: SyntheticPage = {
    id,
    seed,
    index,
    width: pageWidthPx,
    height: pageHeightPx,
    background: backgroundOf(role),
    blocks: assignReadingOrder(blocks),
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
