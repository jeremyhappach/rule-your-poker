import { useEffect, useState } from 'react';

interface ChatBubbleProps {
  username: string;
  message: string;
  expiresAt: number;
}

export const ChatBubble = ({ username, message, expiresAt }: ChatBubbleProps) => {
  const [opacity, setOpacity] = useState(1);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeUntilExpire = expiresAt - Date.now();
    
    // Start fading 1 second before expiration
    const fadeStartTime = timeUntilExpire - 1000;
    
    if (fadeStartTime > 0) {
      const fadeTimer = setTimeout(() => {
        setOpacity(0);
      }, fadeStartTime);

      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, timeUntilExpire);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else {
      setOpacity(0);
      setTimeout(() => setIsVisible(false), 1000);
    }
  }, [expiresAt]);

  if (!isVisible) return null;

  return (
    <div 
      className="bg-black/80 text-white px-3 py-2 rounded-lg shadow-lg max-w-[200px] animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ 
        opacity, 
        transition: 'opacity 1s ease-out',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div className="text-xs font-semibold text-primary mb-0.5 truncate">
        {username}
      </div>
      <div className="text-sm break-words">
        {message}
      </div>
    </div>
  );
};
