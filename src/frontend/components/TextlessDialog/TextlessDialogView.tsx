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
  Alert,
} from "@mui/material";
import { useTranslation } from "react-i18next";

export type PageScope = "all" | "specific";

export interface TextlessDialogViewProps {
  open: boolean;
  isSubmitting: boolean;
  progress: { current: number; total: number } | null;
  errorMessage?: string | null;
  pageScope: PageScope;
  pagesInput: string;
  onPageScopeChange: (scope: PageScope) => void;
  onPagesInputChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const TextlessDialogView: React.FC<TextlessDialogViewProps> = ({
  open,
  isSubmitting,
  progress,
  errorMessage,
  pageScope,
  pagesInput,
  onPageScopeChange,
  onPagesInputChange,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("textlessDialog.title")}</DialogTitle>

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
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
              {t("textlessDialog.pageScope")}
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
                {t("textlessDialog.allPages")}
              </ToggleButton>
              <ToggleButton value="specific" sx={{ flex: 1 }}>
                {t("textlessDialog.specificPages")}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {pageScope === "specific" && (
            <TextField
              size="small"
              label={t("textlessDialog.pagesInput")}
              value={pagesInput}
              onChange={(e) => onPagesInputChange(e.target.value)}
              helperText={t("textlessDialog.pagesInputHelper")}
              disabled={isSubmitting}
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
          disabled={isSubmitting || (pageScope === "specific" && !pagesInput.trim())}
        >
          {isSubmitting
            ? progress
              ? `${progress.current} / ${progress.total}`
              : t("textlessDialog.starting")
            : t("textlessDialog.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TextlessDialogView;
