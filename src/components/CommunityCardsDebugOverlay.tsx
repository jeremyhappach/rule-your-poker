import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Nullable<T> = T | null | undefined;

interface CommunityCardsDebugOverlayProps {
  gameId?: string;
  gameType?: Nullable<string>;
  gameStatus?: Nullable<string>;
  roundStatus?: Nullable<string>;
  isPaused?: Nullable<boolean>;

  currentRound?: Nullable<number>;
  awaitingNextRound?: Nullable<boolean>;

  communityCardsLength: number;
  communityCardsRevealed: Nullable<number>;

  approvedCommunityCardsLength: number;
  approvedRoundForDisplay: Nullable<number>;
  showCommunityCards: boolean;
  isDelayingCommunityCards: boolean;
  staggeredCardCount: number;
}

export function CommunityCardsDebugOverlay(props: CommunityCardsDebugOverlayProps) {
  const enabled =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) ||
    (typeof window !== "undefined" && window.localStorage?.getItem("debugCommunity") === "1");

  if (!enabled) return null;

  const shouldExist = props.gameType === "holm-game";

  return (
    <aside className="pointer-events-none absolute bottom-2 left-2 z-50 w-[min(92vw,380px)]">
      <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
        <CardHeader className="py-2">
          <CardTitle className="text-sm font-semibold">Community Cards Debug</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex flex-wrap gap-1">
            <Badge variant={shouldExist ? "default" : "secondary"}>
              {props.gameType ?? "(no gameType)"}
            </Badge>
            <Badge variant={props.isPaused ? "secondary" : "outline"}>
              {props.isPaused ? "paused" : "running"}
            </Badge>
            <Badge variant="outline">status: {props.gameStatus ?? "?"}</Badge>
            <Badge variant="outline">round: {props.currentRound ?? "?"}</Badge>
            <Badge variant="outline">roundStatus: {props.roundStatus ?? "?"}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>awaitingNextRound:</div>
            <div className="text-muted-foreground">{String(!!props.awaitingNextRound)}</div>

            <div>communityCardsLength:</div>
            <div className="text-muted-foreground">{props.communityCardsLength}</div>

            <div>communityCardsRevealed:</div>
            <div className="text-muted-foreground">{props.communityCardsRevealed ?? "null"}</div>

            <div>showCommunityCards:</div>
            <div className="text-muted-foreground">{String(props.showCommunityCards)}</div>

            <div>approvedRoundForDisplay:</div>
            <div className="text-muted-foreground">{props.approvedRoundForDisplay ?? "null"}</div>

            <div>approvedCommunityCardsLength:</div>
            <div className="text-muted-foreground">{props.approvedCommunityCardsLength}</div>

            <div>isDelaying:</div>
            <div className="text-muted-foreground">{String(props.isDelayingCommunityCards)}</div>

            <div>staggeredCardCount:</div>
            <div className="text-muted-foreground">{props.staggeredCardCount}</div>
          </div>

          <div className="text-muted-foreground">
            Tip: set <code className="font-mono">localStorage.debugCommunity=1</code> to keep this on in prod.
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
