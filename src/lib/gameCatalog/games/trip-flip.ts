import type {GameDescriptor} from '../types';
export default {
  "id": "trip-flip",
  "defaultsKey": "trip-flip",
  "name": "Trip Flip",
  "category": "other",
  "order": 12,
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
  "availability": "trip-flip",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "trip-flip",
    load:()=>import("@/components/rules/TripFlipRules")
  },
  "defaultsEditor": "stake",
  "artwork": "trip-flip"
} satisfies GameDescriptor;
