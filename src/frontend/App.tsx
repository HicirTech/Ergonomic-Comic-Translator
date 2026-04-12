import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme/index.ts";
import HomePage from "./pages/HomePage/index.tsx";
import UploadDetailPage from "./pages/UploadDetailPage/index.tsx";

const App: React.FC = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload/:uploadId" element={<UploadDetailPage />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
