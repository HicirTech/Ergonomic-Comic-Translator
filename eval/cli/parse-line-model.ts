import type { LineModel } from "../../src/stages/lines/interfaces/index.ts";

/** What the evals run when --lines is absent: the line detector the product runs. */
export const defaultLineModel: LineModel = "mobile";

/** A Record, so the compiler flags a line model that is added to the type but not accepted here. */
const lineModelFlags: Record<LineModel, true> = { mobile: true, server: true };

const isLineModel = (value: string): value is LineModel => Object.hasOwn(lineModelFlags, value);

/** The line model a --lines value names, or null when it names none. */
export const parseLineModel = (value: string) => (isLineModel(value) ? value : null);
