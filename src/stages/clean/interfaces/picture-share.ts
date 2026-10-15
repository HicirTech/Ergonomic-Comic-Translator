/** How much of the picture shows around each masked pixel, with the tones of the rim the membrane drew it from. */
export interface PictureShare {
  /** Per page pixel: 0 where the paper around the text is plain, 1 where the picture meets it; 0 outside the mask. */
  share: Float32Array;
  /** Per page pixel: the mean tone of the rim as the membrane weights it, in levels; 0 outside the mask. */
  rimTone: Float32Array;
  /** Per page pixel: the spread of those tones, in levels; 0 outside the mask. */
  rimSpread: Float32Array;
}
