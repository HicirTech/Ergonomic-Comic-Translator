import * as hb from "harfbuzzjs";
import type { Shaper } from "./interfaces/index.ts";

/**
 * Shaper over harfbuzzjs. Vertical text is shaped top-to-bottom so the font's vert/vrt2 forms replace
 * punctuation (，。！？ and brackets); glyph outlines come back as SVG paths in font units.
 */
export const loadHarfbuzzShaper = async (fontPath: string): Promise<Shaper> => {
  const bytes = new Uint8Array(await Bun.file(fontPath).arrayBuffer());
  const face = new hb.Face(new hb.Blob(bytes));
  const font = new hb.Font(face);
  const paths = new Map<number, string>();
  return {
    upem: face.upem,
    shape: (text, direction) => {
      const buffer = new hb.Buffer();
      buffer.addText(text);
      buffer.guessSegmentProperties();
      buffer.setDirection(direction === "v" ? hb.Direction.TTB : hb.Direction.LTR);
      hb.shape(font, buffer);
      const positions = buffer.getGlyphPositions();
      return buffer.getGlyphInfos().map((info, index) => ({
        id: info.codepoint,
        cluster: info.cluster,
        xAdvance: positions[index]!.xAdvance,
        yAdvance: positions[index]!.yAdvance,
        xOffset: positions[index]!.xOffset,
        yOffset: positions[index]!.yOffset,
      }));
    },
    glyphPath: (glyphId) => {
      let path = paths.get(glyphId);
      if (path === undefined) {
        path = font.glyphToPath(glyphId);
        paths.set(glyphId, path);
      }
      return path;
    },
  };
};
