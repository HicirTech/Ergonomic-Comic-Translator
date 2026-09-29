import { cacheKey, seedFromKey } from "../core/cache-key.ts";
import { isRetryableLlmError } from "../llm/retryable.ts";
import { findCandidates } from "../terms/candidates.ts";
import { chunkLines, extractContractVersion, extractMaxTokens, extractMessages, extractSchema, validateExtraction } from "../terms/extract-contract.ts";
import { applyFixAnswer, fixBatches, fixContractVersion, fixMessages, fixSchema } from "../terms/fix-contract.ts";
import { freezeGlossary, resolveTerms } from "../terms/freeze.ts";
import type { ExtractedEntity, FixedTerm, SourceLine } from "../terms/interfaces/index.ts";
import { mergeEntities } from "../terms/merge.ts";
import type { CompleteFn, SourceLanguage } from "../translate/interfaces/index.ts";

/** Answer budget of one term-translate@1 batch (15 items of at most ~60 tokens). */
const fixMaxTokens = 1024;

/** Runs `work` once more with the next seed after a retryable failure; null if both attempts fail. */
const withOneRetry = async <T>(work: (seed: number) => Promise<T>, seed: number) => {
  for (const attemptSeed of [seed, seed + 1]) {
    try {
      return await work(attemptSeed);
    } catch (error) {
      // The chunk or batch is retried once, then skipped: term fixing never blocks the volume.
      if (!isRetryableLlmError(error)) throw error;
    }
  }
  return null;
};

/**
 * S7 barrier for a volume: rule candidates, chunked extraction with evidence checks and chunk votes,
 * deterministic merge, name fixing with context from the whole volume, then resolution and freeze.
 * Failed chunks and batches are skipped and counted, never fatal.
 */
export const buildGlossary = async (lines: readonly SourceLine[], language: SourceLanguage, complete: CompleteFn, modelSha: string) => {
  const hints = findCandidates(lines, language).map((candidate) => candidate.normKey);
  const chunks = chunkLines(lines);
  const extracted: ExtractedEntity[][] = [];
  let skippedChunks = 0;
  const known: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const chunkHints = hints.filter((hint) => chunk.some((line) => line.text.includes(hint)));
    const seed = seedFromKey(cacheKey({ stage: "terms-extract", contract: extractContractVersion, modelSha, lines: chunk.map((line) => line.text) }));
    const entities = await withOneRetry(async (attemptSeed) => {
      const result = await complete(extractMessages(language, index, chunk, chunkHints, known), extractSchema, extractMaxTokens, attemptSeed);
      return validateExtraction(result.content, chunk);
    }, seed);
    if (entities === null) {
      skippedChunks += 1;
      continue;
    }
    extracted.push(entities);
    for (const entity of entities) if (entity.kind === "person" && !known.includes(entity.src)) known.push(entity.src);
  }

  const merged = mergeEntities(extracted, lines);
  const fixed: FixedTerm[] = [];
  let unfixed = 0;
  for (const batch of fixBatches(merged)) {
    const seed = seedFromKey(cacheKey({ stage: "terms-fix", contract: fixContractVersion, modelSha, batch: batch.map((term) => term.canonical) }));
    const answer = await withOneRetry(async (attemptSeed) => {
      const result = await complete(fixMessages(language, batch, lines, fixed), fixSchema(batch), fixMaxTokens, attemptSeed);
      return applyFixAnswer(result.content, batch);
    }, seed);
    if (answer === null) {
      unfixed += batch.length;
      continue;
    }
    fixed.push(...answer.fixed);
    unfixed += answer.unanswered.length;
  }

  const { terms, conflicts } = resolveTerms(fixed);
  return { terms, conflicts, glossary: freezeGlossary(terms), skippedChunks, unfixed };
};
