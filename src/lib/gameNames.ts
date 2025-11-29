import { format } from "date-fns";

const GRATEFUL_DEAD_SONGS = [
  "Truckin'",
  "Touch of Grey",
  "Casey Jones",
  "Friend of the Devil",
  "Sugar Magnolia",
  "Ripple",
  "Uncle John's Band",
  "Fire on the Mountain",
  "Scarlet Begonias",
  "Eyes of the World",
  "Shakedown Street",
  "Box of Rain",
  "China Cat Sunflower",
  "Dark Star",
  "St. Stephen",
  "The Golden Road",
  "Bertha",
  "One More Saturday Night",
  "Tennessee Jed",
  "Brown-Eyed Women",
];

const CHICAGO_ATHLETES = [
  "Michael Jordan",
  "Walter Payton",
  "Ernie Banks",
  "Ryne Sandberg",
  "Anthony Rizzo",
  "Patrick Kane",
  "Jonathan Toews",
  "Derrick Rose",
  "Frank Thomas",
  "Dick Butkus",
  "Brian Urlacher",
  "Scottie Pippen",
  "Sammy Sosa",
  "Mike Ditka",
  "Stan Mikita",
  "Bobby Hull",
  "Gale Sayers",
  "Kerry Wood",
  "Mark Buehrle",
  "Paul Konerko",
];

/**
 * Generates a creative game name combining the current date with either
 * a Grateful Dead song or a Chicago athlete name
 */
export function generateGameName(): string {
  const dateStr = format(new Date(), "MMM d");
  
  // Randomly choose between Grateful Dead songs and Chicago athletes
  const useDeadSong = Math.random() < 0.5;
  
  if (useDeadSong) {
    const song = GRATEFUL_DEAD_SONGS[Math.floor(Math.random() * GRATEFUL_DEAD_SONGS.length)];
    return `${dateStr} - ${song}`;
  } else {
    const athlete = CHICAGO_ATHLETES[Math.floor(Math.random() * CHICAGO_ATHLETES.length)];
    return `${dateStr} - ${athlete}`;
  }
}
