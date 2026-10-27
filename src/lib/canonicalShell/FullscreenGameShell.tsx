import { useRef, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ShellAnnouncementRail } from './ShellHudChrome';
import type { ShellTabId } from './ShellTabBar';
import './fullscreenGameShell.css';
import {usePresentationSurfaceReady} from './CinematicPresentation';

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
  announcement?: ReactNode;
  panelTitle?: string;
  panelDescription?: string;
  sessionLabel?: ReactNode;
}

/** Layout only. PersistentTableShell keeps the existing session/overlay providers. */
export function FullscreenGameShell({className="", ready = true, title, description, activeTab, setActiveTab, panel, scores, timer, actions, sessionEnded, children, navigation, announcement, panelTitle, sessionLabel = 'Session', panelDescription = 'Game clocks continue while this panel is open.'}: Props) {
  usePresentationSurfaceReady('fullscreen', ready);
  const sessionButton = useRef<HTMLButtonElement>(null);
  return <section className={`fullscreen-game ${className}`} data-fullscreen-game-shell aria-label={`${title} fullscreen game`}>
    <header className="fullscreen-game-toolbar">
      <div className="fullscreen-game-heading"><strong>{title}</strong><span>{description}</span></div>
      {navigation ?? <nav aria-label="Game information">
        <button ref={sessionButton} onClick={() => setActiveTab('lobby')}>{sessionLabel}</button>
        <button onClick={() => setActiveTab('chat')}>Chat</button>
        <button onClick={() => setActiveTab('history')}>History</button>
      </nav>}
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
