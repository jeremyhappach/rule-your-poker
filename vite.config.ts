import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __BUILD_HASH__: JSON.stringify(getGitHash()),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    // Phase 7: enable canonical neutral interstitial between dealer games.
    // Phase 5 shell-lift flag (VITE_CANONICAL_SHELL_LIFT) is intentionally
    // NOT set here so its existing rollback behavior remains intact.
    "import.meta.env.VITE_CANONICAL_SLOT_NEUTRAL": JSON.stringify("on"),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
