import React from "react";
import {
  Alert, AppBar, Box, Button, Chip, CircularProgress, IconButton, LinearProgress, Stack, ToggleButton, ToggleButtonGroup,
  Toolbar, Typography,
} from "@mui/material";
import { ArrowBack, ChevronLeft, ChevronRight, Download, PlayArrow, Stop } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { VolumeDetail } from "../../../server/interfaces/volume-detail.ts";

export interface VolumePageViewProps {
  volume: VolumeDetail | null;
  index: number;
  mode: "translated" | "original";
  imageUrl: (ordinal: number, variant: "original" | "translated") => string;
  exportUrl: (format: "cbz" | "pdf") => string;
  stepZh: string | null;
  modelsMessageZh: string | null;
  errorZh: string | null;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onMode: (mode: "translated" | "original") => void;
  onPage: (index: number) => void;
}

const activeStates = ["queued", "running", "cancelling"];

const VolumePageView: React.FC<VolumePageViewProps> = ({
  volume, index, mode, imageUrl, exportUrl, stepZh, modelsMessageZh, errorZh, busy, onBack, onStart, onStop, onMode, onPage,
}) => {
  const { t } = useTranslation();
  if (!volume) {
    return <Box sx={{ p: 4 }}>{errorZh ? <Alert severity="error">{errorZh}</Alert> : <CircularProgress />}</Box>;
  }
  const job = volume.job;
  const active = job !== null && activeStates.includes(job.state);
  const page = volume.pages[index]!;
  const rtl = (volume.readingDirection ?? "rtl") === "rtl";
  const showTranslated = mode === "translated" && page.translated;
  const reviewCount = volume.openFlags.warn + volume.openFlags.error;
  // Previous and next sit where the reader expects them: in a right-to-left book "next" is on the left.
  const toNext = () => onPage(Math.min(volume.pages.length - 1, index + 1));
  const toPrevious = () => onPage(Math.max(0, index - 1));
  const leftButton = rtl ? { label: t("volume.next"), onClick: toNext } : { label: t("volume.prev"), onClick: toPrevious };
  const rightButton = rtl ? { label: t("volume.prev"), onClick: toPrevious } : { label: t("volume.next"), onClick: toNext };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={onBack} title={t("common.back")}><ArrowBack /></IconButton>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{volume.title}</Typography>
          <Chip size="small" label={t(`jobState.${job?.state ?? "none"}`)} />
          {active
            ? <Button startIcon={<Stop />} onClick={onStop} disabled={busy || job.state === "cancelling"}>{t("volume.stop")}</Button>
            : <Button startIcon={<PlayArrow />} variant="contained" onClick={onStart} disabled={busy}>{t("volume.start")}</Button>}
          {volume.exports.cbz && <Button startIcon={<Download />} href={exportUrl("cbz")}>{t("volume.downloadCbz")}</Button>}
          {volume.exports.pdf && <Button startIcon={<Download />} href={exportUrl("pdf")}>{t("volume.downloadPdf")}</Button>}
        </Toolbar>
        {active && <LinearProgress variant="determinate" value={Math.min(100, (100 * job.done) / Math.max(1, job.expected))} />}
      </AppBar>

      <Stack spacing={1} sx={{ px: 2, pt: 1 }}>
        {active && stepZh && <Typography variant="body2" color="text.secondary">{stepZh}</Typography>}
        {modelsMessageZh && <Alert severity="info">{modelsMessageZh}</Alert>}
        {errorZh && <Alert severity="error">{errorZh}</Alert>}
        {job !== null && job.failed > 0 && <Alert severity="warning">{t("volume.failedPages", { count: job.failed })}</Alert>}
        {!active && reviewCount > 0 && <Alert severity="info">{t("volume.review", { count: reviewCount })}</Alert>}
      </Stack>

      <Stack direction="row" spacing={2} sx={{ px: 2, py: 1, alignItems: "center", flexWrap: "wrap" }}>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, value) => value && onMode(value)}>
          <ToggleButton value="translated">{t("volume.translated")}</ToggleButton>
          <ToggleButton value="original">{t("volume.original")}</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2">{t("volume.position", { ordinal: page.ordinal, total: volume.pages.length })}</Typography>
        <Typography variant="body2" color="text.secondary">{t(rtl ? "volume.rtl" : "volume.ltr")}</Typography>
        {volume.sourceLanguage && (
          <Typography variant="body2" color="text.secondary">{t("volume.language", { language: t(`language.${volume.sourceLanguage}`) })}</Typography>
        )}
        {mode === "translated" && !page.translated && (
          <Typography variant="body2" color="warning.main">{t("volume.notTranslated")}</Typography>
        )}
      </Stack>

      <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1, px: 1, minHeight: 0 }}>
        <IconButton onClick={leftButton.onClick} title={leftButton.label}><ChevronLeft fontSize="large" /></IconButton>
        <Box
          component="img"
          src={imageUrl(page.ordinal, showTranslated ? "translated" : "original")}
          alt={t("volume.position", { ordinal: page.ordinal, total: volume.pages.length })}
          sx={{ maxHeight: "calc(100vh - 260px)", maxWidth: "100%", objectFit: "contain", boxShadow: 3 }}
        />
        <IconButton onClick={rightButton.onClick} title={rightButton.label}><ChevronRight fontSize="large" /></IconButton>
      </Box>

      <Box sx={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", gap: 1, overflowX: "auto", p: 1.5, flexShrink: 0 }}>
        {volume.pages.map((thumb, thumbIndex) => (
          <Box
            key={thumb.ordinal}
            component="img"
            loading="lazy"
            src={imageUrl(thumb.ordinal, thumb.translated ? "translated" : "original")}
            alt={String(thumb.ordinal)}
            onClick={() => onPage(thumbIndex)}
            sx={{
              height: 96,
              width: "auto",
              flexShrink: 0,
              cursor: "pointer",
              border: "2px solid",
              borderColor: thumbIndex === index
                ? "primary.main"
                : thumb.openFlags.error > 0 ? "error.main" : thumb.openFlags.warn > 0 ? "warning.main" : thumb.translated ? "success.dark" : "transparent",
              opacity: thumb.translated || thumb.kind === "blank" ? 1 : 0.5,
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

export default VolumePageView;
