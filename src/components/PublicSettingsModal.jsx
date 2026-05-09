import React from "react";
import PublicToggleCard from "./PublicToggleCard";
import { Modal } from "./ui";

const PublicSettingsModal = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <Modal title="Public Profile" onClose={onClose} maxWidth="max-w-lg">
      <PublicToggleCard />
    </Modal>
  );
};

export default PublicSettingsModal;
