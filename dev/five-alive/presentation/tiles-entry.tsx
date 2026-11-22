import {createRoot} from 'react-dom/client';
import {AsyncLineupEditor} from '@/components/delayed/AsyncLineupEditor';
import '@/index.css';
import '@/lib/delayed/delayed.css';
import '@/components/midnight/midnight.css';
const ids=['ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','five-alive','take-two','crib-lab','chucky-showdown','chess','royal-flash','trip-flip','eleven-up'];
createRoot(document.getElementById('root')!).render(<main className="delayed-page"><div className="midnight-invite"><h1>New Async Match</h1><AsyncLineupEditor lineup={[]} caps={{enabled:true,fake_money_only:false,max_children:14,games:ids.map(id=>({id,stake:1}))}} source={false} realMoney={false} locked={false} collapsed={false} onCollapse={()=>{}} onChange={()=>{}}/></div></main>);
