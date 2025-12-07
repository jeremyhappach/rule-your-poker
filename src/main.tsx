import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  rootElement.innerHTML = '<div style="color: white; padding: 20px;">Loading app...</div>';
  
  import("./App.tsx")
    .then(({ default: App }) => {
      createRoot(rootElement).render(<App />);
    })
    .catch((error) => {
      rootElement.innerHTML = `<div style="color: white; padding: 20px; font-family: monospace;">
        <h1>Import Error</h1>
        <pre>${error instanceof Error ? error.stack : String(error)}</pre>
      </div>`;
    });
}
