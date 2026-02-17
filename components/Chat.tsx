import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, Player } from '../types';

interface ChatProps {
  players: Player[];
  currentPlayerId: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

const Chat: React.FC<ChatProps> = ({ players, currentPlayerId, messages, onSend }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const currentPlayer = players.find(p => p.id === currentPlayerId);

  // Keyboard Shortcut 'M'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Track unread messages if closed
  useEffect(() => {
     if (!isOpen && messages.length > 0) {
        // Simple logic: if new message comes in and we are closed, increment.
        // In a real app we'd track last read ID.
        setUnreadCount(prev => prev + 1);
     }
  }, [messages.length]); 

  // Clear unread on open
  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentPlayer) return;

    onSend(input);
    setInput('');
  };

  return (
    <>
      {/* Floating Toggle Button - Adjusted for mobile position to be Middle-Left */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 border-2 border-white/20
          ${isOpen ? 'bg-red-500 text-white rotate-90' : 'bg-unoBlue text-white rotate-0'}
          /* Mobile: Top 55% (Middle-Left), Desktop: Bottom Left */
          left-4 bottom-28 md:bottom-28
          max-md:bottom-auto max-md:top-[55%] max-md:-translate-y-1/2
        `}
      >
        {isOpen ? <i className="fas fa-times text-lg sm:text-xl"></i> : <i className="fas fa-comment-alt text-lg sm:text-xl"></i>}
        {!isOpen && unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] sm:text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-gray-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
        
        {/* Tooltip for Shortcut - Hidden on mobile */}
        {!isOpen && (
            <div className="absolute left-16 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded border border-white/10 whitespace-nowrap hidden md:block opacity-70">
                Press <b>M</b>
            </div>
        )}
      </button>

      {/* Sliding Panel - Responsive sizing */}
      <div className={`fixed left-4 right-4 sm:right-auto bottom-40 sm:bottom-44 top-20 sm:top-24 sm:w-80 z-40 transition-all duration-500 ease-out origin-bottom-left ${isOpen ? 'scale-100 opacity-100 translate-x-0' : 'scale-75 opacity-0 -translate-x-full pointer-events-none'}`}>
        <div className="h-full w-full glass-panel rounded-3xl flex flex-col shadow-2xl border border-white/10 overflow-hidden">
          
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-blue-600/50 to-purple-600/50 backdrop-blur-md border-b border-white/10 flex justify-between items-center">
             <h3 className="text-white font-bold text-lg font-display tracking-wide flex items-center gap-2">
               <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
               Live Chat
             </h3>
             <span className="text-xs text-blue-200 bg-white/10 px-2 py-1 rounded-lg">Global</span>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide bg-black/20" ref={scrollRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.senderId === currentPlayerId ? 'items-end' : 'items-start'} animate-pop-in`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-md break-words ${
                  msg.senderId === currentPlayerId 
                    ? 'bg-blue-600 text-white rounded-br-sm' 
                    : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                }`}>
                  {msg.senderId !== currentPlayerId && <span className="text-[10px] font-bold text-blue-300 block mb-0.5">{msg.senderName}</span>}
                  {msg.text}
                </div>
                <span className="text-[9px] text-gray-500 mt-1 px-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            ))}
            {messages.length === 0 && (
                <div className="text-center text-gray-500 text-xs italic mt-4">No messages yet. Say hi!</div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 bg-gray-900/80 backdrop-blur-md border-t border-white/5">
            <div className="flex gap-2 relative">
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-full pl-4 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-unoBlue focus:ring-1 focus:ring-unoBlue transition-all placeholder-gray-500"
                placeholder="Type a message..."
              />
              <button type="submit" className="absolute right-1 top-1 bottom-1 w-8 h-8 rounded-full bg-unoBlue text-white flex items-center justify-center hover:bg-blue-400 transition-colors">
                <i className="fas fa-paper-plane text-xs"></i>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default Chat;