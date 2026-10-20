import type {GameDescriptor} from '../types';
export default {
  "id": "tri-towers",
  "defaultsKey": "tri-towers",
  "name": "TriTowers",
  "category": "other",
  "order": 9,
  "family": "megatouch",
  "modes": [
    "multiplayer",
    "arcade"
  ],
  "players": {
    "min": 2,
    "max": 7,
    "selection": "active-roster"
  },
  "bots": "supported",
  "availability": "tri-towers",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "tri-towers",
    load:()=>import("@/components/rules/TriTowersRules")
  },
  "defaultsEditor": "stake",
  "artwork": "tri-towers"
} satisfies GameDescriptor;
