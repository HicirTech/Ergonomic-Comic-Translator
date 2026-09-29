import type { Light } from "./light.ts";
import type { LightReason } from "./light-reason.ts";

export interface LightAssessment {
  light: Light;
  reasons: LightReason[];
}
