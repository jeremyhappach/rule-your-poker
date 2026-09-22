// Executed through Codex's CUA browser API against the offline fixture.
// No browser installation, production connection, or database access.
export async function verifyRun21Browser(tab, viewport, sizes=[{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:320,height:568}]) {
  const evidence=[];
  for(const size of sizes) {
    await viewport.set(size);
    if(!await tab.playwright.locator('select[data-run21-viewer]').count()){
      await tab.playwright.getByText('geometry',{exact:true}).click();
      await tab.getAXState({emit:false});
    }
    for(const viewer of ['self','opponent','observer']) {
    await tab.playwright.locator('select[data-run21-viewer]').selectOption(viewer);
    await tab.getAXState({emit:false});
    for(const scene of ['active','column-counts','maximum-depth','pass-used','collect-unavailable','collect-available','bust','time-expired','round-reveal','remote']) {
      await tab.playwright.locator('select[data-run21-scene]').selectOption(scene);
      await tab.getAXState({emit:false});
      const check=await tab.playwright.evaluate(()=>{
        const rect=e=>e.getBoundingClientRect();
        const felt=rect(document.querySelector('[data-canonical-shell-felt-frame]'));
        const game=document.querySelector('[data-run21-gameplay]'),g=rect(game);
        const columns=[...game.querySelectorAll('.run21-column')];
        const inside=r=>r.left>=felt.left-1&&r.top>=felt.top-1&&r.right<=felt.right+1&&r.bottom<=felt.bottom+1;
        const pass=document.querySelector('.run21-pass-button'),collect=document.querySelector('.run21-collect-button');
        const current=document.querySelector('.run21-currentCard .run21-card');
        const face=current?.querySelector('[data-playing-card-face]');
        const reserved=[...document.querySelectorAll('[data-canonical-felt-plate], [data-canonical-seat-cluster], [data-canonical-seat-cluster] *, [data-chip-center], [data-canonical-dealer-pip], [data-canonical-shell-hud-grid], [data-canonical-shell-tabbar], .run21-lab-header')].filter(e=>!e.closest('[data-canonical-shell-viewer-chip-endpoint]')).map(rect).filter(r=>r.width&&r.height);
        const overlaps=(a,b)=>a.left<b.right-.1&&a.right>b.left+.1&&a.top<b.bottom-.1&&a.bottom>b.top+.1;
        // Scrollable column faces are clipped by their owned stack, not felt artifacts.
        const artifacts=[...document.querySelectorAll('[data-run21-artifact],.run21-draw [data-playing-card-root]')];
        const faces=[...document.querySelectorAll('.run21-card [data-playing-card-face]')];
        const backs=[...document.querySelectorAll('[data-canonical-card-back]')];
        const within=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;
        const pane=rect(document.querySelector('[data-hud-row="pane"]'));
        const timer=document.querySelector('[role="progressbar"]');
        const deckNode=document.querySelector('.run21-deck'),drawNode=document.querySelector('.run21-currentCard');
        const deck=deckNode?rect(deckNode):null,draw=drawNode?rect(drawNode):null;
        const helpNode=document.querySelector('[aria-label="Run21 scoring help"]'),helpRect=rect(helpNode);
        const stackFaces=columns.flatMap(c=>[...c.querySelectorAll('[data-playing-card-face]')]);
        const plate=document.querySelector('[data-canonical-felt-plate]');
        const announcement=document.querySelector('[data-canonical-shell-announcement-rail] [data-canonical-announcement-type]');
        const passIndicators=[...document.querySelectorAll('[data-canonical-seat-cluster] [data-run21-pass-available]')];
        const coveredRanks=columns.flatMap(c=>{
          const cards=[...c.querySelectorAll('[data-playing-card-face]')];
          return cards.filter((card,index)=>!within(rect(card.firstElementChild),rect(card))||cards.slice(index+1).some(next=>overlaps(rect(card.firstElementChild),rect(next)))).map(e=>e.getAttribute('data-card-id'));
        });
        return {
          collisions:[game,...artifacts].filter(e=>reserved.some(r=>overlaps(rect(e),r))).map(e=>e.getAttribute('data-run21-artifact')??e.className),
          plate:plate?.getAttribute('data-canonical-felt-rendered-game'),stakes:plate?.getAttribute('data-canonical-felt-rendered-stakes'),coveredRanks,
          cardRatios:[...faces,...backs].map(e=>rect(e).height/rect(e).width),
          backAsset:backs[0]?.querySelector('img')?.getAttribute('src'),backPreference:backs[0]?.getAttribute('data-cb-pref-id'),
          faceCount:faces.length,cardCount:document.querySelectorAll('.run21-card[aria-label]:not([aria-label="Card back"])').length,
          stackOverlap:stackFaces.some((e,i)=>stackFaces.slice(i+1).some(other=>overlaps(rect(e),rect(other)))),
          minimumRank:stackFaces.length?Math.min(...stackFaces.map(e=>Number(e.firstElementChild.style.fontSize.replace('px','')))):null,
          scrollStacks:[...game.querySelectorAll('[data-run21-scroll-stack="true"]')].length,
          glyphClipping:stackFaces.filter(e=>[...e.children].some(s=>!within(rect(s),rect(e)))).map(e=>e.getAttribute('data-card-id')),
          compactActions:[pass,collect].filter(Boolean).every(e=>rect(e).width<180&&rect(e).height<44),
          actionsInPane:[pass,collect].filter(Boolean).every(e=>!!e.closest('[data-hud-row="pane"]')&&within(rect(e),pane)),
          feltActions:!!game.querySelector('.run21-pass-button,.run21-collect-button'),
          timerInRow:!timer||!!timer.closest('[data-hud-row="timer"]'),
          timerRemaining:timer?.getAttribute('data-run21-time-remaining'),
          drawCentered:!deck||!draw||Math.abs((deck.left+deck.right+draw.left+draw.right)/4-(felt.left+felt.width/2))<1,
          drawAtBottom:!deck||!draw||deck.top>=g.bottom&&draw.top>=g.bottom&&Math.abs(felt.bottom-deck.bottom)<=felt.height*.05&&Math.abs(felt.bottom-draw.bottom)<=felt.height*.05,
          drawBottomRatio:deck?(deck.bottom-felt.top)/felt.height:null,
          drawHeightRatio:deck?deck.height/felt.height:null,
          helpBesideDeck:!deck||(helpRect.right<deck.left&&Math.abs(helpRect.top+helpRect.height/2-deck.top-deck.height/2)<1),
          helpInsideEllipse:[[helpRect.left,helpRect.top],[helpRect.right,helpRect.top],[helpRect.left,helpRect.bottom],[helpRect.right,helpRect.bottom]].every(([x,y])=>((x-felt.x-felt.width/2)/(felt.width/2))**2+((y-felt.y-felt.height/2)/(felt.height/2))**2<=1),
          drawInsideEllipse:!deck||!draw||[deck,draw].every(r=>[[r.left,r.top],[r.right,r.top],[r.left,r.bottom],[r.right,r.bottom]].every(([x,y])=>((x-felt.x-felt.width/2)/(felt.width/2))**2+((y-felt.y-felt.height/2)/(felt.height/2))**2<=1)),
          endpointPreserved:!!document.querySelector('[data-canonical-shell-viewer-chip-endpoint] [data-chip-center]'),
          drawClose:!deck||!draw||draw.left-deck.right>0&&draw.left-deck.right<deck.width*.25,
          drawClearOfColumns:!deck||!draw||columns.every(c=>!overlaps(rect(c),deck)&&!overlaps(rect(c),draw)),
          passIndicators:passIndicators.map(e=>({text:e.textContent,width:rect(e).width,label:e.getAttribute('aria-label')})),
          roundOnFelt:!!game.querySelector('[data-run21-artifact="run21.round"]'),
          announcement:announcement?.textContent,announcementType:announcement?.getAttribute('data-canonical-announcement-type'),
          columnRegionHeight:rect(game.querySelector('[data-run21-artifact="run21.board"]')).height/felt.height,
          strip:!!game.querySelector('.run21-multiplier-table,[data-run21-artifact="run21.multipliers"]'),help:!!helpNode,
          felt:felt.toJSON(),gameplay:g.toJSON(),columns:columns.map(e=>rect(e).toJSON()),
          contained:inside(g)&&[...columns,...artifacts].every(e=>inside(rect(e))),
          ellipseContained:[[g.left,g.top],[g.right,g.top],[g.left,g.bottom],[g.right,g.bottom]].every(([x,y])=>((x-felt.x-felt.width/2)/(felt.width/2))**2+((y-felt.y-felt.height/2)/(felt.height/2))**2<=1),
          overflow:[game,...columns].some(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1),
          emptyColumnLabels:columns.filter(e=>!e.querySelector('.run21-card')).map(e=>e.querySelector('.run21-column-stack').textContent.trim()),
          unwanted:!!game.querySelector('[data-run21-artifact="run21.discard"],.run21-discard,.run21-passed'),
          faceId:face?.getAttribute('data-card-id')??null,currentLabel:current?.getAttribute('aria-label')??null,
          currentBack:!!document.querySelector('.run21-currentCard [data-playing-card-hidden]'),
          passDisabled:pass?.disabled,passText:pass?.innerText,collectDisabled:collect?.disabled,collectText:collect?.innerText,
          scores:[...document.querySelectorAll('[data-run21-score-owner], [data-canonical-seat-cluster] [data-canonical-seat-below]')].map(e=>({text:e.textContent,inside:rect(e).left>=0&&rect(e).right<=document.documentElement.clientWidth,area:!!e.closest('[data-canonical-shell-hud-grid],[data-owner-label="Run21Fixture"]')})),
          shells:document.querySelectorAll('[data-canonical-shell-root]').length,felts:document.querySelectorAll('[data-canonical-shell-felt-frame]').length,
          interactionLayers:document.querySelectorAll('[data-canonical-felt-interaction-layer]').length,
          pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.documentElement.scrollHeight>document.documentElement.clientHeight,
        };
      });
      const assert=(condition,message)=>{if(!condition)throw Error(`${size.width} ${viewer} ${scene}: ${message}`);};
      assert(check.contained&&check.ellipseContained,'felt containment');
      assert(!check.overflow&&!check.pageOverflow,'overflow');
      assert(check.emptyColumnLabels.every(s=>s===''),'visible column indexes');
      assert(!check.unwanted&&!check.currentBack,'unexpected card surface');
      assert(check.scores.every(s=>s.inside&&s.area)&&check.scores.length===2,'score ownership');
      assert(check.collisions.length===0,'reserved shell collision');
      assert(check.cardRatios.every(r=>Math.abs(r-1.5)<.02),'canonical card aspect');
      assert(check.coveredRanks.length===0,'readable exposed ranks');
      assert(check.minimumRank===null||check.minimumRank>=11.9,'readable rank font size');
      if(viewer!=='observer'&&(scene==='column-counts'||scene==='maximum-depth'))assert(check.stackOverlap,'column cards overlap');
      assert(check.plate==='RUN 21'&&check.stakes==='$10','canonical Run21 stakes plate');
      assert(check.compactActions,'compact pane buttons');
      assert(check.actionsInPane&&!check.feltActions&&check.timerInRow,'canonical HUD slots');
      assert(check.drawCentered&&check.drawClose&&check.drawAtBottom&&check.drawInsideEllipse&&check.drawClearOfColumns,'close draw cards docked inside the bottom rim');
      if(viewer!=='observer')assert(check.columnRegionHeight>.4,'active columns use restored vertical space');
      assert(!check.roundOnFelt&&check.announcementType==='gameplay_notice'&&(check.announcement.includes('round 1/3')||check.announcement==='Round 1/3 complete'),'round in canonical announcement rail');
      assert(check.passIndicators.every(p=>p.text==='P'&&p.width<16&&p.label==='Pass available'),'compact available-only Pass marker');
      assert(check.scores.every(s=>!s.text.includes('Total')&&!s.text.includes('Round')),'numeric cumulative score only');
      assert(check.faceCount===check.cardCount,'canonical face renderer');
      if(viewer!=='observer')assert(check.backPreference==='hawks'&&check.backAsset?.includes('hawks-logo'),'canonical back asset');
      assert(!check.strip&&check.help,'compact scoring help');
      assert(check.helpBesideDeck&&check.helpInsideEllipse,'help centered left of deck inside felt');
      if(viewer!=='observer')assert(check.drawHeightRatio>=.219,'larger deck and upcard');
      assert(check.shells===1&&check.felts===1&&check.interactionLayers===1,'canonical owner count');
      if(viewer!=='observer'){
        assert(check.endpointPreserved,'canonical chip animation endpoint retained');
        if(viewer==='self'&&scene==='active')assert(check.announcement==='Run21 bot is playing round 1/3','playing actor narration');
        if(scene==='active')assert(check.faceId==='7-♣'&&check.currentLabel==='7 of clubs'&&check.columns.length===5&&!check.passDisabled,'actionable actual face');
        if(scene==='pass-used')assert(check.passDisabled&&check.passText==='Pass used','Pass admission');
        if(scene==='collect-unavailable')assert(check.collectDisabled,'Collect below 97');
        if(scene==='collect-available')assert(!check.collectDisabled,'Collect above 97');
      }else{
        assert(check.passText===undefined&&check.collectText===undefined,'observer has no action buttons');
        if(scene!=='round-reveal')assert(check.faceCount===0,'observer card privacy');
        if(scene==='pass-used')assert(check.passIndicators.length===1,'used Pass marker removed');
      }
      if(scene==='round-reveal')assert(check.columns.length===10,'both revealed boards');
      evidence.push({size,viewer,scene,...check});
    }
    }
  }
  return evidence;
}
