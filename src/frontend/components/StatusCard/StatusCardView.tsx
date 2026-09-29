import React from "react";
import { Alert, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { Memory } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { ResourceStatus } from "../../../server/interfaces/resource-status.ts";

export interface StatusCardViewProps {
  status: ResourceStatus | null;
  missing: string[];
}

const lightColor = { green: "success", yellow: "warning", red: "error" } as const;
const bytesToGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

const StatusCardView: React.FC<StatusCardViewProps> = ({ status, missing }) => {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Memory sx={{ opacity: 0.8 }} />
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>{t("status.title")}</Typography>
          {status && <Chip size="small" color={lightColor[status.light]} label={status.lightZh} />}
        </Stack>
        {status?.reasonsZh.map((reason) => (
          <Typography key={reason} variant="body2" color="warning.main">{reason}</Typography>
        ))}
        {status && (
          <Typography variant="body2" color="text.secondary">{t(`status.loaded_${status.loaded ?? "none"}`)}</Typography>
        )}
        {status?.adapters.map((adapter) => (
          <Typography key={adapter.name} variant="body2" color="text.secondary">
            {t("status.available", { name: adapter.name, kind: adapter.kindZh, gb: bytesToGb(adapter.availableBytes) })}
          </Typography>
        ))}
        {missing.length > 0 && (
          <Alert severity="info" sx={{ mt: 1 }}>{t("status.missing", { names: missing.join("、") })}</Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default StatusCardView;
