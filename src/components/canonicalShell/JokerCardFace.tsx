/** Shared stationary/transport artwork; never supplies visibility admission. */
export function JokerCardFace() {
  return <span data-joker-face="" aria-label="Joker" style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: '100%', height: '100%', color: '#31224b', background: '#fffaf0',
  }}>
    <span aria-hidden="true" style={{ fontSize: '1.65em', lineHeight: 1 }}>✦</span>
    <span style={{ fontSize: '.55em', fontWeight: 900, letterSpacing: '.04em' }}>JOKER</span>
  </span>;
}
