import type { ChatMessage } from "../llm/interfaces/index.ts";
import { checkCompletion } from "../qa/decisive-checks.ts";
import type { CheckCode } from "../qa/interfaces/index.ts";
import { buildMessages, maxTokensFor, outputSchema } from "./contract.ts";
import type { CompleteFn, PageRequest, PageTranslation, TranslationUnit } from "./interfaces/index.ts";

/**
 * L1 and L1r for one page: translate all units, then retry only what failed. Round 1 asks again for the
 * failed ids with the same seed (often just missing keys), round 2 changes the seed, round 3 asks for each
 * unit alone. Accepted translations are never requested again, so retries cost only the failing part.
 */
export const translatePage = async (
  request: PageRequest,
  complete: CompleteFn,
  seed: number,
  buildRequestMessages: (request: PageRequest) => ChatMessage[] = buildMessages,
): Promise<PageTranslation> => {
  const targets: Record<string, string> = {};
  const failures: Record<string, CheckCode[]> = {};
  let requests = 0;

  const attempt = async (units: TranslationUnit[], attemptSeed: number) => {
    const ids = units.map((unit) => unit.id);
    requests += 1;
    const result = await complete(buildRequestMessages({ ...request, units }), outputSchema(ids), maxTokensFor(units.length), attemptSeed);
    const check = checkCompletion(units, result);
    for (const id of ids) {
      if (check.retryIds.includes(id)) {
        failures[id] = check.unitFailures[id] ?? check.pageFailures;
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
  return { targets, failures, requests };
};
