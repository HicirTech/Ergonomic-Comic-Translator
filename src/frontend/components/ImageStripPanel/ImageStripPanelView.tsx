import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { ChevronRight } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { getUploadPageUrl } from "../../api/index.ts";
import type { OcrLineSummary } from "../../utils/ocr-line-summary.ts";

export interface ImageStripPanelViewProps {
  uploadId: string;
  pages: string[];
  panelWidth: number;
  collapsed: boolean;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onExpand: () => void;
  onOcrPage?: (index: number) => void;
  onTextlessPage?: (index: number) => void;
  pageLineSummaries: Record<number, OcrLineSummary[]>;
}

// ── StripItem ─────────────────────────────────────────────────────────────────
// Memoized so that only the two items whose `isSelected` flips actually re-render
// on page switch. Without this, all N items re-render and MUI processes all N sx
// objects through emotion, causing 200-300ms scheduler violations on large uploads.
interface StripItemProps {
  uploadId: string;
  filename: string;
  index: number;
  isSelected: boolean;
  summaries: OcrLineSummary[];
  hasContextMenu: boolean;
  onSelect: (i: number) => void;
  onContextMenu: (e: React.MouseEvent, i: number) => void;
}

const StripItem = memo<StripItemProps>(({
  uploadId,
  filename,
  index,
  isSelected,
  summaries,
  hasContextMenu,
  onSelect,
  onContextMenu,
}) => {
  const { t } = useTranslation();

  const problemLines = summaries.filter((s) => s.status === "long" || s.status === "critical-short");
  const hasAnyLine = summaries.length > 0;

  return (
    <Box
      data-strip-index={index}
      onClick={() => onSelect(index)}
      onContextMenu={hasContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, index); } : undefined}
      sx={{
        cursor: "pointer",
        border: "2px solid",
        borderColor: isSelected ? "primary.main" : "transparent",
        borderRadius: 1,
        overflow: "hidden",
        flexShrink: 0,
        transition: "border-color 0.15s ease",
        "&:hover": {
          borderColor: isSelected ? "primary.main" : "action.selected",
        },
      }}
    >
      <img
        src={getUploadPageUrl(uploadId, index)}
        alt={t("detail.pageLabel", { number: index + 1 })}
        loading="lazy"
        style={{ width: "100%", height: "auto", display: "block", minHeight: 200 }}
      />
      <Box
        sx={{
          px: 0.75,
          py: 0.5,
          bgcolor: "background.default",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.3 }}>
          {t("detail.pageLabel", { number: index + 1 })}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.disabled",
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={filename}
        >
          {filename}
        </Typography>
        {hasAnyLine && (
          problemLines.length === 0 ? (
            <Box sx={{ mt: 0.75, display: "flex", gap: 0.5 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "success.main" }} />
            </Box>
          ) : (
            <Box sx={{ mt: 0.75, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {problemLines.map((summary) => (
                <Box
                  key={`dot-${summary.lineIndex}`}
                  sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "error.main" }}
                />
              ))}
            </Box>
          )
        )}
      </Box>
    </Box>
  );
});

const ImageStripPanelView: React.FC<ImageStripPanelViewProps> = ({
  uploadId,
  pages,
  panelWidth,
  collapsed,
  selectedIndex,
  onSelect,
  onResizeMouseDown,
  onExpand,
  onOcrPage,
  onTextlessPage,
  pageLineSummaries,
}) => {
  const { t } = useTranslation();
  const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number; pageIndex: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const item = container.querySelector<HTMLElement>(`[data-strip-index="${selectedIndex}"]`);
      if (!item) return;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      if (itemTop < containerTop || itemBottom > containerBottom) {
        container.scrollTop = itemTop - container.clientHeight / 2 + item.offsetHeight / 2;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selectedIndex]);

  // Stable callbacks — onSelect/onOcrPage/onTextlessPage identity must not change per render
  const hasContextMenu = Boolean(onOcrPage || onTextlessPage);
  const handleContextMenu = useCallback((e: React.MouseEvent, i: number) => {
    setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, pageIndex: i });
  }, []);

  if (collapsed) {
    return (
      <Box sx={{ position: "relative", width: 0, flexShrink: 0 }}>
        <Tooltip title={t("detail.expandPanel")} placement="right">
          <IconButton
            onClick={onExpand}
            size="small"
            sx={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: "background.paper",
              borderRadius: "0 6px 6px 0",
              boxShadow: 4,
              zIndex: 10,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <ChevronRight />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: panelWidth,
        minWidth: panelWidth,
        maxWidth: panelWidth,
        height: "100%",
        display: "flex",
        flexDirection: "row",
        flexShrink: 0,
        bgcolor: "background.paper",
        borderRight: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      {/* Scrollable image list — scrollbar hidden */}
      <Box
        ref={scrollContainerRef}
        sx={{
          flex: 1,
          overflowY: "scroll",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          p: 1,
          /* hide scrollbar cross-browser */
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {pages.map((filename, i) => (
          <StripItem
            key={i}
            uploadId={uploadId}
            filename={filename}
            index={i}
            isSelected={selectedIndex === i}
            summaries={pageLineSummaries[i] ?? []}
            hasContextMenu={hasContextMenu}
            onSelect={onSelect}
            onContextMenu={handleContextMenu}
          />
        ))}
      </Box>

      <Menu
        open={Boolean(ctxMenu)}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
      >
        <MenuItem
          onClick={() => {
            if (ctxMenu && onOcrPage) onOcrPage(ctxMenu.pageIndex);
            setCtxMenu(null);
          }}
          disabled={!onOcrPage}
        >
          {t("detail.ocrPage")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (ctxMenu && onTextlessPage) onTextlessPage(ctxMenu.pageIndex);
            setCtxMenu(null);
          }}
          disabled={!onTextlessPage}
        >
          {t("detail.textlessPage")}
        </MenuItem>
      </Menu>

      {/* Resize handle */}
      <Box
        onMouseDown={onResizeMouseDown}
        sx={{
          width: 5,
          flexShrink: 0,
          cursor: "col-resize",
          bgcolor: "divider",
          transition: "background-color 0.15s",
          "&:hover": { bgcolor: "primary.main" },
        }}
      />
    </Box>
  );
};

export default ImageStripPanelView;
