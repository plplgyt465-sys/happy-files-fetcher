import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

window.addEventListener('unhandledrejection', (event) => {
  if (!(event.reason instanceof Error) && event.reason !== undefined) {
    console.error('Unhandled promise rejection (non-Error):', event.reason);
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
