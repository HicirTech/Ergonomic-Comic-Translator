import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteVolume, pageImageUrl } from "../../api/index.ts";
import type { VolumeSummary } from "../../../server/interfaces/volume-summary.ts";
import VolumeCardView from "./VolumeCardView.tsx";

export interface VolumeCardProps {
  volume: VolumeSummary;
  onDeleted: () => void;
}

const VolumeCardContainer: React.FC<VolumeCardProps> = ({ volume, onDeleted }) => {
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <VolumeCardView
      volume={volume}
      coverUrl={pageImageUrl(volume.id, 1, "original")}
      confirmingDelete={confirmingDelete}
      onOpen={() => navigate(`/volumes/${volume.id}`)}
      onAskDelete={() => setConfirmingDelete(true)}
      onCancelDelete={() => setConfirmingDelete(false)}
      onDelete={() => {
        setConfirmingDelete(false);
        void deleteVolume(volume.id).then(onDeleted);
      }}
    />
  );
};

export default VolumeCardContainer;
