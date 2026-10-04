type Rgb = readonly [number, number, number];

/** The lines of one dialogue are set in one ink: their colours agree within this much on every channel. */
const sameInkTolerance = 48;
/**
 * An ink or an outline whose largest and smallest channel are this far apart is a colour. Measured on two
 * volumes: dialogue and captions are black or white (a spread of 3 at most), drawn lettering is pink, olive
 * with a yellow outline, and the like (53 and more on the ink or the outline).
 */
const colouredSpread = 40;

export const sameInk = (first: Rgb, second: Rgb) => first.every((value, channel) => Math.abs(value - second[channel]!) <= sameInkTolerance);

export const isColoured = (colour: Rgb) => Math.max(...colour) - Math.min(...colour) >= colouredSpread;
