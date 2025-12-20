import { ChatBubble } from './ChatBubble';

interface ChatBubbleData {
  id: string;
  user_id: string;
  message: string;
  image_url?: string | null;
  username?: string;
  expiresAt: number;
}

interface PlayerChatBubblesProps {
  bubbles: ChatBubbleData[];
  position: number;
  getPositionForUserId: (userId: string) => number | undefined;
  isMobile?: boolean;
}

export const PlayerChatBubbles = ({ 
  bubbles, 
  position, 
  getPositionForUserId,
  isMobile = false
}: PlayerChatBubblesProps) => {
  // Filter bubbles for this player position
  const playerBubbles = bubbles.filter(b => getPositionForUserId(b.user_id) === position);

  if (playerBubbles.length === 0) return null;

  return (
    <div className={`
      absolute z-50 flex flex-col gap-1
      ${isMobile ? 'bottom-full mb-1 left-1/2 -translate-x-1/2' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'}
    `}>
      {playerBubbles.map((bubble) => (
        <ChatBubble
          key={bubble.id}
          username={bubble.username || 'Unknown'}
          message={bubble.message}
          imageUrl={bubble.image_url}
          expiresAt={bubble.expiresAt}
        />
      ))}
    </div>
  );
};
