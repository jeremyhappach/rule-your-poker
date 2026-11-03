import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {GameBoard} from '@/pages/Arcade';
import {CourseClubhouse} from '@/components/megaCardGolf/CourseClubhouse';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
import {arcadeRequest} from '@/lib/arcade/client';
import '@/index.css';
import '@/components/megaCardGolf/megaCardGolf.css';

const params=new URLSearchParams(location.search),game=params.get('game')??'run21';
const course=INITIAL_COURSES[Number(params.get('course')??0)];
const request=<T,>(body:object)=>arcadeRequest<T>({...body,game:'mega-card-golf'});
const archive={config:{...course,boardId:'archive'},rows:[{runId:'archive',name:'Historical Player With A Long Name',rank:1,score:-123,completedAt:'2024-12-31T23:59:00Z'}]};
createRoot(document.getElementById('root')!).render(<BrowserRouter>{game==='mega-card-golf'
  ? <div className="mega-app" data-screen="board"><CourseClubhouse course={course} archives={[archive]} request={request} busy={false} canStart onStart={()=>{throw Error('No mutations in display fixture');}} onReturn={()=>{}}/></div>
  : <GameBoard game={game as Parameters<typeof GameBoard>[0]['game']} userId="local-fixture"/>
}</BrowserRouter>);
