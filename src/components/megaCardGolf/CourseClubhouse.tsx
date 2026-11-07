import {formatGolfScore} from '@/lib/megaCardGolf/presentation';
import {AchievementTime} from '@/components/arcade/AchievementTime';
import type {CourseConfig} from '@/lib/megaCardGolf/config';
import {courseArtwork,courseTheme,type MegaRequest,type ScoreRow} from './CourseSelection';
import {MegaLeaderboard} from './MegaLeaderboard';

export function CourseClubhouse({course,archives,request,busy,canStart,completedScore,onStart,onReturn}:{course:CourseConfig;archives:{config:CourseConfig;rows:ScoreRow[]}[];request:MegaRequest;busy:boolean;canStart:boolean;completedScore?:number;onStart:()=>void;onReturn:()=>void}){
 return <main className={'mega-clubhouse '+courseTheme(course.id)} style={course.id==='coastal-links'?undefined:courseArtwork(course.id)}>
  <div className="mega-clubhouse-content"><header className="mega-course-heading"><span className="mega-difficulty">{course.difficulty}</span><h1>{course.name}</h1><p>{course.holes} holes · {course.discardAllowance} {course.discardAllowance===1?'discard':'discards'} per hole · {course.stockAllowance} draws / hole</p></header>
   <div className="mega-course-actions"><button className="mega-secondary" disabled={busy} onClick={onReturn}>Return to Clubhouse</button><button className="mega-start" disabled={busy||!canStart} onClick={onStart}>{canStart?'Tee Off':'Course unavailable'}</button></div>
   <div className="mega-course-board">{completedScore!==undefined&&<p className="mega-completed">Course complete · Final score <strong>{formatGolfScore(completedScore)}</strong></p>}
    <MegaLeaderboard key={course.id+'/'+course.boardId} course={course.id} boardId={course.boardId} request={request}/>
    {archives.map(archive=><details className="mega-archive" key={archive.config.boardId}><summary>Archived board · {archive.config.name} · {archive.config.holes} holes / {archive.config.stockAllowance} draws</summary>{archive.rows.length?<table className="arcade-score-table"><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Achieved</th><th scope="col">Score</th></tr></thead><tbody>{archive.rows.map(row=><tr key={row.runId}><td>{row.rank}</td><td className="leaderboard-player" title={row.name}>{row.name}</td><td className="leaderboard-achieved"><AchievementTime completedAt={row.completedAt}/></td><td>{formatGolfScore(row.score)}</td></tr>)}</tbody></table>:<p>No completed courses.</p>}<p>Scores retain their original course settings.</p></details>)}
   </div>
  </div>
 </main>;
}
