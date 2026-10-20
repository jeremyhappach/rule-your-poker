import type {GameDescriptor} from '../types';
export default {
  "id": "farkle",
  "defaultsKey": "farkle",
  "name": "Farkle",
  "category": "dice",
  "order": 7,
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
    "key": "farkle"
  },
  "defaultsEditor": "farkle",
  "geometry": "farkle"
} satisfies GameDescriptor;
