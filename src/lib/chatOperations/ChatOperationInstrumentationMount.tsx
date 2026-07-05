/**
 * Boot-time instrumentation mount for the chat-operation boundary system.
 * Installs global window listeners, heartbeat manager, and post-auth
 * recovery scan exactly once. Also emits `ROUTER_ROUTE_CHANGE` boundary
 * events on every router path change.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { installChatBoundaryListeners, recordChatBoundaryEvent } from './chatOperationBoundary';
import { installChatOperationHeartbeats } from './chatOperationHeartbeat';
import { installChatOperationRecoveryScan } from './chatOperationRecoveryScan';

let bootInstalled = false;

export function ChatOperationInstrumentationMount(): null {
  const location = useLocation();

  useEffect(() => {
    if (bootInstalled) return;
    bootInstalled = true;
    installChatBoundaryListeners();
    installChatOperationHeartbeats();
    installChatOperationRecoveryScan();
  }, []);

  useEffect(() => {
    recordChatBoundaryEvent('ROUTER_ROUTE_CHANGE', {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });
  }, [location.pathname, location.search, location.hash]);

  return null;
}
