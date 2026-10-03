/** How one cluster member read: its largest difference boxes against the other members, and how many showed text. */
export interface MemberReading {
  ordinal: number;
  readBoxCount: number;
  readableBoxCount: number;
}
