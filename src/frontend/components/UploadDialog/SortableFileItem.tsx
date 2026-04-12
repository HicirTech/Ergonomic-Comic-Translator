import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
} from "@mui/material";
import {
  DragHandle,
  PictureAsPdf,
  Image,
  FolderZip,
  InsertDriveFile,
  Close,
} from "@mui/icons-material";

const getFileIcon = (file: File): React.ReactNode => {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
    return <PictureAsPdf fontSize="small" />;
  if (file.type.startsWith("image/")) return <Image fontSize="small" />;
  if (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  )
    return <FolderZip fontSize="small" />;
  return <InsertDriveFile fontSize="small" />;
};

interface SortableFileItemProps {
  id: string;
  file: File;
  typeLabel: string;
  onRemove: () => void;
}

const SortableFileItem: React.FC<SortableFileItemProps> = ({
  id,
  file,
  typeLabel,
  onRemove,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <ListItem
      ref={setNodeRef}
      disablePadding
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        bgcolor: "rgba(255,255,255,0.04)",
        borderRadius: 1,
        mb: 0.5,
        px: 1,
        py: 0.5,
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      {/* Drag handle */}
      <Box
        {...attributes}
        {...listeners}
        sx={{ cursor: "grab", display: "flex", color: "text.secondary", flexShrink: 0 }}
      >
        <DragHandle fontSize="small" />
      </Box>

      <ListItemIcon sx={{ minWidth: 32, color: "text.secondary", flexShrink: 0 }}>
        {getFileIcon(file)}
      </ListItemIcon>

      <ListItemText
        primary={file.name}
        secondary={`${typeLabel} · ${(file.size / 1024).toFixed(0)} KB`}
        slotProps={{
          primary: { variant: "body2", noWrap: true } as object,
          secondary: { variant: "caption" } as object,
        }}
        sx={{ minWidth: 0 }}
      />

      <IconButton size="small" onClick={onRemove} sx={{ flexShrink: 0, ml: "auto" }}>
        <Close fontSize="small" />
      </IconButton>
    </ListItem>
  );
};

export default SortableFileItem;
