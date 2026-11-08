export function ChuckyLevelAvailability({uses}: {uses: number[]}) {
  return <div className="cs-availability" role="list" aria-label="Remaining Chucky level uses">
    <span className="cs-availability-label" aria-hidden="true">Levels</span>
    {uses.map((count, index) => <span key={index} role="listitem" className="cs-availability-level"
      data-exhausted={count === 0} aria-label={`Level ${index + 1}, ${count} ${count === 1 ? 'use' : 'uses'} remaining`}>
      <b aria-hidden="true">{index + 1}</b>
      <span className="cs-pips" aria-hidden="true">{Array.from({length: 2}, (_, pip) => <i key={pip} data-available={pip<count}/>)}</span>
    </span>)}
  </div>;
}
