import React from "react";
import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useOcrView } from "../OcrEditorContext.tsx";
import PolygonBgColorPicker from "./PolygonBgColorPicker.tsx";

const ImageToolbar: React.FC = () => {
  const { imageMode, isTextlessAvailable, showBoxes, showTranslation, onImageModeChange, onShowBoxesChange, onShowTranslationChange } = useOcrView();
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        position: "absolute",
        left: 12,
        top: 12,
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={imageMode}
        onChange={(_, value) => {
          if (!value) return;
          if (value === "textless" && !isTextlessAvailable) return;
          onImageModeChange(value as "text" | "textless");
        }}
        sx={{ bgcolor: "rgba(0,0,0,0.45)", width: "fit-content" }}
      >
        <ToggleButton value="text" sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.35)" }}>
          {t("ocrPreview.text")}
        </ToggleButton>
        <ToggleButton
          value="textless"
          disabled={!isTextlessAvailable}
          sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.35)" }}
        >
          {t("ocrPreview.textless")}
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={showBoxes ? "show" : "hide"}
        onChange={(_, value) => {
          if (!value) return;
          onShowBoxesChange(value === "show");
        }}
        sx={{ bgcolor: "rgba(0,0,0,0.45)", width: "fit-content" }}
      >
        <ToggleButton value="show" sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.35)" }}>
          {t("ocrPreview.displayBox")}
        </ToggleButton>
        <ToggleButton value="hide" sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.35)" }}>
          {t("ocrPreview.hideBox")}
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={showTranslation ? "show" : "hide"}
        onChange={(_, value) => {
          if (!value) return;
          onShowTranslationChange(value === "show");
        }}
        sx={{ bgcolor: "rgba(0,0,0,0.45)", width: "fit-content" }}
      >
        <ToggleButton value="show" sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.35)" }}>
          {t("ocrPreview.showTranslation")}
        </ToggleButton>
        <ToggleButton value="hide" sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.35)" }}>
          {t("ocrPreview.hideTranslation")}
        </ToggleButton>
      </ToggleButtonGroup>

      <PolygonBgColorPicker />
    </Box>
  );
};

export default ImageToolbar;
