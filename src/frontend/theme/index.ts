import { createTheme, type Theme } from "@mui/material/styles";

export const theme: Theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#7b8cde" },
    secondary: { main: "#f48fb1" },
    background: {
      default: "#0f0f17",
      paper: "#1a1a2e",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
          border: "1px solid rgba(255,255,255,0.08)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(15,15,23,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
  },
});
