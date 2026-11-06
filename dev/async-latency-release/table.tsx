import {createRoot} from 'react-dom/client';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {CanonicalRun21Fixture} from '../run21/CanonicalRun21Fixture';
import {act,fixtureMatch,PLAYERS} from '@/lib/run21/fixtures';
import {project} from '@/lib/run21/engine';
import {RUN21_GEOMETRY_DEFAULTS} from '@/lib/run21/geometry';
import '@/index.css';
import '../run21/preview.css';
const id=PLAYERS[0].id;
const view=project(act(fixtureMatch(),id,{type:'ready'},0),id);
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider userId={undefined}><CanonicalRun21Fixture
 view={view} now={5000} pane={null} header={null} geometry={RUN21_GEOMETRY_DEFAULTS} onIntent={intent=>document.body.dataset.intent=intent.type}/>
</VisualPreferencesProvider>);
