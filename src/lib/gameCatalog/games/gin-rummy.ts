import type {GameDescriptor} from '../types';
export default {
  "id": "gin-rummy",
  "defaultsKey": "gin-rummy",
  "name": "Gin Rummy",
  "category": "cards",
  "order": 3,
  "family": "traditional",
  "modes": [
    "multiplayer"
  ],
  "players": {
    "min": 2,
    "max": 2,
    "selection": "active-roster"
  },
  "bots": "supported",
  "availability": "existing-setup",
  "development": "integrated",
  "ownerSmoke": "existing-release",
  "rules": {
    "kind": "traditional",
    "key": "gin-rummy"
  },
  "defaultsEditor": "legacy",
  "geometry": "ginRummy"
} satisfies GameDescriptor;
