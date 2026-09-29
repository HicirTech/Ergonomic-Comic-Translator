import { describe, expect, it } from "bun:test";
import { defaultReadingDirection, detectSourceLanguage } from "../../src/stages/lang/detect-language.ts";

describe("detectSourceLanguage", () => {
  it("tells the four source languages apart by script", () => {
    expect(detectSourceLanguage(["今日は学校に行かない", "先生が来るまで待っていよう"])?.language).toBe("ja");
    expect(detectSourceLanguage(["오늘은 학교에 가지 않을 거야", "선생님이 올 때까지 기다리자"])?.language).toBe("ko");
    expect(detectSourceLanguage(["今天我們不去學校了", "等老師來了再說吧好不好"])?.language).toBe("zh-Hant");
    expect(detectSourceLanguage(["We are not going to school today", "Let's wait for the teacher"])?.language).toBe("en");
  });

  it("keeps Japanese with some English and a Hangul SFX", () => {
    const result = detectSourceLanguage(["OKだよ、じゃあまた明日ね", "ドキドキ", "쾅", "本当に大丈夫なのか"]);
    expect(result?.language).toBe("ja");
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it("refuses to guess from a handful of letters", () => {
    expect(detectSourceLanguage(["えっ", "!?"])).toBeNull();
  });
});

describe("defaultReadingDirection", () => {
  it("reads Japanese and Chinese right to left", () => {
    expect(["ja", "zh-Hant", "ko", "en"].map((language) => defaultReadingDirection(language as "ja"))).toEqual(["rtl", "rtl", "ltr", "ltr"]);
  });
});
