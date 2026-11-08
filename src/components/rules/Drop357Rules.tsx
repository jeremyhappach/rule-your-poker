export default function Drop357Rules({version}:{version?:string}){
 const partial=version==='357-drop/4'||version==='357-drop/5',carry=version==='357-drop/3';
 return <div className="space-y-3">
  <h3>How to play</h3>
  <p>Place the face-up card into an open {partial||carry?'new-card slot':'row'}, or use one of your {carry?'five':'three'} passes per round to skip it. Placements are permanent.</p>
  {partial?<><p>You can fill new-card slots in later rows before choosing your carries. Dashed slots are reserved for carried cards.</p><ul>
   <li><strong>3s row:</strong> Place three new cards. 3s are wild. Select one card from the completed hand and Confirm to carry it into the 5s row. Tap another card to change your choice.</li>
   <li><strong>5s row:</strong> Place four new cards and add the carried card. 5s are wild. Select two cards from the completed hand, including its carried card if you wish, then Confirm to carry them into the 7s row.</li>
   <li><strong>7s row:</strong> Place five new cards and add the two carried cards. 7s are wild. Your best five cards score.</li>
  </ul><p>A zero-point row still supplies carry cards. Carried cards keep their printed ranks and suits, and follow the destination row’s wild rule. Carries cost no pass or new card.</p></>:carry?<p>Place seven new cards across the three rows. The completed 3s row carries all three cards into the 5s row; that completed hand carries all five into the 7s row, including zero-point hands. Later new-card slots can be filled first. Printed cards follow each destination’s wild rule.</p>:<p>Fill the 3s, 5s and 7s rows with three, five and seven cards. A rank matching its row is wild there. Filled rows lock; the 7s row uses its best five cards.</p>}
  <p>{version==='357-drop/1'?'One round.':'Three rounds with fresh decks.'} Each round has 120 seconds after the opening bell. Complete all rows{partial?' and both carries':''}, or let the clock expire. At timeout, only resolved rows score. {version!=='357-drop/1'&&'The next round starts automatically after the tally.'}</p>
  <h3>What scores</h3>
  <table><thead><tr><th>Row</th><th>Scoring hands</th></tr></thead><tbody>
   <tr><td>3s</td><td>A pair or three of a kind. Straights and flushes do not score.</td></tr>
   <tr><td>5s / 7s</td><td>Two pair or better: trips, straight, flush, full house, four of a kind, straight flush, royal flush, five of a kind.</td></tr>
  </tbody></table>
  <p>Higher poker hands earn more base points. Ranks and kickers select the strongest hand. A scoring hand made without wilds earns a <strong>20% natural bonus</strong>; an unused wild outside the best five does not remove it. {version==='357-drop/5'?'Score in all three rows to earn a 500-point ALL FILLED bonus.':'Score in all three rows to earn a 200-point ALL FILLED bonus.'} Finish early for a time bonus that grows with the time left. Timeout earns no time bonus.</p>
  <h3>Examples</h3>
  <table><thead><tr><th>Compare</th><th>Why</th></tr></thead><tbody>
   <tr><td>J–J–A vs. J–J–K</td><td>In the 3s row, the natural pair with an ace kicker scores 150; the king kicker scores 148.</td></tr>
   <tr><td>J–J–3 vs. J–J–A</td><td>The wild 3 makes three jacks: 480 beats the natural pair’s 150.</td></tr>
   <tr><td>8–8–8–4–4 vs. A–A–A–K–K</td><td>Aces full wins: compare the trip rank first.</td></tr>
   <tr><td>A–A–A–K–K vs. A–A–A–8–8</td><td>Same trips: the pair of kings beats the pair of eights.</td></tr>
   <tr><td>A–A–A–K–K vs. A–A–5–K–K</td><td>In the 5s row, both make aces full of kings. The natural hand earns 2,224; the wild-assisted hand earns 1,853.</td></tr>
   <tr><td>A–K–Q–J–10 vs. 9–8–7–6–5</td><td>For the best five in the 7s row, the ace-high straight ranks higher. Use mixed suits; a suited straight is a stronger category.</td></tr>
   <tr><td>A–K–10–8–2 vs. A–Q–10–8–2, each all one suit</td><td>Flushes compare from the top down: the king wins after the aces tie. Both natural ace-high flushes earn 1,620 under this paytable.</td></tr>
  </tbody></table>
 </div>;
}
