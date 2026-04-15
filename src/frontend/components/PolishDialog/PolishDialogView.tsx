import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Typography,
  LinearProgress,
} from "@mui/material";
import { useTranslation } from "react-i18next";

export interface PolishDialogViewProps {
  open: boolean;
  isSubmitting: boolean;
  progress: { current: number; total: number } | null;
  model: string;
  targetLanguage: string;
  onModelChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const PolishDialogView: React.FC<PolishDialogViewProps> = ({
  open,
  isSubmitting,
  progress,
  model,
  targetLanguage,
  onModelChange,
  onTargetLanguageChange,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("polishDialog.title")}</DialogTitle>

      {isSubmitting && (
        <LinearProgress
          variant={progress ? "determinate" : "indeterminate"}
          value={progress ? Math.round((progress.current / progress.total) * 100) : undefined}
          sx={{ mx: 0 }}
        />
      )}

      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t("polishDialog.description")}
          </Typography>

          <TextField
            size="small"
            label={t("polishDialog.model")}
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            helperText={t("polishDialog.modelHelper")}
            disabled={isSubmitting}
          />

          <TextField
            size="small"
            label={t("polishDialog.targetLanguage")}
            value={targetLanguage}
            onChange={(e) => onTargetLanguageChange(e.target.value)}
            disabled={isSubmitting}
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={isSubmitting || !targetLanguage.trim()}
        >
          {isSubmitting
            ? progress
              ? `${progress.current} / ${progress.total}`
              : t("polishDialog.starting")
            : t("polishDialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PolishDialogView;
