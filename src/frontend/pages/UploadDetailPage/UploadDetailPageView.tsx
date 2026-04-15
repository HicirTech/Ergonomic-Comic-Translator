import OcrPreviewPanel, { type OcrPreviewPanelRef } from "../../components/OcrPreviewPanel/index.tsx";
import React from "react";
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Button,
} from "@mui/material";
import { ArrowBack, AutoStories, DocumentScannerOutlined, CleaningServicesOutlined, TranslateOutlined, AutoFixHighOutlined, PictureAsPdfOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import ImageStripPanel from "../../components/ImageStripPanel/index.tsx";
import ContextPanel from "../../components/ContextPanel/ContextPanelContainer.tsx";
import type { OcrLineSummary } from "../../utils/ocr-line-summary.ts";

export interface UploadDetailPageViewProps {
  uploadId: string;
  selectedPage: number;
  panelRef: React.Ref<OcrPreviewPanelRef>;
  onSelectPage: (index: number) => void;
  onBack: () => void;
  onOcrClick: () => void;
  onOcrPage: (index: number) => void;
  onTextlessClick: () => void;
  onTextlessPage: (index: number) => void;
  onTranslateClick: () => void;
  onTranslatePage: () => void;
  onPolishClick: () => void;
  onExportPdf: () => void;
  exportPdfExporting?: boolean;
  onPagesLoaded: (count: number) => void;
  onPreviewLineSummariesChange: (summaries: OcrLineSummary[]) => void;
  pageLineSummaryOverrides: Record<number, OcrLineSummary[]>;
  allPageLineSummaries: Record<number, OcrLineSummary[]>;
  onAllPageSummariesChange: (summaries: Record<number, OcrLineSummary[]>) => void;
  pageSummaryReloadToken: number;
}

const UploadDetailPageView: React.FC<UploadDetailPageViewProps> = ({
  uploadId,
  selectedPage,
  panelRef,
  onSelectPage,
  onBack,
  onOcrClick,
  onOcrPage,
  onTextlessClick,
  onTextlessPage,
  onTranslateClick,
  onTranslatePage,
  onPolishClick,
  onExportPdf,
  exportPdfExporting = false,
  onPagesLoaded,
  onPreviewLineSummariesChange,
  pageLineSummaryOverrides,
  allPageLineSummaries,
  onAllPageSummariesChange,
  pageSummaryReloadToken,
}) => {
  const { t } = useTranslation();

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={onBack} sx={{ mr: 1 }}>
            <ArrowBack />
          </IconButton>
          <AutoStories sx={{ mr: 1.5, opacity: 0.8 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("detail.title")}
          </Typography>

          {/* Toolbar actions */}
          <Button
            color="inherit"
            variant="outlined"
            size="small"
            startIcon={<DocumentScannerOutlined />}
            onClick={onOcrClick}
            sx={{ borderColor: "rgba(255,255,255,0.4)", "&:hover": { borderColor: "rgba(255,255,255,0.8)" }, mr: 1 }}
          >
            {t("detail.ocrButton")}
          </Button>

          <Button
            color="inherit"
            variant="outlined"
            size="small"
            startIcon={<CleaningServicesOutlined />}
            onClick={onTextlessClick}
            sx={{ borderColor: "rgba(255,255,255,0.4)", "&:hover": { borderColor: "rgba(255,255,255,0.8)" }, mr: 1 }}
          >
            {t("detail.textlessButton")}
          </Button>

          <Button
            color="inherit"
            variant="outlined"
            size="small"
            startIcon={<TranslateOutlined />}
            onClick={onTranslateClick}
            sx={{ borderColor: "rgba(255,255,255,0.4)", "&:hover": { borderColor: "rgba(255,255,255,0.8)" }, mr: 1 }}
          >
            {t("detail.translateButton")}
          </Button>

          <Button
            color="inherit"
            variant="outlined"
            size="small"
            startIcon={<AutoFixHighOutlined />}
            onClick={onPolishClick}
            sx={{ borderColor: "rgba(255,255,255,0.4)", "&:hover": { borderColor: "rgba(255,255,255,0.8)" }, mr: 1 }}
          >
            {t("detail.polishButton")}
          </Button>

          <Button
            color="inherit"
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfOutlined />}
            onClick={onExportPdf}
            disabled={exportPdfExporting}
            sx={{ borderColor: "rgba(255,255,255,0.4)", "&:hover": { borderColor: "rgba(255,255,255,0.8)" } }}
          >
            {exportPdfExporting ? t("detail.exportPdfStarting") : t("detail.exportPdf")}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main body: panel + content */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        <ImageStripPanel
          uploadId={uploadId}
          selectedIndex={selectedPage}
          onSelect={onSelectPage}
          onOcrPage={onOcrPage}
          onTextlessPage={onTextlessPage}
          onPagesLoaded={onPagesLoaded}
          lineSummaryOverrides={pageLineSummaryOverrides}
          summaryReloadToken={pageSummaryReloadToken}
          onAllSummariesChange={onAllPageSummariesChange}
        />

        {/* Main content area */}
        {/* OCR preview panel */}
        <Box sx={{ flex: 1, minWidth: 600, overflow: "hidden" }}>
          <OcrPreviewPanel
            ref={panelRef}
            uploadId={uploadId}
            pageIndex={selectedPage}
            onOcrPage={() => onOcrPage(selectedPage)}
            onTextlessPage={() => onTextlessPage(selectedPage)}
            onTranslatePage={onTranslatePage}
            onLineSummariesChange={onPreviewLineSummariesChange}
            allPageLineSummaries={allPageLineSummaries}
            onSelectPage={onSelectPage}
          />
        </Box>

        {/* Glossary / Context panel */}
        <ContextPanel uploadId={uploadId} onSelectPage={onSelectPage} />
      </Box>
    </Box>
  );
};

export default UploadDetailPageView;

