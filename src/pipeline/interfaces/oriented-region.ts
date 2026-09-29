import type { PageRegion, RegionOrientation } from "../../stages/regions/interfaces/index.ts";

export interface OrientedRegion {
  region: PageRegion;
  orientation: RegionOrientation;
}
