import React from 'react';
import { Card as CardType } from '../types';

interface CardProps {
  card?: CardType; // If undefined, it's a back-of-card
  onClick?: () => void;
  className?: string;
  playable?: boolean;
}

const Card: React.FC<CardProps> = ({ card, onClick, className = '', playable = false }) => {
  // Dimensions and transition logic
  // Mobile: w-20 h-32 (80x128px)
  // Small Tablet: w-24 h-36
  // Desktop: w-32 h-48
  // Large: w-40 h-60
  const baseClasses = `
    relative 
    w-20 h-32 sm:w-24 sm:h-36 md:w-32 md:h-48 lg:w-40 lg:h-60
    rounded-xl sm:rounded-2xl shadow-2xl
    transition-all duration-300 ease-out transform origin-bottom
    overflow-hidden select-none
    ${playable ? 'cursor-pointer hover:-translate-y-10 md:hover:-translate-y-16 hover:scale-110 hover:z-50 hover:shadow-[0_0_50px_rgba(255,255,255,0.4)]' : ''}
    ${className}
  `;

  // --- CARD BACK (Hexagonal Tech Mesh) ---
  if (!card) {
    return (
      <div 
        className={`${baseClasses} bg-[#1a1a1a] border-2 border-gray-600 flex items-center justify-center group`}
        onClick={onClick}
      >
        {/* Hexagonal Pattern Background */}
        <div className="absolute inset-0 opacity-20" style={{
             backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='40' viewBox='0 0 24 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40c5.523 0 10-4.477 10-10V10c0-5.523-4.477-10-10-10S-10 4.477-10 10v20c0 5.523 4.477 10 10 10z' fill='%23ffffff' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
        }}></div>
        
        {/* Central Pulse */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-transparent to-black"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl animate-pulse"></div>

        {/* Logo */}
        <div className="relative z-10 w-16 h-16 sm:w-24 sm:h-24 rounded-full border-4 border-gray-700/50 bg-black/40 backdrop-blur-md flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
           <div className="absolute inset-0 rounded-full border border-white/10"></div>
           <span className="font-sans font-black text-xl sm:text-3xl italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-tr from-red-500 via-purple-500 to-blue-500 drop-shadow-lg transform -rotate-12">UNO</span>
        </div>
      </div>
    );
  }

  // --- CARD FRONT (Crystal/Gemstone) ---
  
  // Gemstone Gradients
  const colorStyles = {
    red:    { bg: 'bg-gradient-to-br from-red-500 via-red-600 to-red-900', border: 'border-red-400/50', text: 'text-red-100', glow: 'shadow-[inset_0_0_20px_rgba(255,0,0,0.5)]' },
    blue:   { bg: 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-900', border: 'border-blue-400/50', text: 'text-blue-100', glow: 'shadow-[inset_0_0_20px_rgba(0,0,255,0.5)]' },
    green:  { bg: 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-900', border: 'border-emerald-400/50', text: 'text-emerald-100', glow: 'shadow-[inset_0_0_20px_rgba(0,255,0,0.5)]' },
    yellow: { bg: 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-700', border: 'border-yellow-300/50', text: 'text-yellow-50', glow: 'shadow-[inset_0_0_20px_rgba(255,215,0,0.5)]' },
    black:  { bg: 'bg-gradient-to-br from-gray-700 via-gray-800 to-black', border: 'border-purple-400/50', text: 'text-white', glow: 'shadow-[inset_0_0_30px_rgba(147,51,234,0.5)]' },
  };

  const style = colorStyles[card.color];

  const renderMainSymbol = () => {
    const shadowClass = "drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]";
    if (card.type === 'number') {
      return (
        <span className={`text-6xl sm:text-[6rem] md:text-[8rem] leading-none font-sans font-black tracking-tighter ${style.text} ${shadowClass} mix-blend-overlay`}>
          {card.value}
        </span>
      );
    }
    
    // Scale icons for mobile vs desktop
    const iconSize = "text-4xl sm:text-5xl md:text-7xl";
    switch(card.type) {
      case 'skip': return <i className={`fas fa-ban ${iconSize} ${style.text} ${shadowClass} opacity-90`}></i>;
      case 'reverse': return <i className={`fas fa-sync-alt ${iconSize} ${style.text} ${shadowClass} opacity-90`}></i>;
      case 'draw2': return (
        <div className={`flex flex-col items-center leading-none ${style.text} ${shadowClass}`}>
           <span className="text-4xl sm:text-5xl md:text-7xl font-bold">+2</span>
           <i className="fas fa-layer-group text-xl sm:text-2xl mt-1 opacity-80"></i>
        </div>
      );
      case 'wild': return (
         <i className="fas fa-bahai text-5xl sm:text-6xl md:text-8xl text-transparent bg-clip-text bg-gradient-to-tr from-red-400 via-yellow-200 to-blue-400 animate-[spin_4s_linear_infinite] drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]"></i>
      );
      case 'wild4': 
        return (
           <div className={`flex flex-col items-center justify-center`}>
             <div className="grid grid-cols-2 gap-1 mb-1 sm:mb-2 transform rotate-45">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 shadow-lg"></div>
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 shadow-lg"></div>
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 shadow-lg"></div>
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-yellow-400 shadow-lg"></div>
             </div>
             <span className="text-3xl sm:text-5xl md:text-6xl font-black text-white drop-shadow-md mt-1">+4</span>
           </div>
        );
    }
  };

  const renderCorner = () => {
    if(card.type === 'number') return card.value;
    if(card.type === 'draw2') return '+2';
    if(card.type === 'wild4') return '+4';
    if(card.type === 'wild') return 'W';
    if(card.type === 'skip') return <i className="fas fa-ban text-[10px] sm:text-sm"></i>;
    if(card.type === 'reverse') return <i className="fas fa-sync text-[10px] sm:text-sm"></i>;
  }

  return (
    <div 
      className={`${baseClasses} p-[2px] bg-gradient-to-b from-white/40 to-black/20`} // Outer rim reflection
      onClick={playable ? onClick : undefined}
    >
      <div className={`w-full h-full rounded-lg sm:rounded-xl ${style.bg} ${style.glow} relative flex items-center justify-center overflow-hidden border border-white/10`}>
          
          {/* Shard Texture Overlay */}
          <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm20 20h20v20H20V20zM0 20h20v20H0V20z' fill='%23ffffff' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")`,
              transform: 'rotate(45deg) scale(2)'
          }}></div>

          {/* Gloss Reflection (Top Half) */}
          <div className="absolute top-0 left-0 w-full h-[45%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none rounded-t-lg"></div>
          
          {/* Etched Inner Border */}
          <div className={`absolute inset-1 sm:inset-2 border ${style.border} rounded-md sm:rounded-lg opacity-50 pointer-events-none`}></div>

          {/* Main Symbol */}
          <div className="relative z-10 flex items-center justify-center transform -translate-y-1">
             {renderMainSymbol()}
          </div>

          {/* Corner Indicators */}
          <div className={`absolute top-1.5 left-2 sm:top-3 sm:left-3 ${style.text} text-lg sm:text-xl font-bold font-sans leading-none drop-shadow-md`}>
            {renderCorner()}
          </div>
          <div className={`absolute bottom-1.5 right-2 sm:bottom-3 sm:right-3 ${style.text} text-lg sm:text-xl font-bold font-sans leading-none transform rotate-180 drop-shadow-md`}>
            {renderCorner()}
          </div>
      </div>
    </div>
  );
};

export default Card;