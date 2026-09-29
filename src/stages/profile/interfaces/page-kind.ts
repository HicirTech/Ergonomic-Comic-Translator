/** main: a page to translate; blank: nothing to do; textless_variant: an alternate of `variantOf` without text. */
export type PageKind =
  | { kind: "main" }
  | { kind: "blank" }
  | { kind: "textless_variant"; variantOf: number };
