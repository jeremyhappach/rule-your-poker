/** Fictional audition inputs only. This module is never imported by gameplay. */
export function awardChoice(input:{local:boolean;terminal:boolean;sweep:boolean;legs:number;target:number}){
 // Counts describe the screen. Only an admitted terminal result can select victory.
 if(input.terminal&&input.sweep)return 'sweep';
 if(input.terminal)return 'winner-a';
 return input.local?'my-leg':'opponent-leg';
}
