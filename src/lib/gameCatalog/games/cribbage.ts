import type {GameDescriptor} from '../types';
export default {
  "id": "cribbage",
  "defaultsKey": "cribbage",
  "name": "Cribbage",
  "category": "cards",
  "order": 2,
  "family": "traditional",
  "modes": [
    "multiplayer"
  ],
  "players": {
    "min": 2,
    "max": 4,
    "selection": "active-roster"
  },
  "bots": "supported",
  "availability": "existing-setup",
  "development": "integrated",
  "ownerSmoke": "existing-release",
  "rules": {
    "kind": "traditional",
    "key": "cribbage"
  },
  "defaultsEditor": "legacy",
  "geometry": "cribbage"
} satisfies GameDescriptor;
