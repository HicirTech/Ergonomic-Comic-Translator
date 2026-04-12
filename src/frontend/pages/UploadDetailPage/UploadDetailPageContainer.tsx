import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import OcrDialog from "../../components/OcrDialog/index.tsx";
import TextlessDialog from "../../components/TextlessDialog/index.tsx";
import TranslateDialog from "../../components/TranslateDialog/index.tsx";
import type { TranslateScope } from "../../components/TranslateDialog/TranslateDialogView.tsx";
import UploadDetailPageView from "./UploadDetailPageView.tsx";
import {
  enqueueOcrPage,
  enqueueTextlessPage,
  fetchOcrConfig,
  fetchOcrJobStatus,
  fetchTextlessJobStatus,
  fetchUploadPages,
  fetchAllOcrPageLines,
  fetchAllTranslationPages,
  getUploadPageUrl,
  getTextlessPageUrl,
} from "../../api/index.ts";
import type { OcrPreviewPanelRef } from "../../components/OcrPreviewPanel/index.tsx";
import { sameOcrSummaries, type OcrLineSummary } from "../../utils/ocr-line-summary.ts";
import { exportAllPagesAsPdf } from "../../components/OcrPreviewPanel/utils/exportPdf.ts";
import { usePageNavigation } from "./usePageNavigation.ts";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.ts";

const MAX_PAGE_HISTORY_STEPS = 5;

const UploadDetailPageContainer: React.FC = () => {
  const { t } = useTranslation();
  const { uploadId } = useParams<{ uploadId: string }>();
  const navigate = useNavigate();
  const { selectedPage, handleSelectPage, undoPageSwitch, redoPageSwitch, pageCountRef, setPageCount } = usePageNavigation(uploadId);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrPageOpen, setOcrPageOpen] = useState(false);
  const [ocrPageIndex, setOcrPageIndex] = useState<number | null>(null);
  const [ocrModels, setOcrModels] = useState<string[]>(["paddleocr", "paddleocr-vl-1.5"]);
  const [ocrModel, setOcrModel] = useState("paddleocr-vl-1.5");
  const [ocrLanguage, setOcrLanguage] = useState("japan");
  const [ocrSubmitting, setOcrSubmitting] = useState(false);
  const [ocrPageError, setOcrPageError] = useState<string | null>(null);
  const [textlessPageOpen, setTextlessPageOpen] = useState(false);
  const [textlessPageSubmitting, setTextlessPageSubmitting] = useState(false);
  const [textlessPageProgress, setTextlessPageProgress] = useState<{ current: number; total: number } | null>(null);
  const [textlessPageError, setTextlessPageError] = useState<string | null>(null);
  const [textlessOpen, setTextlessOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateScope, setTranslateScope] = useState<TranslateScope>("all");
  const panelRef = useRef<OcrPreviewPanelRef>(null);
  const [pageLineSummaryOverrides, setPageLineSummaryOverrides] = useState<Record<number, OcrLineSummary[]>>({});
  const [allPageLineSummaries, setAllPageLineSummaries] = useState<Record<number, OcrLineSummary[]>>({});
  const [pageSummaryReloadToken, setPageSummaryReloadToken] = useState(0);
  const [exportPdfExporting, setExportPdfExporting] = useState(false);
  const [exportPdfProgress, setExportPdfProgress] = useState<{ done: number; total: number } | null>(null);

  const handleBack = () => navigate("/");

  useEffect(() => {
    setPageLineSummaryOverrides({});
    setAllPageLineSummaries({});
    setPageSummaryReloadToken(0);
  }, [uploadId]);

  useKeyboardShortcuts({ panelRef, selectedPage, pageCountRef, handleSelectPage, undoPageSwitch, redoPageSwitch });

  const refreshPageSummaries = () => {
    setPageSummaryReloadToken((current) => current + 1);
  };

  useEffect(() => {
    if (!ocrPageOpen) return;
    fetchOcrConfig()
      .then((cfg) => {
        setOcrModels(cfg.supportedModels);
        setOcrModel(cfg.currentModel);
        setOcrLanguage(cfg.currentLanguage);
      })
      .catch(console.error);
  }, [ocrPageOpen]);

  const saveCurrentPageIfDirty = async () => {
    await panelRef.current?.saveIfDirty();
  };

  const refreshCurrentPreviewPage = async () => {
    await panelRef.current?.reloadPage();
  };

  const handleExportPdf = useCallback(async () => {
    if (!uploadId) return;
    const viewState = panelRef.current?.getViewState();
    const showBoxes = viewState?.showBoxes ?? true;
    const showTranslation = viewState?.showTranslation ?? false;
    const imageMode = viewState?.imageMode ?? "text";
    const isTextlessAvailable = viewState?.isTextlessAvailable ?? false;
    const polygonBgColor = viewState?.polygonBgColor;

    setExportPdfExporting(true);
    setExportPdfProgress(null);
    try {
      await panelRef.current?.saveIfDirty();
      const [pages, allOcr, allTranslations] = await Promise.all([
        fetchUploadPages(uploadId),
        fetchAllOcrPageLines(uploadId),
        fetchAllTranslationPages(uploadId),
      ]);
      const pageCount = pages.length;
      setExportPdfProgress({ done: 0, total: pageCount });

      const ocrMap = new Map(allOcr.map((p) => [p.pageNumber, p.lines]));
      const translationMap = new Map(allTranslations.map((p) => [p.pageNumber, p.lines]));

      const getImageUrl = (i: number) => {
        if (imageMode === "textless" && isTextlessAvailable) return getTextlessPageUrl(uploadId, i);
        return getUploadPageUrl(uploadId, i);
      };

      await exportAllPagesAsPdf({
        pageCount,
        getImageUrl,
        ocrPageLines: ocrMap,
        translationPageLines: translationMap,
        showBoxes,
        showTranslation,
        polygonBgColor,
        filename: `${uploadId}.pdf`,
        onProgress: (done, total) => setExportPdfProgress({ done, total }),
      });
    } catch (err) {
      console.error("[export-pdf]", err);
    } finally {
      setExportPdfExporting(false);
      setExportPdfProgress(null);
    }
  }, [uploadId]);

  const handlePreviewLineSummariesChange = useCallback((nextSummaries: OcrLineSummary[]) => {
    setPageLineSummaryOverrides((current) => {
      const existing = current[selectedPage];
      if (existing && sameOcrSummaries(existing, nextSummaries)) return current;
      return { ...current, [selectedPage]: nextSummaries };
    });
  }, [selectedPage]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForOcrSettled = async (): Promise<string | null> => {
    if (!uploadId) return null;
    for (let i = 0; i < 240; i += 1) {
      const status = await fetchOcrJobStatus(uploadId);
      if (status.status !== "Queued" && status.status !== "Processing") return status.lastError;
      await sleep(1500);
    }
    return null;
  };

  const handleTextlessPage = async (pageIndex: number) => {
    if (!uploadId) return;
    setTextlessPageOpen(true);
    setTextlessPageSubmitting(true);
    setTextlessPageProgress({ current: 0, total: 1 });
    setTextlessPageError(null);
    if (pageIndex === selectedPage) {
      await saveCurrentPageIfDirty();
    }
    try {
      await enqueueTextlessPage(uploadId, pageIndex + 1);

      const targetPage = pageIndex + 1;
      for (let i = 0; i < 240; i += 1) {
        await sleep(1500);
        const status = await fetchTextlessJobStatus(uploadId);
        const pageStatus = status.pageStatuses.find((p) => p.pageNumber === targetPage)?.status;
        const done = pageStatus === "completed" || pageStatus === "failed";
        setTextlessPageProgress({ current: done ? 1 : 0, total: 1 });
        if (done) {
          if (pageStatus === "failed") {
            setTextlessPageError(status.lastError ?? "Page processing failed");
          }
          break;
        }
      }

      if (pageIndex === selectedPage) {
        await refreshCurrentPreviewPage();
      }
      refreshPageSummaries();
    } catch (err) {
      console.error("[textless-page]", err);
      setTextlessPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setTextlessPageSubmitting(false);
      setTextlessPageProgress(null);
    }
  };

  const openOcrPageDialog = (pageIndex: number) => {
    setOcrPageIndex(pageIndex);
    setOcrPageOpen(true);
  };

  const handleOcrPageConfirm = async () => {
    if (!uploadId || ocrPageIndex === null) return;
    setOcrSubmitting(true);
    setOcrPageError(null);
    try {
      if (ocrPageIndex === selectedPage) {
        await saveCurrentPageIfDirty();
      }
      await enqueueOcrPage(uploadId, ocrPageIndex + 1, ocrModel, ocrLanguage);
      const lastError = await waitForOcrSettled();
      if (lastError) {
        setOcrPageError(lastError);
        return;
      }
      if (ocrPageIndex === selectedPage) {
        await refreshCurrentPreviewPage();
      }
      refreshPageSummaries();
      setOcrPageOpen(false);
      setOcrPageIndex(null);
    } catch (err) {
      console.error("[ocr-page]", err);
      setOcrPageError(err instanceof Error ? err.message : String(err));
    } finally {
      setOcrSubmitting(false);
    }
  };

  // uploadId is guaranteed by the route definition (/upload/:uploadId)
  if (!uploadId) return null;

  return (
    <>
      <UploadDetailPageView
        uploadId={uploadId}
        selectedPage={selectedPage}
        panelRef={panelRef}
        onSelectPage={handleSelectPage}
        onBack={handleBack}
        onOcrClick={() => setOcrOpen(true)}
        onOcrPage={(index) => { openOcrPageDialog(index); }}
        onTextlessClick={() => setTextlessOpen(true)}
        onTextlessPage={(index) => { void handleTextlessPage(index); }}
        onTranslateClick={() => { setTranslateScope("all"); setTranslateOpen(true); }}
        onTranslatePage={() => { setTranslateScope("page"); setTranslateOpen(true); }}
        onPagesLoaded={setPageCount}
        onExportPdf={() => { void handleExportPdf(); }}
        exportPdfExporting={exportPdfExporting}
        onPreviewLineSummariesChange={handlePreviewLineSummariesChange}
        pageLineSummaryOverrides={pageLineSummaryOverrides}
        allPageLineSummaries={allPageLineSummaries}
        onAllPageSummariesChange={setAllPageLineSummaries}
        pageSummaryReloadToken={pageSummaryReloadToken}
      />
      <OcrDialog
        open={ocrOpen}
        uploadId={uploadId}
        onClose={() => setOcrOpen(false)}
        onSuccess={() => {
          setOcrOpen(false);
          void refreshCurrentPreviewPage();
          refreshPageSummaries();
        }}
      />
      <Dialog open={ocrPageOpen} onClose={ocrSubmitting ? undefined : () => { setOcrPageOpen(false); setOcrPageError(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>{t("ocrPageDialog.title")}</DialogTitle>
        {ocrSubmitting && <LinearProgress sx={{ mx: 0 }} />}
        <DialogContent>
          {ocrPageError && (
            <Alert severity="error" sx={{ mt: 1, mb: 1 }}>
              {ocrPageError}
            </Alert>
          )}
          <TextField
            select
            fullWidth
            size="small"
            label={t("ocrDialog.model")}
            value={ocrModel}
            onChange={(e) => setOcrModel(e.target.value)}
            disabled={ocrSubmitting}
            sx={{ mt: 2 }}
          >
            {ocrModels.map((m) => (
              <MenuItem key={m} value={m}>{m}</MenuItem>
            ))}
          </TextField>
          <Autocomplete
            freeSolo
            options={["japan", "ch", "chinese_cht", "en", "korean", "vi", "fr", "german", "it", "es", "pt", "ru", "ar"]}
            value={ocrLanguage}
            onChange={(_, v) => setOcrLanguage(v ?? "")}
            onInputChange={(_, v) => setOcrLanguage(v)}
            disabled={ocrSubmitting}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={t("ocrDialog.language")}
                sx={{ mt: 2 }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOcrPageOpen(false)} disabled={ocrSubmitting}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={() => { void handleOcrPageConfirm(); }} disabled={ocrSubmitting}>
            {ocrSubmitting ? t("ocrPageDialog.starting") : t("ocrPageDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <TextlessDialog
        open={textlessOpen}
        uploadId={uploadId}
        onClose={() => setTextlessOpen(false)}
        onSuccess={() => {
          setTextlessOpen(false);
          void refreshCurrentPreviewPage();
        }}
        onBeforeStart={saveCurrentPageIfDirty}
      />
      <TranslateDialog
        open={translateOpen}
        uploadId={uploadId}
        pageIndex={selectedPage}
        initialScope={translateScope}
        onClose={() => setTranslateOpen(false)}
        onSuccess={() => {
          setTranslateOpen(false);
          void refreshCurrentPreviewPage();
        }}
      />
      <Dialog open={textlessPageOpen} onClose={textlessPageSubmitting ? undefined : () => { setTextlessPageOpen(false); setTextlessPageError(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>{t("detail.textlessPage")}</DialogTitle>
        {textlessPageSubmitting && (
          <LinearProgress
            variant={textlessPageProgress ? "determinate" : "indeterminate"}
            value={textlessPageProgress ? Math.round((textlessPageProgress.current / textlessPageProgress.total) * 100) : undefined}
            sx={{ mx: 0 }}
          />
        )}
        <DialogContent>
          {textlessPageError && (
            <Alert severity="error" sx={{ mt: 1, mb: 1 }}>
              {textlessPageError}
            </Alert>
          )}
          {!textlessPageError && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {textlessPageSubmitting ? t("textlessDialog.starting") : t("textlessDialog.completed")}
            </Typography>
          )}
        </DialogContent>
        {!textlessPageSubmitting && (
          <DialogActions>
            <Button onClick={() => { setTextlessPageOpen(false); setTextlessPageError(null); }}>
              {t("common.cancel")}
            </Button>
          </DialogActions>
        )}
      </Dialog>
      <Dialog open={exportPdfExporting} maxWidth="xs" fullWidth>
        <DialogTitle>{t("detail.exportPdf")}</DialogTitle>
        <LinearProgress
          variant={exportPdfProgress ? "determinate" : "indeterminate"}
          value={exportPdfProgress ? Math.round((exportPdfProgress.done / exportPdfProgress.total) * 100) : undefined}
          sx={{ mx: 0 }}
        />
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {exportPdfProgress
              ? t("detail.exportPdfExporting", { done: exportPdfProgress.done, total: exportPdfProgress.total })
              : t("detail.exportPdfExporting", { done: 0, total: "..." })}
          </Typography>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UploadDetailPageContainer;
