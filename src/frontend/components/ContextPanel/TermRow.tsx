import React, { memo, useEffect, useRef, useState } from "react";
import { Box, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { Delete as DeleteIcon, LocationOn as LocationOnIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { ContextTerm } from "../../api/index.ts";

export interface TermRowProps {
  entry: ContextTerm;
  idx: number;
  termPageMap: Record<string, number>;
  onSelectPage?: (page: number) => void;
  onContextChange: (index: number, value: string) => void;
  onDelete: (index: number) => void;
}

export const TermRow = memo<TermRowProps>(({ entry, idx, termPageMap, onSelectPage, onContextChange, onDelete }) => {
  const { t } = useTranslation();
  const [localContext, setLocalContext] = useState(entry.context);
  const prevPropRef = useRef(entry.context);

  useEffect(() => {
    if (entry.context !== prevPropRef.current) {
      prevPropRef.current = entry.context;
      setLocalContext(entry.context);
    }
  }, [entry.context]);

  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography
          variant="body2"
          sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={entry.term}
        >
          {entry.term}
        </Typography>
        {onSelectPage && entry.term in termPageMap && (
          <Tooltip title={t("contextPanel.jumpToPage", { page: termPageMap[entry.term] + 1 })}>
            <IconButton
              size="small"
              onClick={() => onSelectPage(termPageMap[entry.term])}
              sx={{ color: "primary.light" }}
            >
              <LocationOnIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={t("contextPanel.delete")}>
          <IconButton size="small" onClick={() => onDelete(idx)} sx={{ color: "error.light" }}>
            <DeleteIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      </Box>
      <TextField
        size="small"
        fullWidth
        multiline
        minRows={1}
        maxRows={3}
        placeholder={t("contextPanel.contextPlaceholder")}
        value={localContext}
        onChange={(e) => setLocalContext(e.target.value)}
        onBlur={(e) => onContextChange(idx, e.target.value)}
        sx={{ mt: 0.5 }}
        slotProps={{ input: { style: { fontSize: "0.75rem" } } }}
      />
    </Box>
  );
});
