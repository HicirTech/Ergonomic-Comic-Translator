import { isRetryableLlmError } from "../llm/retryable.ts";
import { checkCompletion } from "../qa/decisive-checks.ts";
import type { CheckCode } from "../qa/interfaces/index.ts";
import { jsonContract } from "./contract.ts";
import { collapseRuns, sourceRepeats } from "./cries.ts";
import type { CompleteFn, PageRequest, PageTranslation, TranslationContract, TranslationUnit } from "./interfaces/index.ts";

/**
 * An answer that failed only these checks is still better on the page than the placeholder: some kana left
 * in place, a short text returned as it was ("OK"), or a cry repeated more often than the source repeats
 * anything, cut back to the source's measure. A refusal or a broken answer is not.
 */
const usableDespite: readonly CheckCode[] = ["G1B_ECHO", "G3_RESIDUE", "G5_REPEAT"];

/**
 * L1 and L1r for one page: translate all units, then retry only what failed. Round 1 asks again for the
 * failed ids with the same seed (often just missing keys), round 2 changes the seed, round 3 asks for each
 * unit alone. Accepted translations are never requested again, so retries cost only the failing part.
 * A unit that never passes but whose last attempt failed only the checks in `usableDespite` keeps that
 * attempt as its target and stays in `failures`, so it is lettered and flagged instead of replaced by the
 * placeholder; an answer the length limit cut off counts when the unit's own failure is the repeat that
 * ran it past the limit.
 * `contract` says how the model is asked and how its answer is read (tr-contract@2 unless given); `postDict`
 * repairs targets (e.g. untranslated names) before the decisive checks.
 */
export const translatePage = async (
  request: PageRequest,
  complete: CompleteFn,
  seed: number,
  options: {
    contract?: TranslationContract;
    postDict?: (unit: TranslationUnit, target: string) => string;
  } = {},
): Promise<PageTranslation> => {
  const contract = options.contract ?? jsonContract;
  const targets: Record<string, string> = {};
  const failures: Record<string, CheckCode[]> = {};
  const lastResort: Record<string, string> = {};
  let requests = 0;

  const attempt = async (units: TranslationUnit[], attemptSeed: number) => {
    const ids = units.map((unit) => unit.id);
    requests += 1;
    let result;
    try {
      result = await complete({
        messages: contract.buildMessages({ ...request, units }),
        schema: contract.schema(units),
        maxTokens: contract.maxTokens(units),
        seed: attemptSeed,
        temperature: contract.temperature,
        topP: contract.topP,
      });
    } catch (error) {
      if (!isRetryableLlmError(error)) throw error;
      for (const id of ids) failures[id] = ["G0_TRANSPORT"];
      return;
    }
    const check = checkCompletion(units, result, options.postDict, contract.parse);
    for (const unit of units) {
      const { id } = unit;
      if (check.retryIds.includes(id)) {
        const codes = check.unitFailures[id] ?? check.pageFailures;
        failures[id] = codes;
        const candidate = check.targets[id];
        if (candidate !== undefined && codes.every((code) => usableDespite.includes(code))) {
          lastResort[id] = codes.includes("G5_REPEAT") ? collapseRuns(candidate, sourceRepeats(unit.source)) : candidate;
        }
      } else {
        targets[id] = check.targets[id]!;
        delete failures[id];
      }
    }
  };

  const pending = () => request.units.filter((unit) => !(unit.id in targets));

  await attempt(request.units, seed);
  if (pending().length > 0) await attempt(pending(), seed);
  if (pending().length > 0) await attempt(pending(), seed + 1);
  for (const unit of pending()) {
    await attempt([unit], seed + 2);
  }
  for (const unit of pending()) {
    const candidate = lastResort[unit.id];
    if (candidate !== undefined) targets[unit.id] = candidate;
  }
  return { targets, failures, requests };
};
