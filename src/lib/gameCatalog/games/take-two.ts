import type {GameDescriptor} from '../types';
export default {
  "id": "take-two",
  "defaultsKey": "take-two",
  "name": "Take 2",
  "category": "other",
  "order": 13,
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
  "availability": "take-two",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "take-two",
    load:()=>import("@/components/rules/TakeTwoRules")
  },
  "defaultsEditor": "stake",
  "artwork": "take-two"
} satisfies GameDescriptor;
