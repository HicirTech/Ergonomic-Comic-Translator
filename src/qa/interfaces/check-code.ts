/**
 * Decisive checks (they trigger retries and fallbacks):
 * - G0 structure: unparsable JSON, missing or extra ids, empty values, truncation, leaked reasoning;
 * - G1 refusal or meta talk the source does not contain;
 * - G1b echo of the source instead of a translation;
 * - G3 untranslated kana or hangul left in the output;
 * - G5 degenerate repetition.
 */
export type CheckCode = "G0_JSON" | "G0_KEYS" | "G0_EMPTY" | "G0_TRUNCATED" | "G0_REASONING" | "G1_REFUSAL" | "G1B_ECHO" | "G3_RESIDUE" | "G5_REPEAT";
