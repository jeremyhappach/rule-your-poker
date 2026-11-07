import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,GripVertical} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ARCADE_GAMES} from '@/lib/gameCatalog';
import {ARCADE_SECTIONS,ARCADE_SECTION_LABELS,completeLayout,moveGame,visibleSections,type ArcadeLayout,type ArcadeSection,type LobbyLayout} from '@/lib/arcade/lobbyLayout';
import {loadLobbyLayout,saveLobbyLayout} from '@/lib/arcade/lobbyLayoutClient';

export function ArcadeOrderingPanel() {
  const [saved,setSaved] = useState<LobbyLayout|null>(null);
  const [draft,setDraft] = useState<ArcadeLayout|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [reloadRequired,setReloadRequired] = useState(false);
  const [dragged,setDragged] = useState<string|null>(null);
  const [dropTarget,setDropTarget] = useState<string|null>(null);
  const generation = useRef(0);
  const focusSection = useRef<string|null>(null);
  const sectionInputs = useRef(new Map<string,HTMLSelectElement>());
  const dirty = !!saved && !!draft && JSON.stringify(completeLayout(saved.layout,ARCADE_GAMES)) !== JSON.stringify(draft);

  async function load() {
    const ticket = ++generation.current;
    setBusy(true);setError('');setMessage('');
    try {
      const value = await loadLobbyLayout();
      if (ticket !== generation.current) return;
      setSaved(value);setDraft(completeLayout(value.layout,ARCADE_GAMES));setReloadRequired(false);
    } catch(e) {
      if (ticket === generation.current) setError((e as Error).message);
    } finally {if (ticket === generation.current) setBusy(false);}
  }
  useEffect(() => {void load();return () => {generation.current++;};}, []);
  useEffect(() => {
    if (focusSection.current) {sectionInputs.current.get(focusSection.current)?.focus();focusSection.current=null;}
  }, [draft]);

  function move(game:string,section:ArcadeSection,beforeId?:string) {
    if (busy || reloadRequired) return;
    setDraft(old => old ? moveGame(old,game,section,beforeId) : old);
    setMessage((ARCADE_GAMES.find(item => item.id === game)?.name ?? game)+' moved. Save to publish.');
  }
  function drop(section:ArcadeSection,beforeId?:string) {
    if (dragged) move(dragged,section,beforeId);
    setDragged(null);setDropTarget(null);
  }
  async function save() {
    if (!saved || !draft || busy || !dirty || reloadRequired) return;
    const ticket = ++generation.current;
    setBusy(true);setError('');setMessage('');
    try {
      const value = await saveLobbyLayout(draft,saved.revision);
      if (ticket !== generation.current) return;
      setSaved(value);setDraft(completeLayout(value.layout,ARCADE_GAMES));setMessage('Arcade order saved.');
    } catch(e) {
      if (ticket === generation.current) {setError((e as Error).message);setReloadRequired(true);}
    } finally {if (ticket === generation.current) setBusy(false);}
  }
  return <section aria-labelledby="arcade-ordering-title" className="space-y-3 rounded-lg border p-3">
    <h3 id="arcade-ordering-title" className="font-semibold">Arcade ordering</h3>
    <p className="text-xs text-muted-foreground">Drag a handle to reorder, or use Move up and Move down. Choose a section to move a game. Save publishes both sections for everyone.</p>
    {!draft&&busy&&<p role="status">Loading Arcade order…</p>}
    {draft&&<fieldset disabled={busy||reloadRequired} className="space-y-4 min-w-0">
      {visibleSections(draft,ARCADE_GAMES).map(section=><div key={section.id}>
        <h4 className="font-medium text-sm mb-2">{section.label}</h4>
        <ol aria-label={section.label} className="space-y-2">
          {section.games.map((game,index)=><li key={game.id} data-arcade-order-game={game.id}
            className={'rounded border p-2 '+(dropTarget===game.id?'border-primary bg-muted':'')}
            onDragOver={event=>{if(dragged&&!busy&&!reloadRequired){event.preventDefault();setDropTarget(game.id);}}}
            onDrop={event=>{event.preventDefault();drop(section.id,game.id);}}>
            <div className="flex items-center gap-2">
              <button type="button" draggable={!busy&&!reloadRequired} aria-label={'Drag '+game.name} title="Drag to reorder"
                className="min-h-11 min-w-11 cursor-grab inline-flex items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-ring"
                onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',game.id);setDragged(game.id);}}
                onDragEnd={()=>{setDragged(null);setDropTarget(null);}}>
                <GripVertical className="h-4 w-4" aria-hidden="true"/>
              </button>
              <span className="text-sm font-medium flex-1">{game.name}</span>
              <Button type="button" size="icon" variant="outline" className="min-h-11 min-w-11" aria-label={'Move '+game.name+' up'} disabled={index===0}
                onClick={()=>move(game.id,section.id,section.games[index-1].id)}><ArrowUp className="h-4 w-4" aria-hidden="true"/></Button>
              <Button type="button" size="icon" variant="outline" className="min-h-11 min-w-11" aria-label={'Move '+game.name+' down'} disabled={index===section.games.length-1}
                onClick={()=>move(game.id,section.id,section.games[index+2]?.id)}><ArrowDown className="h-4 w-4" aria-hidden="true"/></Button>
            </div>
            <label className="flex items-center gap-2 text-xs">Section
              <select aria-label={game.name+' section'} value={section.id} className="min-h-11 min-w-0 flex-1 rounded border bg-background px-2 text-foreground"
                ref={element=>{if(element)sectionInputs.current.set(game.id,element);else sectionInputs.current.delete(game.id);}}
                onChange={event=>{focusSection.current=game.id;move(game.id,event.target.value as ArcadeSection);}}>
                {ARCADE_SECTIONS.map(id=><option key={id} value={id}>{ARCADE_SECTION_LABELS[id]}</option>)}
              </select>
            </label>
          </li>)}
        </ol>
        <div className={'mt-2 rounded border border-dashed p-3 text-xs text-muted-foreground '+(dropTarget===section.id?'bg-muted border-primary':'')}
          onDragOver={event=>{if(dragged&&!busy&&!reloadRequired){event.preventDefault();setDropTarget(section.id);}}}
          onDrop={event=>{event.preventDefault();drop(section.id);}}>
          {section.games.length?'Drop here to move to the end':'No games. Drop a game here.'}
        </div>
      </div>)}
    </fieldset>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <p role="status" aria-live="polite" className="text-sm">{message|| (dirty?'Unsaved changes.':'')}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy||!dirty||reloadRequired} onClick={()=>void save()}>{busy&&draft?'Working…':'Save Arcade order'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={()=>void load()}>Reload published order</Button>
    </div>
  </section>;
}
