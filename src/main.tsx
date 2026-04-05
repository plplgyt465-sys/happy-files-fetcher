import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Convert non-Error unhandled rejections to proper Errors so dev tooling
// doesn't show "An uncaught exception occurred but the error was not an error object."
window.addEventListener('unhandledrejection', (event) => {
  if (!(event.reason instanceof Error) && event.reason !== undefined) {
    console.error('Unhandled promise rejection (non-Error):', event.reason);
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
