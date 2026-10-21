import type {GameDescriptor} from '../types';
export default {
  "id": "3-5-7",
  "defaultsKey": "3-5-7",
  "name": "3-5-7",
  "category": "cards",
  "order": 1,
  "family": "traditional",
  "modes": [
    "multiplayer"
  ],
  "players": {
    "min": 2,
    "max": 7,
    "selection": "active-roster"
  },
  "bots": "supported",
  "availability": "existing-setup",
  "development": "integrated",
  "ownerSmoke": "existing-release",
  "rules": {
    "kind": "traditional",
    "key": "357"
  },
  "defaultsEditor": "legacy",
  "geometry": "threeFiveSeven"
} satisfies GameDescriptor;
