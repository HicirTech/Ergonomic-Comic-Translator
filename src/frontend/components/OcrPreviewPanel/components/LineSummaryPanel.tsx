import React from "react";
import { Box } from "@mui/material";
import CurrentPageLines from "./CurrentPageLines.tsx";
import ProblemNavigator from "./ProblemNavigator.tsx";

const LineSummaryPanel: React.FC = () => (
  <Box
    sx={{
      width: 280,
      minWidth: 280,
      maxWidth: 280,
      borderLeft: "1px solid",
      borderColor: "divider",
      bgcolor: "background.paper",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <CurrentPageLines />
    <ProblemNavigator />
  </Box>
);

export default LineSummaryPanel;
