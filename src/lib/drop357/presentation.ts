import type {LaneResult} from './model';
const ranks:Record<number,string>={2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight',9:'Nine',10:'Ten',11:'Jack',12:'Queen',13:'King',15:'Ace'};
const plural=(n:number)=>ranks[n]+(n===6?'es':'s');
/** The authoritative poker vector describes wild substitutions and best-five selection. */
export function dropHandLabel(result:LaneResult){
 const [category,rank,second]=result.vector;
 switch(category){
  case 1:return 'Pair of '+plural(rank);
  case 2:return plural(rank)+' & '+plural(second);
  case 3:return 'Three '+plural(rank);
  case 6:return plural(rank)+' full of '+plural(second);
  case 7:return 'Four '+plural(rank);
  case 10:return 'Five '+plural(rank);
  default:return result.category;
 }
}
