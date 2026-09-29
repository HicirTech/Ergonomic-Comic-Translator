import type { NewFlag } from "../db/interfaces/index.ts";
import type { PageTranslationResult } from "../pipeline/interfaces/index.ts";

/** Flag codes the translate stage owns (a re-translation resolves them before adding its own). */
export const translationFlagCodes = ["TR_FAILED", "TR_TERM_MISS"] as const;

/**
 * Review flags for a translated page: a unit without any accepted translation is a decisive error (it is
 * shown with a placeholder), a glossary term the translation still misses is an advisory warning.
 */
export const translationFlags = (result: PageTranslationResult): NewFlag[] => {
  const flags: NewFlag[] = [];
  for (const unit of result.units) {
    const codes = result.flags[unit.id] ?? [];
    if (result.targets[unit.id] === undefined) {
      flags.push({ code: "TR_FAILED", severity: "error", class: "decisive", evidence: { unit: unit.id, checks: codes } });
    } else if (codes.includes("TR_TERM_MISS")) {
      flags.push({ code: "TR_TERM_MISS", severity: "warn", class: "advisory", evidence: { unit: unit.id } });
    }
  }
  return flags;
};
