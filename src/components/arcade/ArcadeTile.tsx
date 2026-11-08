import type {CSSProperties, ComponentProps} from 'react';
import {Link} from 'react-router-dom';
import {ArcadeArtwork, ArcadeInfo} from './ArcadeInfo';
import {APPROVED_TILE_ARTWORK, hasNewerTileArtwork} from '@/lib/arcade/tileArtwork';

export function ArcadeTile(props: ComponentProps<typeof ArcadeInfo>) {
  const {game, name, artwork} = props;
  const approved = APPROVED_TILE_ARTWORK[game];
  const useApproved = !!approved && !hasNewerTileArtwork(artwork);
  const source = approved ? '/arcade/approved-v1/' + approved.slug : '';
  return <article className={"arcade-tile arcade-banner-tile"+(useApproved&&approved.embeddedInfo?' arcade-tile--embedded-info':'')}
    style={{'--embedded-info-right':approved?.embeddedInfo?.right,'--embedded-info-bottom':approved?.embeddedInfo?.bottom,'--embedded-info-width':approved?.embeddedInfo?.width,'--embedded-info-height':approved?.embeddedInfo?.height,'--arcade-info-bottom':useApproved ? approved.infoBottom : undefined} as CSSProperties}>
    <div className="arcade-banner-frame" style={{width:useApproved&&approved.width&&approved.height?`${Math.min(1,approved.width/approved.height/(1466/564))*100}%`:undefined}}>
    <Link className="arcade-banner-link" to={'/arcade/'+game} aria-label={name+' leaderboard'}>
      <h2 className={useApproved ? 'sr-only' : 'arcade-banner-title'}>{name}</h2>
      {useApproved ? <img className="arcade-banner-art" alt="" width={approved.width??1466} height={approved.height??564}
        src={approved.source??source+'-480.webp'} srcSet={approved.source?undefined:`${source}-480.webp 480w, ${source}-960.webp 960w`}
        sizes="(min-width: 832px) 387px, calc((100vw - 36px) / 2)" decoding="async"/>
        : <ArcadeArtwork path={artwork?.object_path??null}/>}
    </Link>
    <ArcadeInfo {...props} banner/>
    </div>
  </article>;
}
