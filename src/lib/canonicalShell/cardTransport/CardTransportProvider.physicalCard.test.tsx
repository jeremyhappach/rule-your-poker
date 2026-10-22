// @vitest-environment jsdom
import React from 'react';
import {act,render,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {CardTransportProvider,useCardTransport} from './CardTransportProvider';
import type {CardTransportIntent} from './types';
afterEach(cleanup);
it('keeps physical identity independent from flights and detects changed Joker manifests',()=>{
  let api:ReturnType<typeof useCardTransport>;
  function Probe(){api=useCardTransport();return null;}
  render(<CardTransportProvider gameType="holm-game"><Probe/></CardTransportProvider>);
  const first:CardTransportIntent={id:'hand1-action1-move1',cardId:'physical-joker-1',face:'visible',
    jokerFace:{kind:'joker'},handContextId:'hand1',from:{kind:'discard'},to:{kind:'hand',playerId:'player1'}};
  act(()=>{expect(api!.dispatch(first)).toBe(true);expect(api!.dispatch({...first,id:'hand1-action2-move1'})).toBe(true);});
  act(()=>{
    const result=api!.reconcileMany([{...first,jokerFace:undefined,visibleFace:{rank:'Q',suit:'spades'}}]);
    expect(result.conflicts).toBe(1);
    expect(api!.reconcileMany([{...first,stackCount:12}]).conflicts).toBe(1);
  });
  expect(api!.getHandIntentLifecycles('hand1')).toHaveLength(2);
});
