import type {GameDescriptor} from '../types';
export default {
  "id": "ship-captain-crew",
  "defaultsKey": "ship-captain-crew",
  "name": "Ship Captain Crew",
  "category": "dice",
  "order": 5,
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
    "key": "scc"
  },
  "defaultsEditor": "legacy",
  "geometry": "ship-captain-crew"
} satisfies GameDescriptor;
