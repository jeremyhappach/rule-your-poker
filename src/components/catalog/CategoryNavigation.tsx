import {CATEGORIES,CATEGORY_LABELS,type Category} from '@/lib/gameCatalog';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
export function CategoryNavigation({value,onChange}:{value:Category;onChange:(value:Category)=>void}) {
 return <Tabs value={value} onValueChange={value=>onChange(value as Category)}><TabsList className="grid h-auto w-full grid-cols-3">{CATEGORIES.map(category=><TabsTrigger className="min-h-12 whitespace-normal" key={category} value={category}>{CATEGORY_LABELS[category]}</TabsTrigger>)}</TabsList></Tabs>;
}
