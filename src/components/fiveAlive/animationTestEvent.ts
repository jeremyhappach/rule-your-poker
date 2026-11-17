import {fireEvent} from '@testing-library/react';

/** React detects jsdom's prefixed animation event; retain the animation name. */
export function endAnimation(element:Element,animationName:string){
  const event=new Event('webkitAnimationEnd',{bubbles:true});
  Object.defineProperty(event,'animationName',{value:animationName});
  fireEvent(element,event);
}
