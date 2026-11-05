import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../console/src/App";
import "../../console/src/styles.css";
import { ToastProvider } from "../../console/src/components/Toast";

createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider><App/></ToastProvider></StrictMode>);
