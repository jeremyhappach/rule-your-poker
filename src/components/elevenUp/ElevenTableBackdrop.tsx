import lampArtwork from './billiard-lamp.svg';
/** Decorative skin of the existing canonical playfield. No layout or input owner. */
export function ElevenTableBackdrop(){
 return <div className="eleven-table-backdrop" aria-hidden="true">
  <div className="eleven-table-bed"/>
  <div className="eleven-table-cushion eleven-table-cushion--left"/>
  <div className="eleven-table-cushion eleven-table-cushion--right"/>
  <div className="eleven-table-cushion eleven-table-cushion--top"/>
  <div className="eleven-table-cushion eleven-table-cushion--bottom"/>
  <div className="eleven-table-rail eleven-table-rail--left"/>
  <div className="eleven-table-rail eleven-table-rail--right"/>
  <div className="eleven-table-rail eleven-table-rail--top"/>
  <div className="eleven-table-rail eleven-table-rail--bottom"/>
  {[20,40,60,80].map(at=><span key={at} className="eleven-table-sights" style={{top:`${at}%`}}><i/><i/></span>)}
  {['top-left','top-right','middle-left','middle-right','bottom-left','bottom-right'].map(position=><i key={position} className={`eleven-table-pocket eleven-table-pocket--${position}`}/>)}
  <div className="eleven-table-light"/>
  <div className="eleven-table-lamp"><img src={lampArtwork} alt="" draggable={false}/></div>
 </div>;
}
