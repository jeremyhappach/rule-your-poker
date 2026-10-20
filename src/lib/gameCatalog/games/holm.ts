import type {GameDescriptor} from '../types';
export default {
  "id": "holm-game",
  "defaultsKey": "holm",
  "name": "Holm",
  "category": "cards",
  "order": 0,
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
    "key": "holm"
  },
  "defaultsEditor": "legacy",
  "geometry": "holm"
} satisfies GameDescriptor;
