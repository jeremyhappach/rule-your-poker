import {cargoBase} from '@/lib/shipCapVoyage/model';
export default function ShipCapVoyageRules(){return <div className="space-y-3">
 <h3>How to play</h3>
 <p>Play three rounds with twelve rolls each. Tap Roll to start. Lock a 6 (Ship), then 5 (Captain), then 4 (Crew). Several roles can lock on the same roll.</p>
 <p>Once qualified, the two remaining dice are cargo. Bank Cargo keeps the offer, or Roll Again rerolls both cargo dice. Bank three separate offers before your rolls run out. Snake eyes cannot be banked. Banking uses no roll; roll manually to begin the next cargo attempt.</p>
 <p>Three banks complete the round. Running out of rolls before all three banks forfeits the round. After the tally and a short hold, the next round opens with a bell and waits for Roll. Round 3 ends at the final results.</p>
 <h3>What scores</h3>
 <p>Each bank earns base points plus <strong>30 points per unused roll</strong>. All three banks must be filled or the round scores <strong>zero</strong>. There is no timer bonus.</p>
 <table><thead><tr><th>Cargo</th><th>Base points</th></tr></thead><tbody>{cargoBase.slice(3).map((points,i)=><tr key={i}><td>{i+3}</td><td>{points}</td></tr>)}</tbody></table>
 <h3>Examples</h3><p>Cargo 7 with nine rolls left offers 125 + 270 = 395. The same cargo with seven left offers 335. Compare the full offer before choosing to reroll.</p>
 </div>;}
