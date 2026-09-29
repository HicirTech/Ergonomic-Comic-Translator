/**
 * What a region is and what to do with it. The category never changes the geometry, only the policy:
 * dialogue, narration, free text and signs are translated and re-typeset at their angle; SFX keep the
 * original lettering (a small Chinese gloss is optional).
 */
export interface RegionClass {
  layout: "bubble" | "bottom_box" | "text_free";
  kind: "dialogue" | "thought" | "free_text" | "sfx";
  policy: "translate" | "keep";
}
