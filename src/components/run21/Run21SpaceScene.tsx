import {memo} from 'react';
import './run21Space.css';

// Retain the shared scene entry point: decorative paint never gates play or loads state.
export const Run21SpaceScene=memo(function Run21SpaceScene(){
 return <div className="run21-space-scene" aria-hidden="true"/>;
});
