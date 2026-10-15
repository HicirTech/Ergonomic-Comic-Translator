/** A short unit repeated at least this often is a cry: the model sees it a few times and the answer is stretched back. */
const cryMinRepeats = 8;
const cryShownRepeats = 3;
const cryMaxUnitChars = 4;
/** An answer repeats when its first unit comes at least twice. */
const answerMinRepeats = 2;

export interface Cry {
  unit: string;
  repeats: number;
  tail: string;
}

/** The leading run of `text` made of its first `unitChars` characters: the unit, how often it repeats, and the rest. */
const leadingRun = (text: string, unitChars: number) => {
  const chars = [...text];
  const unit = chars.slice(0, unitChars).join("");
  let repeats = 0;
  while (chars.slice(repeats * unitChars, (repeats + 1) * unitChars).join("") === unit && unit !== "") repeats += 1;
  return { unit, repeats, tail: chars.slice(repeats * unitChars).join("") };
};

/** The shortest unit whose leading run repeats at least `minRepeats` times, or null. */
const repetitionOf = (text: string, minRepeats: number) => {
  for (let unitChars = 1; unitChars <= cryMaxUnitChars; unitChars += 1) {
    const run = leadingRun(text, unitChars);
    if (run.repeats >= minRepeats) return run;
  }
  return null;
};

/** The cry a source is, or null. A model asked for a hundred repeats runs on until cut off; three it translates. */
export const cryOf = (source: string): Cry | null => repetitionOf(source, cryMinRepeats);

export const shownCry = (cry: Cry) => cry.unit.repeat(cryShownRepeats) + cry.tail;

/** The answer to the shown cry, repeated as often as the source repeats; an answer that does not repeat stays as it is. */
export const stretchCry = (target: string, cry: Cry) => {
  const run = repetitionOf(target, answerMinRepeats);
  return run ? run.unit.repeat(cry.repeats) + run.tail : target;
};
