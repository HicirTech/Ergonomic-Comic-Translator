import React, { useEffect, useRef, useState } from "react";
import { Box, Paper, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useOcrLines, useOcrTranslation } from "../OcrEditorContext.tsx";

const TranslationEditor: React.FC = () => {
  const { selectedLineIndex, lines } = useOcrLines();
  const { translatedLines, onUpdateTranslation } = useOcrTranslation();
  const { t } = useTranslation();

  const ocrLineIndex = selectedLineIndex !== null ? (lines[selectedLineIndex]?.lineIndex ?? selectedLineIndex) : null;
  const translatedLine = ocrLineIndex !== null ? translatedLines.find((tl) => tl.lineIndex === ocrLineIndex) : undefined;
  const externalText = translatedLine?.translated ?? "";

  // Local state keeps the TextField responsive while typing; calling onUpdateTranslation on
  // every keystroke rebuilds ctxValue and re-renders all context consumers (SvgOverlay etc.),
  // causing noticeable lag. We commit on blur instead — same pattern used in ContextPanel.
  const [localText, setLocalText] = useState(externalText);
  const lastExternalTextRef = useRef(externalText);

  // Sync when the canonical value changes externally (line selection or page switch).
  useEffect(() => {
    if (lastExternalTextRef.current !== externalText) {
      lastExternalTextRef.current = externalText;
      setLocalText(externalText);
    }
  }, [externalText]);

  return (
    <Box
      component={Paper}
      elevation={0}
      square
      sx={{
        flex: "0 0 33.333%",
        minWidth: 0,
        overflow: "auto",
        p: 2,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderLeft: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
        {t("ocrPreview.translationEditorTitle")}
      </Typography>
      {selectedLineIndex !== null && ocrLineIndex !== null ? (
        <TextField
          size="small"
          multiline
          minRows={2}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={(e) => {
            if (ocrLineIndex !== null) onUpdateTranslation(ocrLineIndex, e.target.value);
          }}
          placeholder={t("ocrPreview.translationPlaceholder")}
          sx={{ flex: 1 }}
        />
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ m: "auto", textAlign: "center" }}
        >
          {t("ocrPreview.selectLineToTranslate")}
        </Typography>
      )}
    </Box>
  );
};

export default TranslationEditor;
