import React, { useMemo, useState } from "react";
import { Box, Pagination, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useOcrLines, useOcrSummary } from "../OcrEditorContext.tsx";
import type { OcrLineSummary } from "../../../utils/ocr-line-summary.ts";

const ProblemNavigator: React.FC = () => {
  const { lines, onSelectLine } = useOcrLines();
  const { allPageLineSummaries, onSelectPage } = useOcrSummary();
  const { t } = useTranslation();
  const [problemPage, setProblemPage] = useState(1);

  const allProblemEntries = useMemo(() => {
    const entries: { pageIndex: number; summary: OcrLineSummary }[] = [];
    const pageIndices = Object.keys(allPageLineSummaries).map(Number).sort((a, b) => a - b);
    for (const pageIndex of pageIndices) {
      for (const s of allPageLineSummaries[pageIndex]) {
        if (s.status === "long" || s.status === "critical-short") {
          entries.push({ pageIndex, summary: s });
        }
      }
    }
    return entries;
  }, [allPageLineSummaries]);

  if (allProblemEntries.length === 0) return null;

  const handleProblemPageChange = (_: React.ChangeEvent<unknown>, page: number) => {
    setProblemPage(page);
    const entry = allProblemEntries[page - 1];
    if (!entry) return;
    if (onSelectPage) onSelectPage(entry.pageIndex);
    const targetIndex = lines.findIndex((line) => line.lineIndex === entry.summary.lineIndex);
    if (targetIndex >= 0) onSelectLine(targetIndex);
  };

  const currentEntry = allProblemEntries[problemPage - 1] ?? null;

  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        px: 1.5,
        py: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {t("ocrPreview.problemNav", { count: allProblemEntries.length })}
      </Typography>
      <Pagination
        count={allProblemEntries.length}
        page={problemPage}
        onChange={handleProblemPageChange}
        size="small"
        color="primary"
        siblingCount={0}
        boundaryCount={1}
        showFirstButton
        showLastButton
      />
      {currentEntry && (
        <Typography variant="caption" color="error.main" sx={{ lineHeight: 1.4 }}>
          {t("ocrPreview.problemNavCurrent", {
            page: currentEntry.pageIndex + 1,
            line: currentEntry.summary.lineIndex + 1,
            count: currentEntry.summary.charCount,
            status: currentEntry.summary.status === "long"
              ? t("ocrPreview.statusLong")
              : t("ocrPreview.statusCriticalShort"),
          })}
        </Typography>
      )}
    </Box>
  );
};

export default ProblemNavigator;
