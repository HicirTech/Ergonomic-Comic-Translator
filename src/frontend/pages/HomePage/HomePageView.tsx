import React from "react";
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import { Add, AutoStories } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { type UploadBatch } from "../../api/index.ts";
import UploadCard from "../../components/UploadCard/index.tsx";

export interface HomePageViewProps {
  batches: UploadBatch[];
  isLoading: boolean;
  onOpenUploadDialog: () => void;
  onDeleteBatch: () => void;
}

const HomePageView: React.FC<HomePageViewProps> = ({
  batches,
  isLoading,
  onOpenUploadDialog,
  onDeleteBatch,
}) => {
  const { t } = useTranslation();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* App bar */}
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <AutoStories sx={{ mr: 1.5, opacity: 0.8 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("app.title")}
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={onOpenUploadDialog}
            sx={{ borderRadius: 2 }}
          >
            {t("home.upload")}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Body */}
      <Container maxWidth={false} sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
            <CircularProgress />
          </Box>
        )}

        {!isLoading && batches.length === 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              mt: 12,
              gap: 2,
              opacity: 0.5,
            }}
          >
            <AutoStories sx={{ fontSize: 72 }} />
            <Typography variant="h6">{t("home.empty")}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {t("home.emptyDesc")}
            </Typography>
          </Box>
        )}

        {!isLoading && batches.length > 0 && (
          <Box
            sx={{
              display: "grid",
              // Each card is at least 300px wide; the grid fills available space
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 2,
            }}
          >
            {batches.map((batch) => (
              // Min height 500px = ~125% padding-top on a 300px-wide portrait card
              <Box key={batch.uploadId} sx={{ minHeight: 500 }}>
                <UploadCard batch={batch} onDeleted={onDeleteBatch} />
              </Box>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default HomePageView;
