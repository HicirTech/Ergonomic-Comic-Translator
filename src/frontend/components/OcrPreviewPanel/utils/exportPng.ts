/**
 * WYSIWYG page export to PNG.
 *
 * Renders what is currently visible on screen:
 *   - The page image (text or textless variant, whichever is active)
 *   - The SVG overlay (polygon outlines and/or translation text) if visible
 *
 * Interactive drag handles (SVG <circle> elements) are stripped before export.
 */
export async function exportPageAsPng(
  imgUrl: string,
  naturalSize: { w: number; h: number },
  svgEl: SVGSVGElement | null,
  filename: string,
): Promise<void> {
  const { w, h } = naturalSize;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // ── 1. Draw the page image ─────────────────────────────────────────────
  const imgBlob = await fetch(imgUrl).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
    return r.blob();
  });
  const imgObjectUrl = URL.createObjectURL(imgBlob);
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        resolve();
      };
      img.onerror = () => reject(new Error("Image failed to load for export"));
      img.src = imgObjectUrl;
    });
  } finally {
    URL.revokeObjectURL(imgObjectUrl);
  }

  // ── 2. Draw the SVG overlay ────────────────────────────────────────────
  // Skip when no SVG or when it has no rendered children (both showBoxes and
  // showTranslation are off → the SVG contains no visible elements).
  if (svgEl && svgEl.children.length > 0) {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;

    // Remove interactive drag handles — they should not appear in the export.
    for (const circle of Array.from(clone.querySelectorAll("circle"))) {
      circle.remove();
    }

    // Give the cloned SVG explicit pixel dimensions so the browser renders it
    // at native image resolution rather than the on-screen display size.
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgObjectUrl = URL.createObjectURL(svgBlob);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h);
          resolve();
        };
        img.onerror = () => reject(new Error("SVG overlay failed to render for export"));
        img.src = svgObjectUrl;
      });
    } finally {
      URL.revokeObjectURL(svgObjectUrl);
    }
  }

  // ── 3. Trigger download ────────────────────────────────────────────────
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      // Small delay before revoke to allow the download to start
      setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 500);
    }, "image/png");
  });
}
