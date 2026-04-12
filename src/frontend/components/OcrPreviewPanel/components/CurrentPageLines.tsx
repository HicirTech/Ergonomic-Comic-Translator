import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { ErrorOutlineOutlined, RadioButtonUnchecked, WarningAmberOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useOcrLines } from "../OcrEditorContext.tsx";

const getSummaryColor = (status: "normal" | "long" | "short" | "critical-short") => {
  switch (status) {
    case "long":
      return "warning.main";
    case "critical-short":
      return "error.main";
    case "short":
      return "text.disabled";
    default:
      return "success.main";
  }
};

const CurrentPageLines: React.FC = () => {
  const { lines, lineSummaries, selectedLineIndex, onSelectLine } = useOcrLines();
  const { t } = useTranslation();

  return (
    <>
      <Box sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="subtitle2">{t("ocrPreview.currentPageLines")}</Typography>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {lineSummaries.length > 0 ? lineSummaries.map((summary) => {
          const targetIndex = lines.findIndex((line) => line.lineIndex === summary.lineIndex);
          const isSelected = selectedLineIndex === targetIndex;
          return (
            <Box
              key={`summary-${summary.lineIndex}`}
              onClick={() => {
                if (targetIndex < 0) return;
                onSelectLine(targetIndex);
              }}
              sx={{
                p: 1,
                borderRadius: 1,
                border: "1px solid",
                borderColor:
                  isSelected
                    ? "primary.main"
                    : summary.hasWarning
                      ? "warning.main"
                      : summary.hasCriticalShortWarning
                        ? "error.main"
                        : summary.hasShortWarning
                          ? "text.disabled"
                          : "divider",
                bgcolor: isSelected ? "action.selected" : "background.default",
                cursor: targetIndex >= 0 ? "pointer" : "default",
                transition: "background-color 0.15s ease, border-color 0.15s ease",
                "&:hover": targetIndex >= 0 ? { bgcolor: "action.hover" } : undefined,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {t("ocrPreview.lineIndex", { index: summary.lineIndex + 1 })}
                </Typography>
                {summary.hasWarning && (
                  <Tooltip title={t("ocrPreview.lineTooLong", { count: summary.charCount })}>
                    <WarningAmberOutlined fontSize="inherit" sx={{ color: "warning.main", fontSize: 18 }} />
                  </Tooltip>
                )}
                {summary.hasCriticalShortWarning && (
                  <Tooltip title={t("ocrPreview.lineTooShortCritical", { count: summary.charCount })}>
                    <ErrorOutlineOutlined fontSize="inherit" sx={{ color: "error.main", fontSize: 18 }} />
                  </Tooltip>
                )}
                {summary.hasShortWarning && (
                  <Tooltip title={t("ocrPreview.lineTooShort", { count: summary.charCount })}>
                    <RadioButtonUnchecked fontSize="inherit" sx={{ color: "text.disabled", fontSize: 18 }} />
                  </Tooltip>
                )}
                <Typography variant="caption" color={getSummaryColor(summary.status)}>
                  {t("ocrPreview.charCount", { count: summary.charCount })}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {summary.text || "-"}
              </Typography>
            </Box>
          );
        }) : (
          <Typography variant="body2" color="text.secondary">
            {t("ocrPreview.noLinesOnPage")}
          </Typography>
        )}
      </Box>
    </>
  );
};

export default CurrentPageLines;
