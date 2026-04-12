import React from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

export interface DeleteConfirmDialogViewProps {
  open: boolean;
  isDeleting: boolean;
  titleLabel: string;
  bodyLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteConfirmDialogView: React.FC<DeleteConfirmDialogViewProps> = ({
  open,
  isDeleting,
  titleLabel,
  bodyLabel,
  cancelLabel,
  confirmLabel,
  onClose,
  onConfirm,
}) => (
  <Dialog
    open={open}
    onClose={isDeleting ? undefined : onClose}
    maxWidth="xs"
    fullWidth
  >
    <DialogTitle sx={{ fontWeight: 600 }}>{titleLabel}</DialogTitle>
    <DialogContent>
      <DialogContentText>{bodyLabel}</DialogContentText>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
      <Button onClick={onClose} disabled={isDeleting} variant="outlined">
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={isDeleting}
        variant="contained"
        color="error"
        startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        {isDeleting ? confirmLabel : confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);

export default DeleteConfirmDialogView;
