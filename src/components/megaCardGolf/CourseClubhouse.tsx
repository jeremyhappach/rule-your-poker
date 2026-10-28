import {formatGolfScore} from '@/lib/megaCardGolf/presentation';
import type {CourseConfig} from '@/lib/megaCardGolf/config';
import {courseArtwork,courseTheme,type MegaRequest,type ScoreRow} from './CourseSelection';
import {MegaLeaderboard} from './MegaLeaderboard';

export function CourseClubhouse({course,archives,request,busy,canStart,completedScore,onStart,onReturn}:{course:CourseConfig;archives:{config:CourseConfig;rows:ScoreRow[]}[];request:MegaRequest;busy:boolean;canStart:boolean;completedScore?:number;onStart:()=>void;onReturn:()=>void}){
 return <main className={'mega-clubhouse '+courseTheme(course.id)} style={course.id==='coastal-links'?undefined:courseArtwork(course.id)}>
  <div className="mega-clubhouse-content"><header className="mega-course-heading"><span className="mega-difficulty">{course.difficulty}</span><h1>{course.name}</h1><p>{course.holes} holes · {course.discardAllowance} {course.discardAllowance===1?'discard':'discards'} per hole · {course.stockAllowance} draws / hole</p></header>
   <div className="mega-course-actions"><button className="mega-start" disabled={busy||!canStart} onClick={onStart}>{canStart?'Start Game':'Course unavailable'}</button><button className="mega-secondary" disabled={busy} onClick={onReturn}>Return to Clubhouse</button></div>
   <div className="mega-course-board">{completedScore!==undefined&&<p className="mega-completed">Course complete · Final score <strong>{formatGolfScore(completedScore)}</strong></p>}
    <MegaLeaderboard key={course.id+'/'+course.boardId} course={course.id} boardId={course.boardId} request={request}/>
    {archives.map(archive=><details className="mega-archive" key={archive.config.boardId}><summary>Archived board · {archive.config.name} · {archive.config.holes} holes / {archive.config.stockAllowance} draws</summary>{archive.rows.length?<table><thead><tr><th>Rank</th><th>Player</th><th>Score</th></tr></thead><tbody>{archive.rows.map(row=><tr key={row.runId}><td>{row.rank}</td><td>{row.name}</td><td>{formatGolfScore(row.score)}</td></tr>)}</tbody></table>:<p>No completed courses.</p>}<p>Scores retain their original course settings.</p></details>)}
   </div>
  </div>
 </main>;
}
