import {cargoBase} from '@/lib/shipCapVoyage/model';
export default function ShipCapVoyageRules(){return <div className="space-y-3">
 <p>Three rounds. Twelve rolls each. Lock a 6 (Ship), then 5 (Captain), then 4 (Crew). Multiple roles can qualify on one roll.</p>
 <p>Roll the two remaining cargo dice together and bank three separate scores. Snake eyes cannot be banked. Every roll is manual; banking uses no roll.</p>
 <p>Each bank earns its base points plus <strong>30 points per unused roll</strong>. Bank all three or the entire round scores <strong>zero</strong>. There is no timer bonus.</p>
 <table><thead><tr><th>Cargo</th><th>Base points</th></tr></thead><tbody>{cargoBase.slice(3).map((points,i)=><tr key={i}><td>{i+3}</td><td>{points}</td></tr>)}</tbody></table>
 <p>Only completed three-round games enter the leaderboard. Abandoning is unranked.</p>
 </div>;}
