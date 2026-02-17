import React, { useState, useEffect } from 'react';
import { soundManager } from '../services/soundService';

interface ReactionProps {
  onReact: (emoji: string) => void;
}

// Expanded Emoji List
const EMOJIS = [
    '👍', '👎', '❤️', '😂', '😮', '😢', '😡', '👏', '🎉', '🔥',
    '💩', '👻', '💀', '👽', '🤖', '🎃', '😺', '🙈', '🚀', '⭐',
    '💯', '💢', '💤', '👋', '🙏', '💪', '👀', '🧠', '💣', '💎',
    '🍀', '🎲', '🎮', '🏆', '🥇', '💔', '😱', '🥳', '😎', '🤔'
];

const Reaction: React.FC<ReactionProps> = ({ onReact }) => {
  const [isOpen, setIsOpen] = useState(false);

  // KEYBOARD SHORTCUT 'E'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleReact = (emoji: string) => {
    onReact(emoji);
    soundManager.play('play');
    setIsOpen(false); // Optional: close on select
  };

  return (
    <div className={`fixed right-4 top-1/2 transform -translate-y-1/2 z-40 max-md:top-[40%]`}>
       {/* Tooltip for Shortcut */}
       <div className={`absolute -left-20 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded border border-white/10 whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'opacity-0' : 'opacity-70 group-hover:opacity-100'}`}>
            Press <b>E</b>
       </div>

       <div className={`
         transition-all duration-300 ease-in-out
         flex flex-col items-center
         glass-panel rounded-3xl py-3 px-2 border border-white/20 shadow-2xl
         ${isOpen ? 'w-64 h-80 opacity-100 scale-100' : 'w-14 h-14 opacity-80 hover:opacity-100 rounded-full scale-95 hover:scale-100'}
       `}>
          
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`text-white transition-colors w-10 h-10 flex items-center justify-center rounded-full ${isOpen ? 'bg-white/10 hover:bg-white/20 mb-2' : ''}`}
          >
            {isOpen ? <i className="fas fa-times"></i> : <i className="fas fa-laugh-beam text-2xl text-yellow-400 drop-shadow-md"></i>}
          </button>

          {isOpen && (
            <div className="flex-1 w-full overflow-y-auto scrollbar-hide p-2">
                <div className="grid grid-cols-4 gap-3">
                    {EMOJIS.map(emoji => (
                        <button 
                        key={emoji}
                        onClick={() => handleReact(emoji)}
                        className="text-2xl hover:scale-125 hover:bg-white/10 rounded-lg p-1 transition-all cursor-pointer select-none"
                        >
                        {emoji}
                        </button>
                    ))}
                </div>
            </div>
          )}
       </div>
    </div>
  );
};

export default Reaction;