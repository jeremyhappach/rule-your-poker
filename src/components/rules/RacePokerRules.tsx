import type {RuleRendererProps} from '@/lib/gameCatalog/types';
export function RacePokerRules({version='race-poker/1'}:{version?:string}){
 return <div className="race-rules"><p><strong>Two horses. One race.</strong> Make five-card poker hands from three exposed choices. Each hand uses a fresh 52-card pack, without jokers. Choose a card to keep it; that choice refills, except after your fifth card. Other exposed choices stay. No undo, discard, or redraw.</p>
 <p>You have 30 seconds per hand. An incomplete hand earns zero. Help and disconnecting do not stop the clock. Each result remains for two seconds.</p>
 <p>Both players get one hand per paired round. The first starter is random and alternates each round. Reach 48,000 to trigger the final paired round. Both players always receive equal hands; highest total wins, including points beyond the finish. After 16 rounds, highest total wins even below the target. Equal scores draw and return equal stakes.</p>
 <table><tbody>{[['High card','Highest rank × 100'],['Pair','4,500'],['Two pair','6,700'],['Three of a kind','9,000'],['Straight','12,000'],['Flush','15,000'],['Full house','18,700'],['Four of a kind','22,500'],['Straight flush','28,500'],['Royal flush','37,500']].map(([name,points])=><tr key={name}><th>{name}</th><td>{points}</td></tr>)}</tbody></table>
 <p>J=11, Q=12, K=13, A=14. A–2–3–4–5 and 10–J–Q–K–A are straights; ranks never wrap around. Only the best category pays. No speed or other bonuses. Race points are separate from chips; finances settle once at the end.</p>
 <p>Both players and the bot see the active hand and exposed choices. Hidden future cards are never available to either player or bot strategy.</p><small>Approved Ptown adaptation · {version}</small></div>;
}

export default function CatalogRules({version}:RuleRendererProps){return <RacePokerRules version={version}/>;}
