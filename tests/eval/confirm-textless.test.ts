import { describe, expect, it } from "bun:test";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import type { VisionClient } from "../../src/pipeline/interfaces/index.ts";
import type { OcrCandidate, OcrCrop } from "../../src/stages/ocr/interfaces/index.ts";
import {
  confirmCluster,
  decideTextless,
  isReadable,
  largestDistinctBoxes,
  maxPairDifferenceShare,
  readBoxLimit,
  readableMinChars,
  readableMinProb,
  textlessMaxReadableBoxes,
} from "../../eval/ground-truth/confirm-textless.ts";
import type { ClusterMember, ClusterReading, MemberReading } from "../../eval/ground-truth/interfaces/index.ts";

const background = 200;
const ink = 20;
/** The text the fake recognizers "read" from a text area. It must never reach the confirmation. */
const spokenText = "ありがとう";

const boxOf = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

/** A page of plain paper with dark blocks where its text would be. */
const page = (width: number, height: number, blocks: readonly Box[]): RgbImage => {
  const data = new Uint8Array(width * height * 3).fill(background);
  for (const block of blocks) {
    for (let y = block.y0; y < block.y1; y += 1) data.fill(ink, (y * width + block.x0) * 3, (y * width + block.x1) * 3);
  }
  return { data, width, height };
};

const member = (ordinal: number, imagePath: string, blocks: readonly Box[], width = 240, height = 120): ClusterMember => ({
  ordinal,
  imagePath,
  image: page(width, height, blocks),
});

interface ReadCall {
  imagePath: string;
  crops: OcrCrop[];
  engine?: string;
}

/**
 * Recognizers that read a crop as confident text when its centre lies in one of the blocks the page was
 * painted with, and as low-confidence noise anywhere else. Each engine can be switched off.
 */
const fakeRecognizers = (blocksByPath: Record<string, readonly Box[]>, engines = { line: true, manga: true }) => {
  const lineCalls: ReadCall[] = [];
  const mangaCalls: ReadCall[] = [];
  const reading = (imagePath: string, crop: OcrCrop, quarterTurns: number, enabled: boolean): OcrCandidate => {
    const centre = { x: (crop.corners[0].x + crop.corners[2].x) / 2, y: (crop.corners[0].y + crop.corners[2].y) / 2 };
    const onText = (blocksByPath[imagePath] ?? []).some((block) => centre.x >= block.x0 && centre.x < block.x1 && centre.y >= block.y0 && centre.y < block.y1);
    return onText && enabled
      ? { quarterTurns, text: spokenText, meanProb: 0.95, minProb: 0.9, tokens: 5 }
      : { quarterTurns, text: "x", meanProb: 0.3, minProb: 0.1, tokens: 1 };
  };
  const client: Pick<VisionClient, "recognizeLines" | "readUtterances"> = {
    recognizeLines: async (imagePath, crops) => {
      lineCalls.push({ imagePath, crops });
      return crops.map((crop) => crop.quarterTurns.map((turn) => reading(imagePath, crop, turn, engines.line)));
    },
    readUtterances: async (imagePath, crops, engine) => {
      mangaCalls.push({ imagePath, crops, engine });
      return crops.map((crop) => crop.quarterTurns.map((turn) => reading(imagePath, crop, turn, engines.manga)));
    },
  };
  return { client, lineCalls, mangaCalls };
};

const candidate = (text: string, meanProb: number): OcrCandidate => ({ quarterTurns: 0, text, meanProb, minProb: 0, tokens: text.length });

const reading = (ordinal: number, readableBoxCount: number): MemberReading => ({ ordinal, readBoxCount: readBoxLimit, readableBoxCount });

/** Readings with the difference share of every listed pair; pairs not listed differ completely. */
const clusterOf = (members: MemberReading[], shares: readonly (readonly [number, number, number])[]): ClusterReading => ({
  members,
  differences: shares.map(([first, second, share]) => ({ first, second, share })),
});

/** Two 40 x 40 blocks on a 240 x 120 page: the share of the page that differs from blank paper (median filtering rounds the corners). */
const twoBlocksShare = (2 * 40 * 40) / (240 * 120);

describe("readable text", () => {
  it("needs the mean probability and the character count at their limits, in one reading", () => {
    expect(isReadable([candidate(spokenText, readableMinProb)])).toBe(true);
    expect(isReadable([candidate(spokenText, readableMinProb - 0.01)])).toBe(false);
    expect(isReadable([candidate("あ".repeat(readableMinChars), 0.99)])).toBe(true);
    expect(isReadable([candidate("あ".repeat(readableMinChars - 1), 0.99)])).toBe(false);
    expect(isReadable([candidate(spokenText, 0.5), candidate("あ", 0.99)])).toBe(false);
    expect(isReadable([candidate(spokenText, 0.5), candidate("あい", 0.99)])).toBe(true);
    expect(isReadable([])).toBe(false);
  });

  it("does not count white space as a character", () => {
    expect(isReadable([candidate(" あ \n　", 0.99)])).toBe(false);
    expect(isReadable([candidate("あ い", 0.99)])).toBe(true);
  });
});

describe("boxes to read", () => {
  it("puts the largest first and drops a box that lies mostly inside a larger one", () => {
    const big = boxOf(0, 0, 100, 100);
    const inside = boxOf(10, 10, 60, 60);
    const mostlyInside = boxOf(60, 0, 110, 100);
    const beside = boxOf(80, 0, 180, 100);

    expect(largestDistinctBoxes([inside, beside, big])).toEqual([big, beside]);
    expect(largestDistinctBoxes([mostlyInside, big])).toEqual([big]);
  });

  it("keeps at most readBoxLimit boxes, the largest ones", () => {
    const boxes = Array.from({ length: readBoxLimit + 3 }, (_, index) => boxOf(index * 200, 0, index * 200 + 10 + index, 10 + index));
    const kept = largestDistinctBoxes(boxes);

    expect(kept).toHaveLength(readBoxLimit);
    expect(kept[0]).toEqual(boxes.at(-1)!);
    expect(kept.at(-1)).toEqual(boxes[3]!);
  });
});

describe("textless pairing", () => {
  it("pairs each text page, a single readable box included, with the textless page of the closest picture", () => {
    const decision = decideTextless(clusterOf(
      [reading(1, 2), reading(2, textlessMaxReadableBoxes), reading(3, 1), reading(4, textlessMaxReadableBoxes)],
      [[1, 2, 0.05], [1, 4, 0.4], [2, 3, 0.5], [3, 4, 0.08], [2, 4, 0.3], [1, 3, 0.2]],
    ));

    expect(decision).toEqual({
      textlessOrdinals: [2, 4],
      pairs: [
        { textOrdinal: 1, textlessOrdinal: 2, differenceShare: 0.05 },
        { textOrdinal: 3, textlessOrdinal: 4, differenceShare: 0.08 },
      ],
      excluded: [],
    });
  });

  it("excludes a text page whose closest textless page shows another picture, and keeps one at the limit", () => {
    const tooFar = decideTextless(clusterOf([reading(1, 2), reading(2, 0)], [[1, 2, maxPairDifferenceShare + 0.01]]));
    const atLimit = decideTextless(clusterOf([reading(1, 2), reading(2, 0)], [[1, 2, maxPairDifferenceShare]]));

    expect(tooFar.pairs).toEqual([]);
    expect(tooFar.excluded).toEqual([{ reason: "picture_differs", ordinals: [1], pairCount: 1 }]);
    expect(atLimit.pairs).toEqual([{ textOrdinal: 1, textlessOrdinal: 2, differenceShare: maxPairDifferenceShare }]);
  });

  it("finds no textless member when every page has a readable box, and excludes every text page", () => {
    const decision = decideTextless(clusterOf([reading(4, 1), reading(2, 2), reading(3, 3)], []));

    expect(decision).toEqual({
      textlessOrdinals: [],
      pairs: [],
      excluded: [{ reason: "no_textless_member", ordinals: [2, 3, 4], pairCount: 3 }],
    });
  });

  it("gives a tie between two textless pages to the later one", () => {
    const decision = decideTextless(clusterOf([reading(7, 0), reading(3, 0), reading(5, 2)], [[3, 5, 0.1], [5, 7, 0.1], [3, 7, 0.02]]));

    expect(decision.textlessOrdinals).toEqual([3, 7]);
    expect(decision.pairs).toEqual([{ textOrdinal: 5, textlessOrdinal: 7, differenceShare: 0.1 }]);
  });
});

describe("cluster confirmation", () => {
  const first = [boxOf(20, 20, 60, 60), boxOf(120, 60, 160, 100)];
  const second = [boxOf(180, 20, 220, 60), boxOf(20, 70, 60, 110)];

  it("finds the textless page by reading where the pages differ, and pairs each text page with it", async () => {
    const clean = member(1, "clean.png", []);
    const textA = member(2, "a.png", first);
    const textB = member(3, "b.png", second);
    const { client, lineCalls, mangaCalls } = fakeRecognizers({ "a.png": first, "b.png": second });

    const confirmation = await confirmCluster(client, [textB, clean, textA]);

    expect(confirmation.members).toEqual([
      { ordinal: 1, readBoxCount: 4, readableBoxCount: 0 },
      { ordinal: 2, readBoxCount: 4, readableBoxCount: 2 },
      { ordinal: 3, readBoxCount: 4, readableBoxCount: 2 },
    ]);
    expect(confirmation.textlessOrdinals).toEqual([1]);
    expect(confirmation.pairs.map(({ textOrdinal, textlessOrdinal }) => [textOrdinal, textlessOrdinal])).toEqual([[2, 1], [3, 1]]);
    for (const pair of confirmation.pairs) expect(pair.differenceShare).toBeCloseTo(twoBlocksShare, 3);
    expect(confirmation.excluded).toEqual([]);
    expect(JSON.stringify(confirmation)).not.toContain(spokenText);
    expect(lineCalls.map((call) => call.imagePath)).toEqual(["clean.png", "a.png", "b.png"]);
    expect(mangaCalls.map((call) => call.imagePath)).toEqual(["clean.png", "a.png", "b.png"]);
  });

  it("reads each box with the line recognizer at turns 0 and 3 and with manga-ocr at turn 0", async () => {
    const { client, lineCalls, mangaCalls } = fakeRecognizers({ "a.png": first });

    await confirmCluster(client, [member(1, "clean.png", []), member(2, "a.png", first)]);

    expect(lineCalls[0]!.crops).toHaveLength(2);
    expect(mangaCalls.every((call) => call.engine === "manga-ocr")).toBe(true);
    for (const crop of lineCalls.flatMap((call) => call.crops)) expect(crop.quarterTurns).toEqual([0, 3]);
    for (const crop of mangaCalls.flatMap((call) => call.crops)) expect(crop.quarterTurns).toEqual([0]);
    for (const crop of [...lineCalls, ...mangaCalls].flatMap((call) => call.crops)) {
      const [topLeft, topRight, , bottomLeft] = crop.corners;
      expect(topRight.y).toBe(topLeft.y);
      expect(bottomLeft.x).toBe(topLeft.x);
      expect(crop.width).toBe(topRight.x - topLeft.x);
      expect(crop.height).toBe(bottomLeft.y - topLeft.y);
    }
  });

  it("reads a box that only manga-ocr can read, and counts nothing when neither can", async () => {
    const pages = () => [member(1, "clean.png", []), member(2, "a.png", first)];
    const pairedOrdinals = (confirmation: Awaited<ReturnType<typeof confirmCluster>>) =>
      confirmation.pairs.map(({ textOrdinal, textlessOrdinal }) => [textOrdinal, textlessOrdinal]);

    const byManga = await confirmCluster(fakeRecognizers({ "a.png": first }, { line: false, manga: true }).client, pages());
    const byLines = await confirmCluster(fakeRecognizers({ "a.png": first }, { line: true, manga: false }).client, pages());
    const byNeither = await confirmCluster(fakeRecognizers({ "a.png": first }, { line: false, manga: false }).client, pages());

    expect(pairedOrdinals(byManga)).toEqual([[2, 1]]);
    expect(pairedOrdinals(byLines)).toEqual([[2, 1]]);
    expect(byNeither.pairs).toEqual([]);
    expect(byNeither.members.map((member) => member.readableBoxCount)).toEqual([0, 0]);
  });

  it("excludes both pages when each of them has readable text where they differ", async () => {
    const shared = boxOf(20, 20, 60, 60);
    const textA = [shared, boxOf(120, 60, 160, 100)];
    const textB = [shared, boxOf(180, 20, 220, 60)];
    const { client } = fakeRecognizers({ "a.png": textA, "b.png": textB });

    const confirmation = await confirmCluster(client, [member(1, "a.png", textA), member(2, "b.png", textB)]);

    expect(confirmation.textlessOrdinals).toEqual([]);
    expect(confirmation.pairs).toEqual([]);
    expect(confirmation.excluded).toEqual([{ reason: "no_textless_member", ordinals: [1, 2], pairCount: 2 }]);
  });

  it("counts a text area once although several members show it, and breaks a tie with the later page", async () => {
    const { client } = fakeRecognizers({ "a.png": first });

    const confirmation = await confirmCluster(client, [member(1, "a.png", first), member(2, "b.png", []), member(3, "c.png", [])]);

    expect(confirmation.members).toEqual([
      { ordinal: 1, readBoxCount: 2, readableBoxCount: 2 },
      { ordinal: 2, readBoxCount: 2, readableBoxCount: 0 },
      { ordinal: 3, readBoxCount: 2, readableBoxCount: 0 },
    ]);
    expect(confirmation.textlessOrdinals).toEqual([2, 3]);
    expect(confirmation.pairs.map(({ textOrdinal, textlessOrdinal }) => [textOrdinal, textlessOrdinal])).toEqual([[1, 3]]);
    expect(confirmation.excluded).toEqual([]);
  });

  it("reads only the largest distinct difference boxes of a page", async () => {
    const sizes = [20, 24, 28, 32, 36, 40, 44, 48, 52, 56];
    let x = 10;
    const blocks = sizes.map((size) => {
      const block = boxOf(x, 10, x + size, 10 + size);
      x += size + 8;
      return block;
    });
    const { client, lineCalls } = fakeRecognizers({ "a.png": blocks });

    const confirmation = await confirmCluster(client, [member(1, "clean.png", [], 480, 80), member(2, "a.png", blocks, 480, 80)]);

    expect(confirmation.members.map((reading) => reading.readBoxCount)).toEqual([readBoxLimit, readBoxLimit]);
    expect(lineCalls[1]!.crops).toHaveLength(readBoxLimit);
    expect(Math.min(...lineCalls[1]!.crops.map((crop) => crop.width))).toBeGreaterThanOrEqual(sizes[2]! - 1);
  });

  it("reads nothing for a page whose difference has no box", async () => {
    const { client, lineCalls, mangaCalls } = fakeRecognizers({});

    const confirmation = await confirmCluster(client, [member(1, "a.png", []), member(2, "b.png", [])]);

    expect(lineCalls).toHaveLength(0);
    expect(mangaCalls).toHaveLength(0);
    expect(confirmation.members).toEqual([
      { ordinal: 1, readBoxCount: 0, readableBoxCount: 0 },
      { ordinal: 2, readBoxCount: 0, readableBoxCount: 0 },
    ]);
    expect(confirmation.pairs).toEqual([]);
  });
});
