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
] as const;

/** Two to four lines. Vertical blocks lay these out as columns from right to left. */
export const lineGroups = [
  ["今日は良い天気です。", "猫が窓の外を見ている。"],
  ["駅で友達を待っている。", "お茶を一杯ください。", "明日の朝に散歩する。"],
  ["今天天氣很好。", "請把門關上。", "我在這裏等你。"],
  ["The cat waits.", "Read this line.", "Then close the door."],
  ["今日は良い天気です。", "猫が窓の外を見ている。", "お茶を一杯ください。", "駅で友達を待っている。"],
] as const;

export const corpusTexts = [...new Set<string>([...singleSentences, ...lineGroups.flat()])];
