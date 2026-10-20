import type {GameDescriptor} from '../types';
export default {
  "id": "eleven-up",
  "defaultsKey": "eleven-up",
  "name": "11 Up",
  "category": "other",
  "order": 10,
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
  "bots": "unsupported",
  "availability": "eleven-up",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "eleven-up",
    load:()=>import("@/components/rules/ElevenUpRules")
  },
  "defaultsEditor": "stake",
  "artwork": "eleven-up"
} satisfies GameDescriptor;
