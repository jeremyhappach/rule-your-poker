import { format } from "date-fns";

// More obscure Grateful Dead deep cuts
const GRATEFUL_DEAD_SONGS = [
  "Wharf Rat",
  "Stella Blue",
  "Mission in the Rain",
  "Row Jimmy",
  "Weather Report Suite",
  "Estimated Prophet",
  "Terrapin Station",
  "Here Comes Sunshine",
  "Crazy Fingers",
  "Ship of Fools",
  "Althea",
  "Black Peter",
  "Loser",
  "Dupree's Diamond Blues",
  "Dire Wolf",
  "High Time",
  "Ramble On Rose",
  "He's Gone",
  "Comes a Time",
  "Standing on the Moon",
  "Days Between",
  "So Many Roads",
  "Unbroken Chain",
  "Mountains of the Moon",
  "New Speedway Boogie",
  "Till the Morning Comes",
  "Attics of My Life",
  "To Lay Me Down",
  "Candyman",
  "Bird Song",
  "Deal",
  "Brokedown Palace",
  "Jack Straw",
  "Morning Dew",
  "Playing in the Band",
  "The Wheel",
  "Let It Grow",
  "Scarlet > Fire",
  "Help > Slip > Frank",
  "China > Rider",
];

// Chicago athletes - NO WHITE SOX, Cubs players post-2010 only
const CHICAGO_ATHLETES = [
  // Bears
  "Walter Payton",
  "Dick Butkus",
  "Brian Urlacher",
  "Gale Sayers",
  "Mike Singletary",
  "Richard Dent",
  "Devin Hester",
  "Lance Briggs",
  "Matt Forte",
  "Peanut Tillman",
  "Julius Peppers",
  "Khalil Mack",
  "Roquan Smith",
  "Eddie Jackson",
  // Bulls
  "Michael Jordan",
  "Scottie Pippen",
  "Derrick Rose",
  "Joakim Noah",
  "Luol Deng",
  "Jimmy Butler",
  "Taj Gibson",
  "Kirk Hinrich",
  "Ben Gordon",
  "Zach LaVine",
  "DeMar DeRozan",
  "Coby White",
  // Blackhawks
  "Patrick Kane",
  "Jonathan Toews",
  "Duncan Keith",
  "Brent Seabrook",
  "Marian Hossa",
  "Patrick Sharp",
  "Corey Crawford",
  "Artemi Panarin",
  "Alex DeBrincat",
  "Connor Bedard",
  // Cubs (post-2010 only)
  "Anthony Rizzo",
  "Kris Bryant",
  "Javier Baez",
  "Kyle Schwarber",
  "Addison Russell",
  "Willson Contreras",
  "David Ross",
  "Ben Zobrist",
  "Dexter Fowler",
  "Jake Arrieta",
  "Jon Lester",
  "Kyle Hendricks",
  "Pedro Strop",
  "Carl Edwards Jr",
  "Albert Almora",
  "Ian Happ",
  "Nico Hoerner",
  "Cody Bellinger",
  "Dansby Swanson",
  "Marcus Stroman",
  "Seiya Suzuki",
  "Christopher Morel",
  "Justin Steele",
  "Jameson Taillon",
  "Matt Mervis",
  "Miguel Amaya",
];

/**
 * Generates a creative game name combining the current date with either
 * a Grateful Dead song or a Chicago athlete name.
 * Optionally excludes names that have been recently used.
 */
export function generateGameName(excludeNames: string[] = []): string {
  const dateStr = format(new Date(), "MMM d");
  const excludeSet = new Set(excludeNames);
  
  // Build list of all possible names
  const allPossibleNames = [
    ...GRATEFUL_DEAD_SONGS.map(song => `${dateStr} - ${song}`),
    ...CHICAGO_ATHLETES.map(athlete => `${dateStr} - ${athlete}`)
  ];
  
  // Filter out excluded names
  const availableNames = allPossibleNames.filter(name => !excludeSet.has(name));
  
  // If all names are taken (unlikely), fall back to any random name
  if (availableNames.length === 0) {
    return allPossibleNames[Math.floor(Math.random() * allPossibleNames.length)];
  }
  
  return availableNames[Math.floor(Math.random() * availableNames.length)];
}
