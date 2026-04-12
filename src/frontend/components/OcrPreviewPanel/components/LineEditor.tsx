import React from "react";
import { Alert, Box, Button, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useOcrLines, useOcrActions } from "../OcrEditorContext.tsx";

const LineEditor: React.FC = () => {
  const {
    lines,
    selectedLine,
    selectedLineIndex,
    onUpdateLine,
  } = useOcrLines();
  const {
    isDirty,
    saving,
    saveMessage,
    errorMessage,
    onSave,
  } = useOcrActions();
  const { t } = useTranslation();

  return (
    <Box
      component={Paper}
      elevation={0}
      square
      sx={{
        flex: 1,
        minWidth: 0,
        overflow: "auto",
        p: 2,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderRight: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="subtitle2">{t("ocrPreview.editorTitle")}</Typography>
        <Button variant="contained" size="small" disabled={!isDirty || saving} onClick={onSave}>
          {saving ? t("ocrPreview.saving") : t("ocrPreview.save")}
        </Button>
      </Box>

      {selectedLine ? (
        <>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="caption" color="text.secondary">
              {t("ocrPreview.lineIndex", { index: selectedLineIndex! + 1 })}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={selectedLine.orientation ?? "horizontal"}
              onChange={(_, value) => {
                if (!value || selectedLineIndex === null) return;
                onUpdateLine(selectedLineIndex, (line) => ({ ...line, orientation: value as string }));
              }}
            >
              <ToggleButton value="horizontal">{t("ocrPreview.horizontal")}</ToggleButton>
              <ToggleButton value="vertical">{t("ocrPreview.vertical")}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <TextField
            size="small"
            multiline
            minRows={2}
            value={selectedLine.text}
            onChange={(event) => {
              const nextText = event.target.value;
              if (selectedLineIndex === null) return;
              onUpdateLine(selectedLineIndex, (line) => ({ ...line, text: nextText }));
            }}
          />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ m: "auto" }}>
          {lines.length > 0 ? t("ocrPreview.clickToSelect") : t("ocrPreview.noOcrData")}
        </Typography>
      )}

      {saveMessage && <Alert severity="success">{saveMessage}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
    </Box>
  );
};

export default LineEditor;
