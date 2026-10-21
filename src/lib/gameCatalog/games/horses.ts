import type {GameDescriptor} from '../types';
export default {
  "id": "horses",
  "defaultsKey": "horses",
  "name": "Horses",
  "category": "dice",
  "order": 4,
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
    "key": "horses"
  },
  "defaultsEditor": "legacy",
  "geometry": "horses"
} satisfies GameDescriptor;
