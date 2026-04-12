import React, { memo } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FindInPage as DetectIcon,
  LocationOn as LocationOnIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { ContextTerm } from "../../api/index.ts";
import { TermRow } from "./TermRow.tsx";

export interface ContextPanelViewProps {
  terms: ContextTerm[];
  termPageMap: Record<string, number>;
  isDetecting: boolean;
  chunkProgress: { completed: number; total: number } | null;
  saveIndicator: string | null;
  targetLanguage: string;
  newTerm: string;
  onTargetLanguageChange: (value: string) => void;
  onNewTermChange: (value: string) => void;
  onDetect: () => void;
  onAddTerm: () => void;
  onContextChange: (index: number, value: string) => void;
  onDelete: (index: number) => void;
  onSelectPage?: (pageIndex: number) => void;
}

const ContextPanelView: React.FC<ContextPanelViewProps> = ({
  terms,
  termPageMap,
  isDetecting,
  chunkProgress,
  saveIndicator,
  targetLanguage,
  newTerm,
  onTargetLanguageChange,
  onNewTermChange,
  onDetect,
  onAddTerm,
  onContextChange,
  onDelete,
  onSelectPage,
}) => {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: 280,
        borderLeft: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography variant="subtitle2">
          {t("contextPanel.title")}
        </Typography>
        <Tooltip title={isDetecting ? t("contextPanel.detecting") : t("contextPanel.detect")}>
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={isDetecting ? <CircularProgress size={14} /> : <DetectIcon fontSize="small" />}
              onClick={onDetect}
              disabled={isDetecting}
              sx={{ minWidth: 0, fontSize: "0.75rem" }}
            >
              {isDetecting ? t("contextPanel.detecting") : t("contextPanel.detect")}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Target language selector */}
      <Box sx={{ px: 1.5, pt: 1, pb: 0.5, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          label={t("contextPanel.targetLanguage")}
          value={targetLanguage}
          onChange={(e) => onTargetLanguageChange(e.target.value)}
          disabled={isDetecting}
          slotProps={{ input: { style: { fontSize: "0.78rem" } }, inputLabel: { style: { fontSize: "0.78rem" } } }}
        />
      </Box>

      {/* Progress bar while detecting */}
      {isDetecting && (
        <Box sx={{ flexShrink: 0 }}>
          <LinearProgress
            variant={chunkProgress && chunkProgress.total > 0 ? "determinate" : "indeterminate"}
            value={chunkProgress && chunkProgress.total > 0
              ? Math.round((chunkProgress.completed / chunkProgress.total) * 100)
              : undefined}
          />
          {chunkProgress && chunkProgress.total > 1 && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: "block", lineHeight: 1.6 }}>
              {t("contextPanel.chunkProgress", { completed: chunkProgress.completed, total: chunkProgress.total })}
            </Typography>
          )}
        </Box>
      )}

      {/* Hint */}
      <Box sx={{ px: 2, py: 0.75, flexShrink: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {t("contextPanel.glossaryHint")}
        </Typography>
      </Box>
      <Divider sx={{ flexShrink: 0 }} />

      {/* Terms list */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 0.5 }}>
        {terms.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 1, py: 2, textAlign: "center" }}
          >
            {t("contextPanel.noTerms")}
          </Typography>
        ) : (
          terms.map((entry, idx) => (
            <TermRow
              key={`${entry.term}-${idx}`}
              entry={entry}
              idx={idx}
              termPageMap={termPageMap}
              onSelectPage={onSelectPage}
              onContextChange={onContextChange}
              onDelete={onDelete}
            />
          ))
        )}
      </Box>

      <Divider sx={{ flexShrink: 0 }} />

      {/* Add term row */}
      <Box sx={{ px: 1, py: 1, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={t("contextPanel.newTermPlaceholder")}
          value={newTerm}
          onChange={(e) => onNewTermChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddTerm();
            }
          }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={t("contextPanel.addTerm")}>
                    <span>
                      <IconButton size="small" onClick={onAddTerm} disabled={!newTerm.trim()}>
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {/* Save indicator */}
      {saveIndicator && (
        <Box sx={{ px: 2, pb: 0.5, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {saveIndicator}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default memo(ContextPanelView);
