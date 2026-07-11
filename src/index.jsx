// src/index.jsx (or src/main.jsx)
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { ThemeProvider } from "./theme";
import "./styles/themes.css";
import "./index.css";
import { Analytics } from "@vercel/analytics/react";

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <ThemeProvider>
      <BrowserRouter>
      <App />
      <Analytics />
      </BrowserRouter>
    </ThemeProvider>
  </AppErrorBoundary>,
);
