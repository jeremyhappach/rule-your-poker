import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  // Test 1: Simple DOM manipulation to confirm JS is running
  rootElement.innerHTML = '<div style="color: white; padding: 20px;">JavaScript is running...</div>';
  
  // Test 2: Try React render
  setTimeout(() => {
    try {
      const App = require("./App.tsx").default;
      createRoot(rootElement).render(<App />);
    } catch (error) {
      rootElement.innerHTML = `<div style="color: white; padding: 20px; font-family: monospace;">
        <h1>Import Error</h1>
        <pre>${error instanceof Error ? error.stack : String(error)}</pre>
      </div>`;
    }
  }, 100);
}
