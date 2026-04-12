import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  LinearProgress,
} from "@mui/material";
import { useTranslation } from "react-i18next";

export type TranslateScope = "all" | "specific" | "page";

export interface TranslateDialogViewProps {
  open: boolean;
  isSubmitting: boolean;
  progress: { current: number; total: number } | null;
  initialScope: TranslateScope;
  model: string;
  targetLanguage: string;
  scope: TranslateScope;
  pagesInput: string;
  onModelChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onScopeChange: (scope: TranslateScope) => void;
  onPagesInputChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const TranslateDialogView: React.FC<TranslateDialogViewProps> = ({
  open,
  isSubmitting,
  progress,
  initialScope,
  model,
  targetLanguage,
  scope,
  pagesInput,
  onModelChange,
  onTargetLanguageChange,
  onScopeChange,
  onPagesInputChange,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("translateDialog.title")}</DialogTitle>

      {isSubmitting && (
        <LinearProgress
          variant={progress ? "determinate" : "indeterminate"}
          value={progress ? Math.round((progress.current / progress.total) * 100) : undefined}
          sx={{ mx: 0 }}
        />
      )}

      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 2 }}>
          <TextField
            size="small"
            label={t("translateDialog.model")}
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            helperText={t("translateDialog.modelHelper")}
            disabled={isSubmitting}
          />

          <TextField
            size="small"
            label={t("translateDialog.targetLanguage")}
            value={targetLanguage}
            onChange={(e) => onTargetLanguageChange(e.target.value)}
            disabled={isSubmitting}
          />

          {initialScope === "all" && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
                {t("translateDialog.pageScope")}
              </Typography>
              <ToggleButtonGroup
                value={scope}
                exclusive
                size="small"
                onChange={(_, v) => { if (v) onScopeChange(v as TranslateScope); }}
                disabled={isSubmitting}
                sx={{ width: "100%" }}
              >
                <ToggleButton value="all" sx={{ flex: 1 }}>
                  {t("translateDialog.allPages")}
                </ToggleButton>
                <ToggleButton value="specific" sx={{ flex: 1 }}>
                  {t("translateDialog.specificPages")}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          {initialScope === "all" && scope === "specific" && (
            <TextField
              size="small"
              label={t("translateDialog.pagesInput")}
              value={pagesInput}
              onChange={(e) => onPagesInputChange(e.target.value)}
              helperText={t("translateDialog.pagesInputHelper")}
              disabled={isSubmitting}
              autoFocus
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={isSubmitting || !targetLanguage.trim() || (scope === "specific" && !pagesInput.trim())}
        >
          {isSubmitting
            ? progress
              ? `${progress.current} / ${progress.total}`
              : t("translateDialog.starting")
            : t("translateDialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TranslateDialogView;
