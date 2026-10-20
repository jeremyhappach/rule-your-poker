import type {GameDescriptor} from '../types';
export default {
  "id": "boxdrop",
  "defaultsKey": "boxdrop",
  "name": "Boxdrop",
  "category": "other",
  "order": 11,
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
  "bots": "supported",
  "availability": "boxdrop",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "boxdrop",
    load:()=>import("@/components/rules/BoxdropRules")
  },
  "defaultsEditor": "stake",
  "artwork": "boxdrop"
} satisfies GameDescriptor;
