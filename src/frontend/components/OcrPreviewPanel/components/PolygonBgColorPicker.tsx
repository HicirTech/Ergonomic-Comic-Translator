import React, { useRef, useState } from "react";
import { Box, Popover, Slider, Tooltip, Typography } from "@mui/material";
import { PaletteOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useOcrView } from "../OcrEditorContext.tsx";

/** Parse "rgba(r,g,b,a)" → { hex: "#rrggbb", alpha: 0-100 } */
function parseRgba(color: string): { hex: string; alpha: number } {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { hex: "#000000", alpha: 72 };
  const [, r, g, b, a] = m;
  const toHex = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
  return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, alpha: Math.round(parseFloat(a ?? "1") * 100) };
}

/** Build "rgba(r,g,b,a)" from "#rrggbb" hex + alpha 0-100 */
function buildRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${(alpha / 100).toFixed(2)})`;
}

const PolygonBgColorPicker: React.FC = () => {
  const { polygonBgColor, onPolygonBgColorChange } = useOcrView();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const { hex, alpha } = parseRgba(polygonBgColor);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPolygonBgColorChange(buildRgba(e.target.value, alpha));
  };
  const handleAlphaChange = (_: Event, value: number | number[]) => {
    onPolygonBgColorChange(buildRgba(hex, value as number));
  };

  return (
    <>
      <Tooltip title={t("ocrPreview.polygonBgColor")} placement="right">
        <Box
          component="button"
          ref={anchorRef}
          onClick={() => setOpen(true)}
          sx={{
            width: 32,
            height: 32,
            border: "2px solid rgba(255,255,255,0.5)",
            borderRadius: 1,
            cursor: "pointer",
            bgcolor: polygonBgColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 0,
            "&:hover": { borderColor: "rgba(255,255,255,0.9)" },
          }}
        >
          <PaletteOutlined sx={{ fontSize: 16, color: alpha < 30 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)" }} />
        </Box>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 2, width: 220 } } }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          {t("ocrPreview.polygonBgColor")}
        </Typography>

        {/* RGB color input */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <Box
            component="input"
            type="color"
            value={hex}
            onChange={handleHexChange}
            sx={{ width: 40, height: 32, border: "none", cursor: "pointer", p: 0, borderRadius: 1 }}
          />
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{hex}</Typography>
        </Box>

        {/* Alpha slider */}
        <Typography variant="caption" color="text.secondary">
          {t("ocrPreview.polygonBgAlpha")}: {alpha}%
        </Typography>
        <Slider
          size="small"
          min={0}
          max={100}
          value={alpha}
          onChange={handleAlphaChange}
          sx={{ mt: 0.5 }}
        />

        {/* Preview swatch */}
        <Box
          sx={{
            mt: 1,
            height: 28,
            borderRadius: 1,
            bgcolor: polygonBgColor,
            border: "1px solid",
            borderColor: "divider",
            backgroundImage: "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
            position: "relative",
          }}
        >
          <Box sx={{ position: "absolute", inset: 0, bgcolor: polygonBgColor, borderRadius: "inherit" }} />
        </Box>
      </Popover>
    </>
  );
};

export default PolygonBgColorPicker;
