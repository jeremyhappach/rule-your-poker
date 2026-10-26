import type {GameDescriptor} from '../types';
export default {
  "id": "quintzee",
  "defaultsKey": "quintzee",
  "name": "Quintzee",
  "category": "dice",
  "order": 19,
  "family": "megatouch",
  "modes": [
    "multiplayer",
    "arcade"
  ],
  "players": {
    "min": 2,
    "max": 4,
    "selection": "active-roster"
  },
  "bots": "fake-money-only",
  "moneyModes": ["fake"],
  "availability": "quintzee",
  "development": "integrated",
  "ownerSmoke": "pending",
  "rules": {
    "kind": "versioned",
    "key": "quintzee",
    load:()=>import("@/components/rules/QuintzeeRules")
  },
  "defaultsEditor": "stake",
  "artwork": "quintzee"
} satisfies GameDescriptor;
