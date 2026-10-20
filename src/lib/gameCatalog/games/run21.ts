import type {GameDescriptor} from '../types';
export default {
  "id": "run21",
  "defaultsKey": "run21",
  "name": "Run21",
  "category": "other",
  "order": 8,
  "family": "megatouch",
  "modes": [
    "multiplayer",
    "arcade"
  ],
  "players": {
    "min": 2,
    "max": 2,
    "selection": "active-roster"
  },
  "bots": "fake-money-only",
  "availability": "run21",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "run21",
    load:()=>import("@/components/rules/Run21Rules")
  },
  "defaultsEditor": "legacy",
  "geometry": "run21",
  "artwork": "run21"
} satisfies GameDescriptor;
