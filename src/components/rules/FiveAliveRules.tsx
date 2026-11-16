export default function FiveAliveRules(){return <div className="space-y-3">
 <h3>How to play</h3><p>Guess three five-letter words in six valid guesses each. Green marks a correct letter and place; yellow marks a letter elsewhere; gray means that copy is absent.</p>
 <h3>What scores</h3><p>Base points by solving guess: 1,000, 700, 490, 343, 240 and 168. A miss earns zero. Each completed word reveals its difficulty multiplier: Very Easy 0.8×, Easy 1.0×, Medium 1.2×, Hard 1.4× or Very Hard 1.6×.</p>
 <p>In Async, both players can play independently. A word’s results are revealed and the next word unlocks only after both finish. Higher total wins; ties go to more words solved, then fewer guesses. Exact ties draw.</p>
 </div>;}
