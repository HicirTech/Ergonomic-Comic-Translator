import React, { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { DragHandle } from "@mui/icons-material";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";

import type { MergePreviewItem } from "../types.ts";

interface MergePreviewDialogProps {
  open: boolean;
  items: MergePreviewItem[];
  onConfirm: (orderedItems: MergePreviewItem[]) => void;
  onCancel: () => void;
}

// ── Sortable row ─────────────────────────────────────────────────────────────

const SortableMergeItem: React.FC<{ item: MergePreviewItem; index: number }> = ({ item, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.arrayIndex });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  };

  return (
    <ListItem ref={setNodeRef} style={style} {...attributes} sx={{ alignItems: "flex-start", gap: 1 }}>
      <ListItemIcon
        {...listeners}
        sx={{ minWidth: 32, mt: 0.5, cursor: "grab", color: "text.secondary" }}
      >
        <DragHandle fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
            #{index + 1}
          </Typography>
        }
        secondary={
          <>
            <Typography variant="body2" component="span" sx={{ display: "block", whiteSpace: "pre-wrap" }}>
              {item.text || "—"}
            </Typography>
            {item.translated && (
              <Typography
                variant="body2"
                component="span"
                color="primary"
                sx={{ display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}
              >
                {item.translated}
              </Typography>
            )}
          </>
        }
      />
    </ListItem>
  );
};

// ── Dialog ───────────────────────────────────────────────────────────────────

const MergePreviewDialog: React.FC<MergePreviewDialogProps> = ({
  open,
  items: initialItems,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<MergePreviewItem[]>(initialItems);

  // Reset order when dialog opens with new items
  React.useEffect(() => {
    if (open) setItems(initialItems);
  }, [open, initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const sortableIds = useMemo(() => items.map((it) => it.arrayIndex), [items]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((it) => it.arrayIndex === active.id);
      const newIdx = prev.findIndex((it) => it.arrayIndex === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t("ocrPreview.mergePreviewTitle")}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
          {t("ocrPreview.mergePreviewHint")}
        </Typography>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <List dense disablePadding>
              {items.map((item, idx) => (
                <SortableMergeItem key={item.arrayIndex} item={item} index={idx} />
              ))}
            </List>
          </SortableContext>
        </DndContext>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={() => onConfirm(items)}>
          {t("ocrPreview.mergeConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MergePreviewDialog;
