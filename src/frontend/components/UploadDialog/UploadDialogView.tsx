import React from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  LinearProgress,
  Alert,
  alpha,
} from "@mui/material";
import { CloudUpload } from "@mui/icons-material";
import SortableFileItem from "./SortableFileItem.tsx";

export interface FileItem {
  id: string;
  file: File;
  typeLabel: string;
}

export interface UploadDialogViewProps {
  open: boolean;
  fileItems: FileItem[];
  isDragOver: boolean;
  isUploading: boolean;
  uploadError: string | null;
  // labels
  titleLabel: string;
  dropzoneLabel: string;
  dropzoneDescLabel: string;
  browseLabel: string;
  uploadLabel: string;
  cancelLabel: string;
  fileCountLabel: string;
  // handlers
  onClose: () => void;
  onConfirm: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowse: () => void;
  onRemoveFile: (id: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const UploadDialogView: React.FC<UploadDialogViewProps> = ({
  open,
  fileItems,
  isDragOver,
  isUploading,
  uploadError,
  titleLabel,
  dropzoneLabel,
  dropzoneDescLabel,
  browseLabel,
  uploadLabel,
  cancelLabel,
  fileCountLabel,
  onClose,
  onConfirm,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onRemoveFile,
  fileInputRef,
  onFileInputChange,
}) => (
  <Dialog
    open={open}
    onClose={isUploading ? undefined : onClose}
    maxWidth="sm"
    fullWidth
    slotProps={{ paper: { sx: { borderRadius: 3 } } }}
  >
    {isUploading && (
      <LinearProgress
        sx={{ position: "absolute", top: 0, left: 0, right: 0, borderRadius: "12px 12px 0 0" }}
      />
    )}

    <DialogTitle sx={{ fontWeight: 600, pt: 3 }}>{titleLabel}</DialogTitle>

    <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 1 }}>
      {/* Drop zone */}
      <Box
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onBrowse}
        sx={{
          border: "2px dashed",
          borderColor: isDragOver ? "primary.main" : "rgba(255,255,255,0.15)",
          borderRadius: 2,
          py: 4,
          px: 2,
          textAlign: "center",
          cursor: "pointer",
          bgcolor: isDragOver
            ? (theme) => alpha(theme.palette.primary.main, 0.08)
            : "rgba(255,255,255,0.02)",
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: "primary.light",
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
          },
        }}
      >
        <CloudUpload sx={{ fontSize: 44, opacity: 0.5, mb: 1 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
          {dropzoneLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {dropzoneDescLabel}
        </Typography>
        <Typography
          variant="caption"
          color="primary.light"
          sx={{ display: "block", mt: 1, textDecoration: "underline" }}
        >
          {browseLabel}
        </Typography>
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.zip"
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />

      {/* File list */}
      {fileItems.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
            {fileCountLabel}
          </Typography>
          <SortableContext
            items={fileItems.map((fi) => fi.id)}
            strategy={verticalListSortingStrategy}
          >
            <List dense disablePadding>
              {fileItems.map((fi) => (
                <SortableFileItem
                  key={fi.id}
                  id={fi.id}
                  file={fi.file}
                  typeLabel={fi.typeLabel}
                  onRemove={() => onRemoveFile(fi.id)}
                />
              ))}
            </List>
          </SortableContext>
        </Box>
      )}

      {/* Upload error */}
      {uploadError && (
        <Alert severity="error" sx={{ mt: 0.5 }}>
          {uploadError}
        </Alert>
      )}
    </DialogContent>

    <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
      <Button onClick={onClose} disabled={isUploading} variant="outlined" color="inherit">
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={fileItems.length === 0 || isUploading}
        variant="contained"
      >
        {isUploading ? `${uploadLabel}...` : uploadLabel}
      </Button>
    </DialogActions>
  </Dialog>
);

export default UploadDialogView;
