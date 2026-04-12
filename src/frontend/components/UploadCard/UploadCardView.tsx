import React from "react";
import {
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import { DeleteOutlined, PhotoOutlined } from "@mui/icons-material";

export interface UploadCardViewProps {
  uploadId: string;
  coverUrl: string;
  displayDate: string;
  fileCount: number;
  filesLabel: string;
  deleteLabel: string;
  hasCoverError: boolean;
  onCoverError: () => void;
  onClick: () => void;
  onDeleteClick: (e: React.MouseEvent) => void;
}

const UploadCardView: React.FC<UploadCardViewProps> = ({
  uploadId,
  coverUrl,
  displayDate,
  filesLabel,
  deleteLabel,
  hasCoverError,
  onCoverError,
  onClick,
  onDeleteClick,
}) => (
  <Card
    sx={{
      width: "100%",
      height: "100%",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
      "&:hover": {
        transform: "translateY(-4px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      },
    }}
  >
    <Tooltip title={deleteLabel} placement="top">
      <IconButton
        size="small"
        onClick={onDeleteClick}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 2,
          color: "error.main",
          bgcolor: "rgba(0, 0, 0, 0.35)",
          opacity: 0.8,
          "&:hover": { opacity: 1, bgcolor: "rgba(0, 0, 0, 0.5)" },
        }}
        aria-label={deleteLabel}
      >
        <DeleteOutlined fontSize="small" />
      </IconButton>
    </Tooltip>

    <CardActionArea
      onClick={onClick}
      sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}
    >
      {/* Cover image — padded to ~4:5 portrait ratio */}
      <Box
        sx={{
          position: "relative",
          paddingTop: "125%",
          bgcolor: "rgba(255,255,255,0.03)",
          overflow: "hidden",
        }}
      >
        {!hasCoverError && (
          <CardMedia
            component="img"
            image={coverUrl}
            alt={uploadId}
            onError={onCoverError}
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        {hasCoverError && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PhotoOutlined sx={{ fontSize: 56, opacity: 0.2 }} />
          </Box>
        )}
      </Box>

      {/* Metadata */}
      <CardContent sx={{ pt: 1.5, pb: "12px !important" }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5, lineHeight: 1.4 }}
        >
          {displayDate}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.68rem",
            opacity: 0.45,
            mb: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {uploadId}
        </Typography>
        <Chip label={filesLabel} size="small" variant="outlined" />
      </CardContent>
    </CardActionArea>
  </Card>
);

export default UploadCardView;
