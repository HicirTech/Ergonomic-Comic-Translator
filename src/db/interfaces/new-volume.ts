import type { IngestedPage } from "../../stages/ingest/interfaces/index.ts";
import type { PageKind } from "../../stages/profile/interfaces/index.ts";
import type { SourceLanguage } from "../../translate/interfaces/index.ts";

export interface NewVolume {
  title: string;
  pages: readonly { page: IngestedPage; kind: PageKind }[];
  sourceLanguage: SourceLanguage | null;
  readingDirection: "rtl" | "ltr" | null;
}
