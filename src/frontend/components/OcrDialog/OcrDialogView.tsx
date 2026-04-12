import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  Divider,
  Autocomplete,
  LinearProgress,
  Alert,
} from "@mui/material";
import { useTranslation } from "react-i18next";

export type PageScope = "all" | "specific";

const PADDLE_LANGUAGES = ["japan", "ch", "chinese_cht", "en", "korean", "vi", "fr", "german", "it", "es", "pt", "ru", "ar"];

export interface OcrDialogViewProps {
  open: boolean;
  isSubmitting: boolean;
  progress: { current: number; total: number } | null;
  errorMessage?: string | null;
  // OCR config
  supportedModels: string[];
  language: string;
  // form state
  model: string;
  pageScope: PageScope;
  pagesInput: string;
  force: boolean;
  // handlers
  onModelChange: (model: string) => void;
  onLanguageChange: (language: string) => void;
  onPageScopeChange: (scope: PageScope) => void;
  onPagesInputChange: (value: string) => void;
  onForceChange: (force: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const OcrDialogView: React.FC<OcrDialogViewProps> = ({
  open,
  isSubmitting,
  progress,
  errorMessage,
  supportedModels,
  language,
  model,
  pageScope,
  pagesInput,
  force,
  onModelChange,
  onLanguageChange,
  onPageScopeChange,
  onPagesInputChange,
  onForceChange,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("ocrDialog.title")}</DialogTitle>

      {isSubmitting && (
        <LinearProgress
          variant={progress ? "determinate" : "indeterminate"}
          value={progress ? Math.round((progress.current / progress.total) * 100) : undefined}
          sx={{ mx: 0 }}
        />
      )}

      <DialogContent>
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 2 }}>
          {/* Model selector */}
          <FormControl fullWidth size="small">
            <InputLabel>{t("ocrDialog.model")}</InputLabel>
            <Select
              value={model}
              label={t("ocrDialog.model")}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isSubmitting}
            >
              {supportedModels.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Language selector */}
          <Autocomplete
            freeSolo
            options={PADDLE_LANGUAGES}
            value={language}
            onChange={(_, v) => onLanguageChange(v ?? "")}
            onInputChange={(_, v) => onLanguageChange(v)}
            disabled={isSubmitting}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={t("ocrDialog.language")}
              />
            )}
          />

          <Divider />

          {/* Page scope toggle */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
              {t("ocrDialog.pageScope")}
            </Typography>
            <ToggleButtonGroup
              value={pageScope}
              exclusive
              size="small"
              onChange={(_, v) => { if (v) onPageScopeChange(v as PageScope); }}
              disabled={isSubmitting}
              sx={{ width: "100%" }}
            >
              <ToggleButton value="all" sx={{ flex: 1 }}>
                {t("ocrDialog.allPages")}
              </ToggleButton>
              <ToggleButton value="specific" sx={{ flex: 1 }}>
                {t("ocrDialog.specificPages")}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Specific pages input */}
          {pageScope === "specific" && (
            <TextField
              size="small"
              label={t("ocrDialog.pagesInput")}
              value={pagesInput}
              onChange={(e) => onPagesInputChange(e.target.value)}
              helperText={t("ocrDialog.pagesInputHelper")}
              disabled={isSubmitting}
              autoFocus
            />
          )}

          {/* Force re-run (only relevant for all-pages) */}
          {pageScope === "all" && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={force}
                  onChange={(e) => onForceChange(e.target.checked)}
                  disabled={isSubmitting}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">{t("ocrDialog.force")}</Typography>
              }
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={isSubmitting} variant="outlined" color="inherit">
          {t("common.cancel")}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isSubmitting || (pageScope === "specific" && !pagesInput.trim())}
          variant="contained"
        >
          {isSubmitting
            ? progress
              ? `${progress.current} / ${progress.total}`
              : t("ocrDialog.starting")
            : t("ocrDialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OcrDialogView;
