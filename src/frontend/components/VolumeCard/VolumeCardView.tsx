import React from "react";
import {
  Box, Button, Card, CardActions, CardContent, CardMedia, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, LinearProgress, Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { VolumeSummary } from "../../../server/interfaces/volume-summary.ts";

export interface VolumeCardViewProps {
  volume: VolumeSummary;
  coverUrl: string;
  confirmingDelete: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

const stateColor = {
  queued: "default",
  running: "primary",
  cancelling: "warning",
  partial_failed: "warning",
  cancelled: "default",
  needs_review: "success",
  succeeded: "success",
} as const;

const VolumeCardView: React.FC<VolumeCardViewProps> = ({
  volume, coverUrl, confirmingDelete, onOpen, onAskDelete, onCancelDelete, onDelete,
}) => {
  const { t } = useTranslation();
  const job = volume.job;
  const active = job !== null && ["queued", "running", "cancelling"].includes(job.state);
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardMedia component="img" image={coverUrl} alt="" onClick={onOpen} sx={{ height: 280, objectFit: "cover", objectPosition: "top", cursor: "pointer" }} />
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="subtitle1" noWrap title={volume.title}>{volume.title}</Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">{t("volume.pages", { count: volume.pageCount })}</Typography>
          <Chip size="small" color={job ? stateColor[job.state] : "default"} label={t(`jobState.${job?.state ?? "none"}`)} />
        </Box>
        {active && <LinearProgress variant="determinate" value={Math.min(100, (100 * job.done) / Math.max(1, job.expected))} sx={{ mt: 1 }} />}
      </CardContent>
      <CardActions>
        <Button onClick={onOpen}>{t("volume.open")}</Button>
        <Button color="error" onClick={onAskDelete}>{t("common.delete")}</Button>
      </CardActions>
      <Dialog open={confirmingDelete} onClose={onCancelDelete}>
        <DialogTitle>{t("volume.deleteTitle", { title: volume.title })}</DialogTitle>
        <DialogContent>{t("volume.deleteBody")}</DialogContent>
        <DialogActions>
          <Button onClick={onCancelDelete}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={onDelete}>{t("common.delete")}</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default VolumeCardView;
