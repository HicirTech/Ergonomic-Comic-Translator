import React, { memo } from "react";
import { Box, Divider } from "@mui/material";
import { useOcrView } from "./OcrEditorContext.tsx";
import ImageToolbar from "./components/ImageToolbar.tsx";
import SvgOverlay from "./components/SvgOverlay.tsx";
import LineSummaryPanel from "./components/LineSummaryPanel.tsx";
import LineEditor from "./components/LineEditor.tsx";
import TranslationEditor from "./components/TranslationEditor.tsx";
import EditorContextMenu from "./components/EditorContextMenu.tsx";

// Memo: this component takes NO props — it reads everything from context.
// Without memo, every parent re-render (textless polling, summary cascade, etc.)
// causes the entire subtree (SvgOverlay, LineEditor, TranslationEditor, …) to
// re-render even when the context value hasn't changed.
const OcrPreviewPanelView: React.FC = memo(() => {
  const {
    rootRef,
    imgRef,
    naturalSize,
    imgUrl,
    onPanelKeyDown,
    onImageLoad,
  } = useOcrView();

  return (
    <Box
      ref={rootRef}
      tabIndex={0}
      onMouseDownCapture={() => { rootRef.current?.focus(); }}
      onKeyDownCapture={onPanelKeyDown}
      sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", outline: "none" }}
    >
      {/* Image area (80%) */}
      <Box sx={{ flex: "0 0 80%", display: "flex", overflow: "hidden", bgcolor: "grey.900" }}>
        {/* Left: image + SVG overlay */}
        <Box sx={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
          <ImageToolbar />

          <img
            ref={imgRef}
            src={imgUrl}
            alt="page-preview"
            onLoad={onImageLoad}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />

          {naturalSize && <SvgOverlay />}
        </Box>

        {/* Right: line summaries sidebar */}
        <LineSummaryPanel />
      </Box>

      <Divider />

      {/* Editor area (20%) — 3 equal columns */}
      <Box sx={{ flex: "0 0 20%", display: "flex", flexDirection: "row", overflow: "hidden" }}>
        <LineEditor />
        <TranslationEditor />
      </Box>

      {/* Context menu */}
      <EditorContextMenu />
    </Box>
  );
});

export default OcrPreviewPanelView;
