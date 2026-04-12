import React, { useEffect, useState, useCallback } from "react";
import { fetchUploadBatches, type UploadBatch } from "../../api/index.ts";
import UploadDialog from "../../components/UploadDialog/index.tsx";
import HomePageView from "./HomePageView.tsx";

const HomePageContainer: React.FC = () => {
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadBatches = useCallback(async () => {
    setIsLoading(true);
    try {
      setBatches(await fetchUploadBatches());
    } catch (err) {
      console.error("[HomePage] failed to load uploads:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const handleUploadSuccess = useCallback(() => {
    setDialogOpen(false);
    void loadBatches();
  }, [loadBatches]);

  return (
    <>
      <HomePageView
        batches={batches}
        isLoading={isLoading}
        onOpenUploadDialog={() => setDialogOpen(true)}
        onDeleteBatch={() => { void loadBatches(); }}
      />
      <UploadDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </>
  );
};

export default HomePageContainer;
