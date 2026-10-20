import type {GameDescriptor} from '../types';
export default {
  "id": "royal-flash",
  "defaultsKey": "royal-flash",
  "name": "Royal Flash",
  "category": "other",
  "order": 14,
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
  "availability": "royal-flash",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "royal-flash",
    load:()=>import("@/components/rules/RoyalFlashRules")
  },
  "defaultsEditor": "stake",
  "artwork": "royal-flash"
} satisfies GameDescriptor;
