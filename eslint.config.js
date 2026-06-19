import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ── Shell ownership boundary ─────────────────────────────────────────
// Games emit state. The shell mounts shell-owned artifacts.
// Direct imports of the primitives below are forbidden except in the
// allow-listed shell files. See mem://architecture/canonical-shell.
const SHELL_OWNED_PATTERNS = [
  "**/canonicalShell/CanonicalSeatCluster",
  "**/canonicalShell/CanonicalChipDisc",
  "**/canonicalShell/CanonicalChipstack",
  "**/components/ChipTransferAnimation",
  "**/components/CribbageChipTransferAnimation",
  // Relative variants (siblings inside canonicalShell/, etc.)
  "./CanonicalSeatCluster",
  "./CanonicalChipDisc",
  "./CanonicalChipstack",
  "./ChipTransferAnimation",
  "./CribbageChipTransferAnimation",
];

const SHELL_OWNERSHIP_MESSAGE =
  "Shell-owned primitive. Games emit state; the shell mounts artifacts.";

const SHELL_OWNERSHIP_ALLOW_LIST = [
  "src/components/MobileGameTable.tsx",
  "src/components/canonicalShell/CanonicalShellWaitingSurface.tsx",
  "src/lib/canonicalShell/NeutralInterstitial.tsx",
  "src/lib/canonicalShell/CanonicalSeatCluster.tsx",
  "src/lib/canonicalShell/CanonicalSeatCluster.test.tsx",
  "src/lib/canonicalShell/PreSessionSeatLayer.tsx",
  "src/lib/canonicalShell/CanonicalOpponentSeat.tsx",
  "src/lib/canonicalShell/ExtraDebugPills.tsx",
  "src/lib/canonicalShell/seatClusterInvariant.ts",
  "**/*.test.tsx",
  "**/*.test.ts",
];

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: SHELL_OWNED_PATTERNS.map((pattern) => ({
            group: [pattern],
            message: SHELL_OWNERSHIP_MESSAGE,
          })),
        },
      ],
    },
  },
  // Allow-list: shell-owned files may import shell-owned primitives.
  {
    files: SHELL_OWNERSHIP_ALLOW_LIST,
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
