export interface PageRecord {
  id: string;
  volume_id: string;
  ordinal: number;
  image_sha256: string;
  /** File name in the page content store. */
  image_file: string;
  display_name: string;
  width: number;
  height: number;
  kind: "main" | "textless_variant" | "blank";
  variant_of: string | null;
}
