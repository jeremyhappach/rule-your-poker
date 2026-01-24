import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TriviaCard } from "./TriviaCard";
import { toast } from "sonner";
import { Brain, Trophy, Clock, Users } from "lucide-react";

interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
}

interface PlayerAnswer {
  playerId: string;
  username: string;
  selectedIndex: number | null;
  answeredAt: number | null;
}

interface TriviaState {
  question: TriviaQuestion | null;
  playerAnswers: Record<string, PlayerAnswer>;
  phase: 'loading' | 'answering' | 'revealed' | 'complete';
  questionStartTime: number | null;
  roundNumber: number;
}

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  sitting_out: boolean;
  status: string;
}

interface TriviaGameTableProps {
  gameId: string;
  roundId: string;
  players: Player[];
  currentPlayerId: string;
  currentUsername: string;
  pot: number;
  anteAmount: number;
  onRoundComplete: (winnerIds: string[], amount: number) => void;
}

export const TriviaGameTable = ({
  gameId,
  roundId,
  players,
  currentPlayerId,
  currentUsername,
  pot,
  anteAmount,
  onRoundComplete,
}: TriviaGameTableProps) => {
  const [triviaState, setTriviaState] = useState<TriviaState>({
    question: null,
    playerAnswers: {},
    phase: 'loading',
    questionStartTime: null,
    roundNumber: 1,
  });
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activePlayers = players.filter(p => !p.sitting_out && p.status === 'active');
  const playerUsernames: Record<string, string> = {};
  
  // Build username lookup (we'd need profiles, but for now use position)
  activePlayers.forEach(p => {
    playerUsernames[p.id] = `Player ${p.position + 1}`;
  });

  // Fetch trivia question
  const fetchQuestion = useCallback(async () => {
    setTriviaState(prev => ({ ...prev, phase: 'loading' }));
    
    try {
      const categories = ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer', 'general sports'];
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-trivia`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ category: randomCategory }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          toast.error("Rate limit reached. Waiting...");
        } else if (response.status === 402) {
          toast.error("AI credits exhausted");
        }
        throw new Error(errorData.error || 'Failed to fetch question');
      }

      const question: TriviaQuestion = await response.json();
      
      // Initialize player answers
      const initialAnswers: Record<string, PlayerAnswer> = {};
      activePlayers.forEach(p => {
        initialAnswers[p.id] = {
          playerId: p.id,
          username: playerUsernames[p.id],
          selectedIndex: null,
          answeredAt: null,
        };
      });

      setTriviaState({
        question,
        playerAnswers: initialAnswers,
        phase: 'answering',
        questionStartTime: Date.now(),
        roundNumber: triviaState.roundNumber,
      });
      setTimeLeft(15);
      setSelectedAnswer(null);

    } catch (error) {
      console.error('Failed to fetch trivia:', error);
      toast.error('Failed to load question');
    }
  }, [activePlayers.length, triviaState.roundNumber]);

  // Initial question fetch
  useEffect(() => {
    if (triviaState.phase === 'loading' && !triviaState.question) {
      fetchQuestion();
    }
  }, []);

  // Timer countdown
  useEffect(() => {
    if (triviaState.phase !== 'answering') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          revealAnswers();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [triviaState.phase]);

  // Check if all players answered
  useEffect(() => {
    if (triviaState.phase !== 'answering') return;
    
    const allAnswered = activePlayers.every(
      p => triviaState.playerAnswers[p.id]?.selectedIndex !== null
    );

    if (allAnswered) {
      revealAnswers();
    }
  }, [triviaState.playerAnswers, triviaState.phase]);

  const handleSelectAnswer = async (index: number) => {
    if (triviaState.phase !== 'answering' || selectedAnswer !== null || isSubmitting) return;
    
    setIsSubmitting(true);
    setSelectedAnswer(index);

    // Update local state immediately
    setTriviaState(prev => ({
      ...prev,
      playerAnswers: {
        ...prev.playerAnswers,
        [currentPlayerId]: {
          ...prev.playerAnswers[currentPlayerId],
          selectedIndex: index,
          answeredAt: Date.now(),
        },
      },
    }));

    // In a real implementation, we'd sync this via Supabase realtime
    // For now, this is local-only (single player or hot-seat style)
    setIsSubmitting(false);
  };

  const revealAnswers = () => {
    if (triviaState.phase === 'revealed' || triviaState.phase === 'complete') return;

    setTriviaState(prev => ({ ...prev, phase: 'revealed' }));

    // Determine winners after a delay
    setTimeout(() => {
      determineWinners();
    }, 3000);
  };

  const determineWinners = () => {
    const correctIndex = triviaState.question?.correctIndex;
    if (correctIndex === undefined) return;

    const winners = Object.entries(triviaState.playerAnswers)
      .filter(([_, answer]) => answer.selectedIndex === correctIndex)
      .sort((a, b) => (a[1].answeredAt || Infinity) - (b[1].answeredAt || Infinity))
      .map(([playerId]) => playerId);

    setTriviaState(prev => ({ ...prev, phase: 'complete' }));

    if (winners.length === 0) {
      toast.info("No one got it right! Pot carries over.");
      onRoundComplete([], 0);
    } else if (winners.length === 1) {
      const winner = activePlayers.find(p => p.id === winners[0]);
      toast.success(`${playerUsernames[winners[0]] || 'Winner'} takes the pot!`);
      onRoundComplete(winners, pot);
    } else {
      const splitAmount = Math.floor(pot / winners.length);
      toast.success(`${winners.length} players split the pot!`);
      onRoundComplete(winners, splitAmount);
    }
  };

  const myAnswer = triviaState.playerAnswers[currentPlayerId];
  const hasAnswered = myAnswer?.selectedIndex !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-poker-felt to-poker-felt-dark p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-poker-gold" />
            <span className="text-xl font-bold text-poker-gold">Sports Trivia</span>
          </div>
          <Badge variant="outline" className="border-poker-gold text-poker-gold">
            Round {triviaState.roundNumber}
          </Badge>
        </div>

        {/* Pot display */}
        <Card className="border-poker-gold bg-gradient-to-r from-amber-900/50 to-amber-800/50">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-poker-gold" />
              <span className="text-amber-200">Pot</span>
            </div>
            <span className="text-2xl font-bold text-poker-gold">${pot}</span>
          </CardContent>
        </Card>

        {/* Timer */}
        {triviaState.phase === 'answering' && (
          <div className="flex justify-center">
            <Badge 
              variant={timeLeft <= 5 ? "destructive" : "default"}
              className={`text-2xl px-6 py-3 ${timeLeft <= 5 ? 'animate-pulse' : ''}`}
            >
              <Clock className="w-5 h-5 mr-2" />
              {timeLeft}s
            </Badge>
          </div>
        )}

        {/* Loading state */}
        {triviaState.phase === 'loading' && (
          <Card className="border-amber-600/50 bg-amber-900/30">
            <CardContent className="py-12 text-center">
              <div className="animate-spin w-12 h-12 border-4 border-poker-gold border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-amber-200">Generating question...</p>
            </CardContent>
          </Card>
        )}

        {/* Question */}
        {triviaState.question && triviaState.phase !== 'loading' && (
          <Card className="border-poker-gold bg-gradient-to-br from-amber-900/40 to-amber-800/40">
            <CardContent className="py-6">
              <Badge className="mb-3 bg-amber-800 text-amber-200">
                {triviaState.question.category}
              </Badge>
              <p className="text-xl font-semibold text-white leading-relaxed">
                {triviaState.question.question}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Answer options */}
        {triviaState.question && triviaState.phase !== 'loading' && (
          <div className="grid gap-3">
            {triviaState.question.options.map((option, index) => (
              <TriviaCard
                key={index}
                text={option}
                index={index}
                isSelected={selectedAnswer === index}
                isCorrect={index === triviaState.question?.correctIndex}
                isRevealed={triviaState.phase === 'revealed' || triviaState.phase === 'complete'}
                isDisabled={hasAnswered || triviaState.phase !== 'answering'}
                onClick={() => handleSelectAnswer(index)}
              />
            ))}
          </div>
        )}

        {/* Answer status */}
        {triviaState.phase === 'answering' && hasAnswered && (
          <div className="text-center">
            <Badge variant="outline" className="border-green-500 text-green-400">
              Answer locked in! Waiting for others...
            </Badge>
          </div>
        )}

        {/* Players status */}
        <Card className="border-amber-600/30 bg-amber-900/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-400">Players</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activePlayers.map(player => {
                const answer = triviaState.playerAnswers[player.id];
                const hasAnsweredPlayer = answer?.selectedIndex !== null;
                const isMe = player.id === currentPlayerId;
                
                return (
                  <Badge
                    key={player.id}
                    variant="outline"
                    className={
                      hasAnsweredPlayer
                        ? "border-green-500 text-green-400"
                        : "border-amber-600/50 text-amber-400"
                    }
                  >
                    {isMe ? currentUsername : playerUsernames[player.id]}
                    {hasAnsweredPlayer && " ✓"}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
