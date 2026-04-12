export const supportedOcrModels = ["paddleocr", "paddleocr-vl-1.5"] as const;

export type OcrModel = (typeof supportedOcrModels)[number];
