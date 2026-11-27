import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
const App = lazy(() => import("./App"));
import { AuthProvider } from "./auth";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <Suspense fallback={<p role="status">Loading dashboard…</p>}>
        <App />
      </Suspense>
    </AuthProvider>
  </React.StrictMode>,
);
