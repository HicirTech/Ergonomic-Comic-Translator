/** How a region's text is drawn, as far as it tells typeset dialogue from art lettering. */
export interface LetteringCues {
  /** The ink or the outline is a colour: dialogue and captions are set in black, white or grey. */
  coloured: boolean;
  /** The glyphs carry an outline. */
  outlined: boolean;
  /** Another region of the same bubble holds more text, and this one is not set in that text's ink. */
  otherInkThanBubble: boolean;
  /** No other region stands in the bubble: the "bubble" may be a shape the lettering is drawn on. */
  aloneInBubble: boolean;
  /** The reader is not sure of the text: drawn lettering reads worse than type. */
  readUnsure: boolean;
}
