/** Original short lines. The same strings are painted horizontally and vertically so CER can be paired. */
export const singleSentences = [
  "今日は良い天気です。",
  "駅で友達を待っている。",
  "猫が窓の外を見ている。",
  "お茶を一杯ください。",
  "今天天氣很好。",
  "請把門關上。",
  "The cat waits.",
  "Read this line.",
  // Trailing dot leaders: the line detector tends to stop before them, and then they are neither read nor erased.
  "そうかもしれないけど・・・・",
  "まだ分からない……",
] as const;

/** Two to four lines. Vertical blocks lay these out as columns from right to left. */
export const lineGroups = [
  ["今日は良い天気です。", "猫が窓の外を見ている。"],
  ["駅で友達を待っている。", "お茶を一杯ください。", "明日の朝に散歩する。"],
  ["今天天氣很好。", "請把門關上。", "我在這裏等你。"],
  ["The cat waits.", "Read this line.", "Then close the door."],
  ["今日は良い天気です。", "猫が窓の外を見ている。", "お茶を一杯ください。", "駅で友達を待っている。"],
  ["それならいいけど・・・・", "まだ分からない……"],
] as const;

/** Art lettering (sound effects). Painted into the background: the owner's rule leaves it untranslated and uncleaned. */
export const sfxTexts = ["ドドド", "ゴゴゴ", "バーン", "ザワッ"] as const;

export const corpusTexts = [...new Set<string>([...singleSentences, ...lineGroups.flat(), ...sfxTexts])];
