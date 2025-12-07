import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  try {
    createRoot(rootElement).render(<App />);
  } catch (error) {
    console.error("Failed to render app:", error);
    rootElement.innerHTML = `<div style="color: white; padding: 20px; font-family: monospace;">
      <h1>App Error</h1>
      <pre>${error instanceof Error ? error.message : String(error)}</pre>
    </div>`;
  }
} else {
  console.error("Root element not found");
}
