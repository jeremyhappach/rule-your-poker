import type {ReactNode} from 'react';

/** Route-owned actions inside the shared table header presentation. */
export function CanonicalTableHeader({children,title}:{children:ReactNode;title:ReactNode}) {
  return <div className="flex items-center justify-between px-3 py-1 bg-background/90 backdrop-blur-sm border-b border-border">
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">PPL</span>
      {children}
    </div>
    <span className="text-xs text-muted-foreground">{title}</span>
  </div>;
}
