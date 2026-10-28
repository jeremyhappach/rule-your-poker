import './canonicalCardCountBadge.css';

/** Public pile count, using the established Take 2 / 11 Up counter treatment.
 * The enclosing control supplies the accessible name and authoritative count.
 * This is a card artifact, never a financial chip or transport destination. */
export function CanonicalCardCountBadge({count}:{count:number}) {
 return <span className="canonical-card-count-badge" data-canonical-card-count aria-hidden="true">{count}</span>;
}
