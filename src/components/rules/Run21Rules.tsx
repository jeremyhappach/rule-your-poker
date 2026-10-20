import type {RuleRendererProps} from '@/lib/gameCatalog/types';
import type {Config} from '@/lib/run21/model';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
export default function CatalogRules({config,solo}:RuleRendererProps){return <Run21ScoringReference config={config as Config} solo={solo}/>;}
