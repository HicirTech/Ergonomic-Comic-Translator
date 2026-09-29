/**
 * Which way an arrow key turns the page. Right-to-left books (manga) advance with the left arrow, the
 * way the page is turned on paper; left-to-right books advance with the right arrow.
 */
export const pageStep = (key: string, direction: "rtl" | "ltr") => {
  if (key === "ArrowLeft") return direction === "rtl" ? 1 : -1;
  if (key === "ArrowRight") return direction === "rtl" ? -1 : 1;
  if (key === "PageDown" || key === " ") return 1;
  if (key === "PageUp") return -1;
  return 0;
};
