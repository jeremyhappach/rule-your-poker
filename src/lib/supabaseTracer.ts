/**
 * Global Supabase query instrumentation
 * 
 * This module monkey-patches the Supabase client to automatically trace all
 * database operations when tracing is enabled. No changes needed to existing code.
 */

import { supabase } from "@/integrations/supabase/client";
import { trace, isTracing } from "./performanceTracer";

type PostgrestBuilder = ReturnType<typeof supabase.from>;

interface PendingTrace {
  operation: string;
  table: string;
  startTime: number;
}

// Track pending operations
const pendingTraces = new WeakMap<object, PendingTrace>();

// Store original methods
let isInstrumented = false;

/**
 * Instrument the Supabase client to automatically trace all queries
 */
export function instrumentSupabase(): void {
  if (isInstrumented) return;
  isInstrumented = true;

  const originalFrom = supabase.from.bind(supabase);

  // Override supabase.from() to capture table name and wrap chain methods
  (supabase as any).from = function (table: string) {
    const builder = originalFrom(table);
    
    if (!isTracing()) {
      return builder;
    }

    // Track the table name for this builder
    const builderProto = Object.getPrototypeOf(builder);
    
    // Wrap terminal methods that return promises
    const terminalMethods = ['single', 'maybeSingle', 'csv', 'geojson'];
    const mutationMethods = ['insert', 'update', 'upsert', 'delete'];
    const queryMethods = ['select'];

    // Capture operation type when these are called
    const wrapMethod = (methodName: string) => {
      const original = builder[methodName];
      if (typeof original !== 'function') return;

      (builder as any)[methodName] = function (...args: any[]) {
        const result = original.apply(this, args);
        
        // Store pending trace info on the result builder
        if (result && typeof result === 'object') {
          pendingTraces.set(result, {
            operation: methodName,
            table,
            startTime: performance.now()
          });
          
          // Also wrap the .then() method to capture timing
          const originalThen = result.then?.bind(result);
          if (originalThen) {
            result.then = function (onFulfilled?: any, onRejected?: any) {
              const pending = pendingTraces.get(result);
              const start = pending?.startTime ?? performance.now();
              
              return originalThen(
                (value: any) => {
                  if (pending && isTracing()) {
                    const duration = performance.now() - start;
                    const rowCount = Array.isArray(value?.data) ? value.data.length : value?.data ? 1 : 0;
                    trace(
                      `db:${pending.operation}`,
                      duration,
                      pending.table,
                      { rowCount, hasError: !!value?.error }
                    );
                  }
                  return onFulfilled?.(value) ?? value;
                },
                (error: any) => {
                  if (pending && isTracing()) {
                    const duration = performance.now() - start;
                    trace(
                      `db:${pending.operation}`,
                      duration,
                      pending.table,
                      { error: String(error) }
                    );
                  }
                  if (onRejected) return onRejected(error);
                  throw error;
                }
              );
            };
          }
        }
        
        return result;
      };
    };

    // Wrap all relevant methods
    [...mutationMethods, ...queryMethods, ...terminalMethods].forEach(wrapMethod);
    
    // Wrap eq, in, order, etc. to propagate trace info
    const chainMethods = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'order', 'limit', 'range', 'filter', 'match', 'or', 'and', 'not'];
    chainMethods.forEach(methodName => {
      const original = builder[methodName];
      if (typeof original !== 'function') return;
      
      (builder as any)[methodName] = function (...args: any[]) {
        const result = original.apply(this, args);
        
        // Propagate pending trace to chained result
        const pending = pendingTraces.get(this);
        if (pending && result && typeof result === 'object') {
          pendingTraces.set(result, pending);
        }
        
        return result;
      };
    });

    return builder;
  };

  // Also instrument RPC calls
  const originalRpc = supabase.rpc.bind(supabase);
  (supabase as any).rpc = function (fn: string, params?: any, options?: any) {
    if (!isTracing()) {
      return originalRpc(fn, params, options);
    }

    const start = performance.now();
    const result = originalRpc(fn, params, options);

    const originalThen = result.then?.bind(result);
    if (originalThen) {
      result.then = function (onFulfilled?: any, onRejected?: any) {
        return originalThen(
          (value: any) => {
            trace(`rpc:${fn}`, performance.now() - start, 'rpc', { hasError: !!value?.error });
            return onFulfilled?.(value) ?? value;
          },
          (error: any) => {
            trace(`rpc:${fn}`, performance.now() - start, 'rpc', { error: String(error) });
            if (onRejected) return onRejected(error);
            throw error;
          }
        );
      };
    }

    return result;
  };

  console.log('[Tracer] Supabase client instrumented');
}

/**
 * Initialize instrumentation on module load
 */
instrumentSupabase();
