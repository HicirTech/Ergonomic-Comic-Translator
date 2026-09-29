import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ImportResult } from "../../../server/interfaces/import-result.ts";

export interface ImportConfirmDialogViewProps {
  result: ImportResult | null;
  starting: boolean;
  onStart: () => void;
  onLater: () => void;
}

/** The one-line confirmation between reading the files and starting the translation. */
const ImportConfirmDialogView: React.FC<ImportConfirmDialogViewProps> = ({ result, starting, onStart, onLater }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={result !== null} onClose={onLater} maxWidth="xs" fullWidth>
      {result && (
        <>
          <DialogTitle>{t("import.title", { title: result.title })}</DialogTitle>
          <DialogContent>
            <Typography>{t("import.pages", { count: result.pages })}</Typography>
            {result.blank > 0 && <Typography color="text.secondary">{t("import.blank", { count: result.blank })}</Typography>}
            {result.textless > 0 && <Typography color="text.secondary">{t("import.textless", { count: result.textless })}</Typography>}
            {result.skipped > 0 && <Typography color="text.secondary">{t("import.skipped", { count: result.skipped })}</Typography>}
          </DialogContent>
          <DialogActions>
            <Button onClick={onLater}>{t("import.later")}</Button>
            <Button variant="contained" onClick={onStart} disabled={starting}>{t("import.start")}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default ImportConfirmDialogView;
