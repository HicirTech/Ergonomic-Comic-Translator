import type { TextField } from "./text-field.ts";

export interface NewTextRevision {
  utteranceId: string;
  field: TextField;
  value: string;
  origin: "ocr" | "ocr_second" | "mt_l1" | "mt_l1r" | "mt_l2" | "mt_l3" | "mt_l4" | "shorten" | "term_apply" | "user" | "user_choice";
  createdBy: "machine" | "user";
  modelSha?: string | null;
  provider?: string | null;
  backend?: string | null;
  tier?: string | null;
  inputKey?: string | null;
  seed?: number | null;
  checksJson?: string | null;
}
