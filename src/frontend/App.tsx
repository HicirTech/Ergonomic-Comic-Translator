import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme/index.ts";
import LibraryPage from "./pages/LibraryPage/index.tsx";
import VolumePage from "./pages/VolumePage/index.tsx";

const App: React.FC = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/volumes/:id" element={<VolumePage />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
