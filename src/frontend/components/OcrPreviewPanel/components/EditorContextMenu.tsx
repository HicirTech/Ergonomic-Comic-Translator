import React from "react";
import { Menu, MenuItem } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useOcrLines, useOcrActions } from "../OcrEditorContext.tsx";

const EditorContextMenu: React.FC = () => {
  const { lines, selectedLineIndices } = useOcrLines();
  const {
    contextMenu,
    setContextMenu,
    onAddNewLine,
    onAddPolygonPoint,
    onDeletePolygonPoint,
    onDeleteTextLine,
    onMergeSelectedLines,
    onOcrPage,
    onTextlessPageWithSave,
    onTranslatePage,
    onExportPng,
  } = useOcrActions();
  const { t } = useTranslation();

  const onClose = () => setContextMenu(null);

  return (
    <Menu
      open={Boolean(contextMenu)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
    >
      {contextMenu?.kind === "background" && (
        <MenuItem onClick={onAddNewLine}>{t("ocrPreview.addTextLine")}</MenuItem>
      )}

      {contextMenu?.kind === "polygon" && contextMenu.pointIndex === null && (
        <MenuItem onClick={onAddPolygonPoint}>{t("ocrPreview.addPoint")}</MenuItem>
      )}

      {contextMenu?.kind === "polygon" && contextMenu.pointIndex !== null && (
        <MenuItem
          onClick={onDeletePolygonPoint}
          disabled={
            contextMenu === null ||
            contextMenu.pointIndex === null ||
            !lines[contextMenu.lineIndex]?.polygon ||
            (lines[contextMenu.lineIndex]?.polygon?.length ?? 0) <= 3
          }
        >
          {t("ocrPreview.deletePoint")}
        </MenuItem>
      )}

      {contextMenu?.kind === "polygon" && (
        <MenuItem onClick={onDeleteTextLine}>{t("ocrPreview.deleteTextLine")}</MenuItem>
      )}

      {selectedLineIndices.size >= 2 && (
        <MenuItem onClick={onMergeSelectedLines}>{t("ocrPreview.mergeSelectedLines")}</MenuItem>
      )}

      <MenuItem
        onClick={() => {
          onClose();
          onOcrPage?.();
        }}
        disabled={!onOcrPage}
      >
        {t("detail.ocrPage")}
      </MenuItem>

      <MenuItem
        onClick={() => {
          onClose();
          onTextlessPageWithSave();
        }}
      >
        {t("detail.textlessPage")}
      </MenuItem>

      <MenuItem
        onClick={() => {
          onClose();
          onTranslatePage?.();
        }}
        disabled={!onTranslatePage}
      >
        {t("detail.translatePage")}
      </MenuItem>

      <MenuItem
        onClick={() => {
          onClose();
          onExportPng();
        }}
      >
        {t("ocrPreview.exportPng")}
      </MenuItem>
    </Menu>
  );
};

export default EditorContextMenu;
