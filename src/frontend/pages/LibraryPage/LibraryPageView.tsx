import React from "react";
import { Alert, AppBar, Box, CircularProgress, Container, Toolbar, Typography } from "@mui/material";
import { AutoStories } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { ImportResult } from "../../../server/interfaces/import-result.ts";
import type { ResourceStatus } from "../../../server/interfaces/resource-status.ts";
import type { VolumeSummary } from "../../../server/interfaces/volume-summary.ts";
import DropZone from "../../components/DropZone/index.tsx";
import ImportConfirmDialog from "../../components/ImportConfirmDialog/index.tsx";
import StatusCard from "../../components/StatusCard/index.tsx";
import VolumeCard from "../../components/VolumeCard/index.tsx";

export interface LibraryPageViewProps {
  volumes: VolumeSummary[] | null;
  status: ResourceStatus | null;
  missing: string[];
  modelsMessageZh: string | null;
  imported: ImportResult | null;
  starting: boolean;
  errorZh: string | null;
  onImported: (result: ImportResult) => void;
  onStart: () => void;
  onLater: () => void;
  onChanged: () => void;
}

const LibraryPageView: React.FC<LibraryPageViewProps> = ({
  volumes, status, missing, modelsMessageZh, imported, starting, errorZh, onImported, onStart, onLater, onChanged,
}) => {
  const { t } = useTranslation();
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <AutoStories sx={{ mr: 1.5, opacity: 0.8 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{t("app.title")}</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ py: 3, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2, mb: 3 }}>
          <DropZone onImported={onImported} />
          <StatusCard status={status} missing={missing} />
        </Box>
        {modelsMessageZh && <Alert severity="info" sx={{ mb: 2 }}>{modelsMessageZh}</Alert>}
        {errorZh && <Alert severity="error" sx={{ mb: 2 }}>{t("common.error", { message: errorZh })}</Alert>}
        {volumes === null && <CircularProgress />}
        {volumes?.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: "center", mt: 6 }}>{t("library.empty")}</Typography>
        )}
        {volumes && volumes.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 2 }}>
            {volumes.map((volume) => <VolumeCard key={volume.id} volume={volume} onDeleted={onChanged} />)}
          </Box>
        )}
      </Container>
      <ImportConfirmDialog result={imported} starting={starting} onStart={onStart} onLater={onLater} />
    </Box>
  );
};

export default LibraryPageView;
