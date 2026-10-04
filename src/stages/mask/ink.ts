type Rgb = readonly [number, number, number];

/** The lines of one dialogue are set in one ink: their colours agree within this much on every channel. */
const sameInkTolerance = 48;
/**
 * An ink or an outline whose largest and smallest channel are this far apart is a colour. Measured on the
 * 485 regions of two volumes: dialogue and captions are black, white or grey, a spread of 15 at most (one
 * region 22); drawn lettering is blue-black, slate, pink, olive with a yellow outline, 27 and more on the
 * ink or the outline.
 */
const colouredSpread = 24;

export const sameInk = (first: Rgb, second: Rgb) => first.every((value, channel) => Math.abs(value - second[channel]!) <= sameInkTolerance);

export const isColoured = (colour: Rgb) => Math.max(...colour) - Math.min(...colour) >= colouredSpread;
