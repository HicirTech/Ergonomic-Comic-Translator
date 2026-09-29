import React from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { CloudUpload } from "@mui/icons-material";
import { useTranslation } from "react-i18next";

export interface DropZoneViewProps {
  dragging: boolean;
  importing: boolean;
  errorZh: string | null;
  fileInput: React.RefObject<HTMLInputElement | null>;
  folderInput: React.RefObject<HTMLInputElement | null>;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onPicked: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const DropZoneView: React.FC<DropZoneViewProps> = ({
  dragging, importing, errorZh, fileInput, folderInput, onDragOver, onDragLeave, onDrop, onPicked,
}) => {
  const { t } = useTranslation();
  return (
    <Box
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{
        border: "2px dashed",
        borderColor: dragging ? "primary.main" : "divider",
        borderRadius: 3,
        p: 4,
        textAlign: "center",
        bgcolor: dragging ? "action.hover" : "transparent",
        transition: "all 0.15s",
      }}
    >
      {importing ? (
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <CircularProgress />
          <Typography>{t("library.importing")}</Typography>
        </Stack>
      ) : (
        <Stack spacing={1.5} sx={{ alignItems: "center" }}>
          <CloudUpload sx={{ fontSize: 48, opacity: 0.7 }} />
          <Typography variant="h6">{t("library.drop")}</Typography>
          <Typography variant="body2" color="text.secondary">{t("library.dropHint")}</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => fileInput.current?.click()}>{t("library.chooseFiles")}</Button>
            <Button variant="outlined" onClick={() => folderInput.current?.click()}>{t("library.chooseFolder")}</Button>
          </Stack>
        </Stack>
      )}
      {errorZh && <Alert severity="error" sx={{ mt: 2 }}>{errorZh}</Alert>}
      <input ref={fileInput} type="file" multiple hidden accept=".zip,.cbz,image/*" onChange={onPicked} />
      {/* webkitdirectory is not in React's typings; it makes the picker choose a whole folder. */}
      <input ref={folderInput} type="file" multiple hidden onChange={onPicked} {...{ webkitdirectory: "" }} />
    </Box>
  );
};

export default DropZoneView;
