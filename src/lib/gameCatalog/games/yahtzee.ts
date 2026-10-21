import type {GameDescriptor} from '../types';
export default {
  "id": "yahtzee",
  "defaultsKey": "yahtzee",
  "name": "Yahtzee",
  "category": "dice",
  "order": 6,
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
    "key": "yahtzee"
  },
  "defaultsEditor": "legacy",
  "geometry": "yahtzee"
} satisfies GameDescriptor;
