import { useRef, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ShellAnnouncementRail } from './ShellHudChrome';
import type { ShellTabId } from './ShellTabBar';
import './fullscreenGameShell.css';
import {usePresentationSurfaceReady} from './CinematicPresentation';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';

interface Props {
  className?:string;
  ready?: boolean;
  title: string;
  description: string;
  activeTab: ShellTabId;
  setActiveTab: (tab: ShellTabId) => void;
  panel: ReactNode;
  scores?: ReactNode;
  timer?: ReactNode;
  actions?: ReactNode;
  sessionEnded?: boolean;
  children: ReactNode;
  navigation?: ReactNode;
  endControl?: ReactNode;
  announcement?: ReactNode;
  panelTitle?: string;
  panelDescription?: string;
  sessionLabel?: ReactNode;
  gameplay?: boolean;
}

/** Layout only. PersistentTableShell keeps the existing session/overlay providers. */
export function FullscreenGameShell({className="", ready = true, title, description, activeTab, setActiveTab, panel, scores, timer, actions, sessionEnded, children, navigation, endControl, announcement, panelTitle, sessionLabel = 'Session', panelDescription = 'Game clocks continue while this panel is open.', gameplay = true}: Props) {
  usePresentationSurfaceReady('fullscreen', ready);
  const sessionButton = useRef<HTMLButtonElement>(null);
  const toolbar = <>
    <div className="fullscreen-game-heading"><strong>{title}</strong><span>{description}</span></div>
    {gameplay && ready && !sessionEnded && <GameplaySoundButton />}
    {navigation ?? <nav aria-label="Game information">
      <button ref={sessionButton} onClick={() => setActiveTab('lobby')}>{sessionLabel}</button>
      <button onClick={() => setActiveTab('chat')}>Chat</button>
      <button onClick={() => setActiveTab('history')}>History</button>
    </nav>}
  </>;
  return <section className={`fullscreen-game ${className}`} data-fullscreen-game-shell aria-label={`${title} fullscreen game`}>
    <header className={endControl ? "fullscreen-game-toolbar arcade-toolbar" : "fullscreen-game-toolbar"}>
      {endControl ? <><div className="arcade-toolbar-main">{toolbar}</div>{endControl}</> : toolbar}
    </header>
    {scores && <div className="fullscreen-game-scores">{scores}</div>}
    {announcement ?? <ShellAnnouncementRail />}
    <main className="fullscreen-game-board" data-fullscreen-board-slot>
      {children}
      <div data-canonical-felt-interaction-layer="" className="fullscreen-game-interaction-layer" />
    </main>
    <footer className="fullscreen-game-actions" data-hud-row="pane" data-session-ended={sessionEnded || undefined}>
      {timer}{actions}
    </footer>
    <Sheet open={activeTab !== 'cards'} onOpenChange={open => { if (!open) setActiveTab('cards'); }}>
      <SheetContent className="fullscreen-game-panel" onCloseAutoFocus={event => { if (sessionButton.current) { event.preventDefault(); sessionButton.current.focus(); } }}>
        <SheetTitle>{title} · {panelTitle ?? (activeTab === 'lobby' ? 'Session & rules' : activeTab === 'chat' ? 'Chat' : 'History')}</SheetTitle>
        <SheetDescription>{panelDescription}</SheetDescription>
        <div className="fullscreen-game-panel-body">{panel}</div>
      </SheetContent>
    </Sheet>
  </section>;
}
