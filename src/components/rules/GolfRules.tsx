export default function GolfRules() {
 return <article className="space-y-3"><h2>Six-Card Golf · nine holes</h2>
 <p>Reveal two of your six cards to open each hole. On your turn, draw from stock, then replace any card face up or discard the draw. Taking the top discard must replace one of your cards. Face-down cards stay unknown, including your own.</p>
 <p>Aces score 1, twos −2, 3–10 face value, jacks and queens 10, kings 0. Two equal ranks in a vertical column score zero, including two twos. Jacks and queens do not cancel each other. Exposed cards and cancelled columns remain replaceable.</p>
 <p>Exposing all six cards gives every opponent one final turn. Then all remaining cards turn face up and the hole is scored. The scoreboard shows only totals from completed holes. Lowest total after nine holes wins; tied lowest totals share the win.</p>
 <h3>Ptown prolonged-play house rule</h3><p>A new exposure resets the progress counter. After four circuits without one, a warning appears. After five circuits, everyone gets one final turn, starting with the next player and ending with the player who triggered it. Once final turns begin, further exposures cannot alter the queue. Pauses never consume turns or force scoring.</p>
 <p>Each whole turn, including a stock draw and replacement, has 30 seconds. Real-money human timeouts pause the unresolved turn. Fake-money automatic play follows the table policy.</p>
 <p>One match stake per losing player; winners share it using the table's whole-chip clockwise split. No hole-by-hole payments. An all-player tie moves no chips.</p></article>;
}
