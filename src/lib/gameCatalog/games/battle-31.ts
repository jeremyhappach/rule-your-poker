import type {GameDescriptor} from '../types';
export default {
  "id": "battle-31",
  "defaultsKey": "battle-31",
  "name": "Battle 31",
  "category": "other",
  "order": 16,
  "family": "megatouch",
  "modes": [
    "multiplayer"
  ],
  "players": {
    "min": 2,
    "max": 2,
    "selection": "active-roster"
  },
  "bots": "supported",
  "availability": "battle-31",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "battle-31",
    "fixedVersion": "battle-31/1",
    load:()=>import("@/components/rules/Battle31Rules")
  },
  "defaultsEditor": "stake",
  "artwork": "battle-31"
} satisfies GameDescriptor;
