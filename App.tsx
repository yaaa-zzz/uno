import React, { useState, useEffect, useRef } from 'react';
import { ALL_AVATARS, COLORS } from './constants';
import { MockGameServer, RemoteGameController, IGameService } from './services/gameLogic';
import { GameState, Card as CardModel, CardColor, GameMode } from './types';
import Card from './components/Card';
import Chat from './components/Chat';
import Reaction from './components/Reaction';
import { soundManager } from './services/soundService';

// --- MAIN APP ---

// Helper for deterministic random rotation based on card ID
const getCardRotation = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash % 30 - 15; // -15 to 15 degrees
};

// SVG Timer Component
const TimerRing: React.FC<{ progress: number; size?: number; color?: string }> = ({ progress, size = 100, color = "#2ed573" }) => {
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (progress / 100) * circumference;
    return (
      <svg width={size} height={size} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-[-90deg] pointer-events-none z-0">
        <circle stroke="rgba(255, 255, 255, 0.1)" fill="transparent" strokeWidth={strokeWidth} r={radius} cx={size / 2} cy={size / 2} />
        <circle stroke={color} fill="transparent" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" r={radius} cx={size / 2} cy={size / 2} className="transition-all duration-1000 ease-linear" />
      </svg>
    );
};

// Confetti Component for Winner
const Confetti: React.FC = () => {
    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {[...Array(50)].map((_, i) => (
                <div key={i} className="absolute w-2 h-2 rounded-full opacity-0 animate-float"
                    style={{
                        backgroundColor: ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#f1c40f'][Math.floor(Math.random() * 5)],
                        left: `${Math.random() * 100}%`, top: '-10px',
                        animationDuration: `${2 + Math.random() * 3}s`, animationDelay: `${Math.random() * 2}s`
                    }} />
            ))}
        </div>
    )
}

const App: React.FC = () => {
  // --- STATE ---
  const [view, setView] = useState<'ENTRY' | 'LOBBY' | 'GAME' | 'ROUND_END' | 'WINNER'>('ENTRY');
  
  // User Info
  const [myName, setMyName] = useState('');
  const [myAvatarIndex, setMyAvatarIndex] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);

  // Game Settings
  const [playerCount, setPlayerCount] = useState(4);
  const [gameMode, setGameMode] = useState<GameMode>('TOURNAMENT');

  // Game Info (Interface for PolyMorph)
  const [gameServer, setGameServer] = useState<IGameService | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  // UI State
  const [joinCode, setJoinCode] = useState('');
  const [wildPickerOpen, setWildPickerOpen] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null); 
  const [floatingEmojis, setFloatingEmojis] = useState<{id: number, text: string, x: number, y: number, tx: number, r: number}[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  
  // Window Size for Responsive Layout
  const [dimensions, setDimensions] = useState({ width: typeof window !== 'undefined' ? window.innerWidth : 1024, height: typeof window !== 'undefined' ? window.innerHeight : 768 });

  // Animation State
  const [isDealing, setIsDealing] = useState(false);
  const lastReactionTimeRef = useRef<number>(0);

  // Settings & Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const prevGameStateRef = useRef<GameState | null>(null);
  const myAvatar = ALL_AVATARS[myAvatarIndex];

  // --- EFFECT: WINDOW RESIZE ---
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- EFFECT: SOUND ---
  useEffect(() => { soundManager.setVolume(volume); }, [volume]);

  // --- EFFECT: AUTO-RECONNECT ---
  useEffect(() => {
    // Check if we have a session stored
    const savedSession = sessionStorage.getItem('uno_session');
    if (savedSession) {
        try {
            const { roomId, playerId, name, avatar } = JSON.parse(savedSession);
            if (roomId && playerId) {
                console.log("Attempting reconnect...", roomId, playerId);
                setMyName(name);
                setIsJoinLoading(true);
                
                const remoteClient = new RemoteGameController(roomId);
                
                // Try to rejoin with existing ID
                remoteClient.joinGame(name, avatar, playerId)
                    .then((id) => {
                         setGameServer(remoteClient);
                         setMyId(id);
                         remoteClient.subscribe((state) => {
                             setGameState(state);
                             if (state.status !== 'LOBBY') {
                                 setView('GAME');
                             } else {
                                 setView('LOBBY');
                             }
                         });
                         showNotification("Reconnected to game!");
                    })
                    .catch((err) => {
                        console.error("Reconnect failed", err);
                        sessionStorage.removeItem('uno_session');
                    })
                    .finally(() => setIsJoinLoading(false));
            }
        } catch (e) {
            console.error("Session parse error", e);
        }
    }
  }, []);

  // --- EFFECT: KEYBOARD SHORTCUTS ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'Space') {
              if (gameState && myId && view === 'GAME') {
                   const me = gameState.players.find(p => p.id === myId);
                   if (me && !me.isEliminated && me.hand.length <= 2 && !me.hasCalledUno) {
                       e.preventDefault(); callUno();
                   }
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, myId, view]);

  // --- EFFECT: GAME LOOP & NOTIFICATIONS & REACTIONS ---
  useEffect(() => {
    if (!gameState) return;
    const prev = prevGameStateRef.current;
    
    // Dealing Animation
    if (prev?.status !== 'PLAYING' && gameState.status === 'PLAYING') {
        const players = gameState.players.length;
        const totalDealDuration = 1200 + (players * 7 * 50) + 800;
        setIsDealing(true);
        soundManager.play('shuffle');
        setTimeout(() => setIsDealing(false), totalDealDuration);
    }
    
    // Turn Change Sound
    if (gameState.players[gameState.currentPlayerIndex]?.id === myId && gameState.status === 'PLAYING') {
      if (prev?.currentPlayerIndex !== gameState.currentPlayerIndex && !isDealing) soundManager.play('turn');
    }
    
    // View Transitions
    if (gameState.status === 'GAME_OVER') setView('WINNER');
    else if (gameState.status === 'ROUND_OVER') setView('ROUND_END');
    else if (gameState.status === 'PLAYING') setView('GAME');

    // Notifications
    if (myId) {
        const me = gameState.players.find(p => p.id === myId);
        const prevMe = prev?.players.find(p => p.id === myId);
        if (me?.isEliminated && prevMe && !prevMe.isEliminated) showNotification("❌ You are eliminated!");
    }
    if (prev?.status === 'PLAYING' && gameState.status === 'ROUND_OVER' && myId) {
        const me = gameState.players.find(p => p.id === myId);
        if (me && me.hand.length === 0) { showNotification("🎉 You are selected!"); soundManager.play('win'); }
    }
    if (prev?.status !== 'GAME_OVER' && gameState.status === 'GAME_OVER' && myId) {
        if (gameState.winner?.id === myId) { showNotification("🏆 You are the Winner!"); soundManager.play('win'); }
    }

    // Remote Reactions Sync
    if (gameState.lastReaction) {
        const { playerId, emoji, timestamp } = gameState.lastReaction;
        if (timestamp > lastReactionTimeRef.current) {
            lastReactionTimeRef.current = timestamp;
            if (playerId !== myId) {
                // Determine start position based on player index
                // We don't have exact screen coords of players easily available in this effect scope without calc
                // So we'll use a random position near the center/top area to simulate it coming from "the board"
                const id = Date.now();
                const randomX = 20 + Math.random() * 60; // 20% to 80% width
                const randomY = 10 + Math.random() * 30; // 10% to 40% height (top half)
                const tx = (Math.random() * 100 - 50) + 'px';
                const r = (Math.random() * 60 - 30) + 'deg';
                setFloatingEmojis(prev => [...prev, { id, text: emoji, x: randomX, y: randomY, tx: parseFloat(tx), r: parseFloat(r) }]);
                setTimeout(() => { setFloatingEmojis(prev => prev.filter(e => e.id !== id)); }, 3000);
            }
        }
    }

    prevGameStateRef.current = gameState;
  }, [gameState, myId, isDealing]);

  // --- HELPERS ---
  const showNotification = (msg: string) => {
    setNotification(msg);
    soundManager.play('notification');
    setTimeout(() => setNotification(null), 4000);
  };
  const nextAvatar = () => { setMyAvatarIndex((prev) => (prev + 1) % ALL_AVATARS.length); };
  const prevAvatar = () => { setMyAvatarIndex((prev) => (prev - 1 + ALL_AVATARS.length) % ALL_AVATARS.length); };

  // --- ACTIONS ---
  const saveSession = (roomId: string, playerId: string) => {
      sessionStorage.setItem('uno_session', JSON.stringify({
          roomId, playerId, name: myName, avatar: myAvatar
      }));
  };

  const createGame = () => {
    if (!myName) return alert("Please enter your name");
    const server = new MockGameServer(myName, myAvatar, playerCount, gameMode);
    setGameServer(server);
    setMyId('host-id'); 
    
    // Save session (Host ID)
    saveSession(server.roomId, 'host-id');

    server.subscribe((state) => { setGameState(state); });
    setView('LOBBY');
  };

  const joinGame = async () => {
    if (!myName) { showNotification("Please enter your name"); return; }
    if (!joinCode || joinCode.length !== 6) { showNotification("Enter valid 6-digit Code"); return; }
    
    // If a game exists locally, check it, otherwise try remote join
    if (gameServer && gameServer instanceof MockGameServer && gameServer.roomId === joinCode) {
         showNotification("You are already in this game (Host).");
         return;
    }
    
    setIsJoinLoading(true);
    try {
        const remoteClient = new RemoteGameController(joinCode);
        const newId = await remoteClient.joinGame(myName, myAvatar);
        
        setGameServer(remoteClient);
        setMyId(newId);
        
        saveSession(joinCode, newId);

        remoteClient.subscribe((state) => { setGameState(state); });
        
        // If joining late, go straight to game
        if (remoteClient['lastState']?.status === 'PLAYING') {
            setView('GAME');
        } else {
            setView('LOBBY');
        }

    } catch (error) {
        showNotification(typeof error === 'string' ? error : "Could not join room");
        console.error(error);
    } finally {
        setIsJoinLoading(false);
    }
  };

  const addBot = () => { gameServer?.addBot(); };
  const startGame = () => { gameServer?.startGame(); };
  
  const leaveGame = () => {
      if (gameServer && myId) {
          gameServer.leaveGame(myId); // Notify server to remove/eliminate
      }
      
      // Clear persistence
      sessionStorage.removeItem('uno_session');

      // Cleanup local state
      gameServer?.cleanup();
      setGameServer(null);
      setGameState(null);
      setMyId(null);
      setShowExitConfirm(false);
      setShowSettings(false);
      setNotification(null);
      setView('ENTRY');
  };

  const handleCardClick = (card: CardModel) => {
    if (!gameState || !myId || gameState.currentPlayerIndex !== gameState.players.findIndex(p => p.id === myId)) return;
    if (card.color === 'black') {
      setPendingCardId(card.id); setWildPickerOpen(true);
    } else {
      gameServer?.playCard(myId, card.id); soundManager.play('play');
    }
  };
  const handleWildColorSelect = (color: CardColor) => {
    if (pendingCardId && myId) {
      gameServer?.playCard(myId, pendingCardId, color); soundManager.play('play');
      setWildPickerOpen(false); setPendingCardId(null);
    }
  };
  
  const drawCard = () => { 
      if (!myId || !gameState) return; 
      
      const myIndex = gameState.players.findIndex(p => p.id === myId);
      if (gameState.currentPlayerIndex !== myIndex) {
          showNotification("It's not your turn!");
          return;
      }
      
      gameServer?.drawCard(myId); 
      soundManager.play('deal'); 
  };
  
  const callUno = () => { if (!myId) return; gameServer?.callUno(myId); soundManager.play('uno'); showNotification(`${myName} shouted UNO!`); };
  
  const handleReaction = (emoji: string) => {
     // Local immediate feedback
     const id = Date.now();
     const randomX = 50 + (Math.random() * 40 - 20); 
     const randomY = 50 + (Math.random() * 20 - 10);
     const tx = (Math.random() * 200 - 100) + 'px';
     const r = (Math.random() * 90 - 45) + 'deg';
     setFloatingEmojis(prev => [...prev, { id, text: emoji, x: randomX, y: randomY, tx: parseFloat(tx), r: parseFloat(r) }]);
     setTimeout(() => { setFloatingEmojis(prev => prev.filter(e => e.id !== id)); }, 3000);
     
     if (myId && gameServer) { 
         gameServer.sendReaction(myId, emoji); 
         // showNotification(`${myName} reacted ${emoji}`); // Redundant if we have floating
     }
  };
  
  const handleSendMessage = (text: string) => {
      if (myId && gameServer) {
          gameServer.sendChat(myId, text);
      }
  };

  const handleNextRound = () => { gameServer?.nextRound(); }

  // --- POSITIONING ---
  const getPlayerPosition = (index: number, total: number, myIndex: number) => {
    const relativeIndex = (index - myIndex + total) % total;
    const angleStep = 360 / total;
    const angleRad = ((relativeIndex * angleStep) + 90) * Math.PI / 180;
    
    // Responsive Radii Calculation
    const isPortrait = dimensions.height > dimensions.width;
    // Tweak radii: 
    // Portrait: Push opponents higher to clear bottom area for hand/buttons.
    // ry reduced to 30 keeps them away from bottom edge.
    const rx = isPortrait ? 40 : 45; 
    const ry = isPortrait ? 25 : 36; 
    
    // Adjust Center Y: 
    // In Portrait, shift center UP (30%) so opponents cluster at top
    const cy = isPortrait ? 30 : 40;

    return { x: 50 + rx * Math.cos(angleRad), y: cy + ry * Math.sin(angleRad) };
  };

  // --- RENDER ---
  const DealingOverlay: React.FC = () => {
    if (!gameState || !myId) return null;
    const myIndex = gameState.players.findIndex(p => p.id === myId);
    const playerCount = gameState.players.length;
    const [phase, setPhase] = useState<'SHUFFLE' | 'DEAL'>('SHUFFLE');
    useEffect(() => {
        const timer = setTimeout(() => { setPhase('DEAL'); 
            let count = 0; const maxCards = 7 * playerCount; 
            const interval = setInterval(() => { if(count >= maxCards) clearInterval(interval); else soundManager.play('deal'); count++; }, 50); 
        }, 1200); return () => clearTimeout(timer);
    }, [playerCount]);
    return (
        <div className="absolute inset-0 z-[80] pointer-events-none perspective-1000">
            {phase === 'SHUFFLE' && (
                <div className="absolute top-[42%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-32 sm:w-24 sm:h-36 md:w-32 md:h-48 origin-center">
                     <div className="absolute inset-0 bg-gray-800 rounded-xl border border-gray-600 shadow-2xl animate-[shuffleLeft_1.2s_ease-in-out_infinite]"><Card /></div>
                     <div className="absolute inset-0 bg-gray-800 rounded-xl border border-gray-600 shadow-2xl animate-[shuffleRight_1.2s_ease-in-out_infinite]"><Card /></div>
                     <style>{`@keyframes shuffleLeft { 0%,100% {transform:translateX(0) rotate(0);z-index:10} 25% {transform:translateX(-40px) rotate(-15deg)} 50% {transform:translateX(0) rotate(0);z-index:0} } @keyframes shuffleRight { 0%,100% {transform:translateX(0) rotate(0);z-index:0} 25% {transform:translateX(40px) rotate(15deg)} 50% {transform:translateX(0) rotate(0);z-index:10} }`}</style>
                </div>
            )}
            {phase === 'DEAL' && (
                <>
                    <div className="absolute top-[42%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 origin-center"><Card className="shadow-2xl" /></div>
                    {Array.from({ length: 7 }).map((_, round) => gameState.players.map((p, i) => {
                             const pos = getPlayerPosition(i, gameState.players.length, myIndex);
                             return ( <div key={`${p.id}-r${round}`} className="absolute w-20 h-32 sm:w-24 sm:h-36 md:w-32 md:h-48 transition-all ease-out"
                                    style={{ top: '42%', left: '50%', transform: 'translate(-50%, -50%) scale(0)', opacity: 0, animation: `dealFly 0.6s cubic-bezier(0, 0.9, 0.1, 1) forwards ${(round * playerCount + i) * 0.05}s` }} >
                                    <style>{`@keyframes dealFly { 0% {top:42%;left:50%;transform:translate(-50%,-50%) scale(0.2) rotate(0deg);opacity:1} 100% {top:${pos.y}%;left:${pos.x}%;transform:translate(-50%,-50%) scale(0.4) rotate(${360 + (i*60)}deg);opacity:0} }`}</style> <Card /> </div> );
                        }))}
                </>
            )}
        </div>
    );
  };

  // --- VIEWS ---
  if (view === 'ENTRY') {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-start pt-12 p-4 relative font-sans overflow-y-auto bg-[#0f0c29] scrollbar-hide">
        {/* Loading Overlay for Reconnect/Join */}
        {isJoinLoading && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center text-white">
                <i className="fas fa-spinner fa-spin text-5xl mb-4 text-unoCyan"></i>
                <p className="tracking-widest animate-pulse mb-6">CONNECTING...</p>
                <button onClick={() => { setIsJoinLoading(false); sessionStorage.removeItem('uno_session'); }} className="px-6 py-2 rounded-full border border-white/20 hover:bg-white/10 text-sm transition-colors">Cancel</button>
            </div>
        )}
        <div className="flex flex-col md:flex-row w-full max-w-6xl gap-6 md:gap-12 items-center justify-center z-10 mt-8 md:mt-0 mb-8">
            <div className="flex-1 text-center md:text-left">
                <h1 className="text-6xl sm:text-8xl md:text-9xl font-black text-white mb-2 drop-shadow-2xl tracking-tighter">UNO</h1>
                <p className="text-base md:text-2xl text-gray-400 font-light mb-6 md:mb-8">The classic game, <span className="text-unoCyan font-bold">reimagined</span>.</p>
                <div className="flex gap-4 justify-center md:justify-start">
                   {['Red','Yellow','Green','Blue'].map(c => <div key={c} className={`w-3 h-3 rounded-full bg-uno${c} shadow-[0_0_10px_currentColor] opacity-80`}></div>)}
                </div>
            </div>
            <div className="flex-1 w-full max-w-md">
                <div className="glass-panel p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden">
                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="flex flex-col items-center mb-6">
                        <label className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Choose Avatar</label>
                        <div className="flex items-center gap-6">
                            <button onClick={prevAvatar} className="text-gray-500 hover:text-white transition"><i className="fas fa-chevron-left text-xl"></i></button>
                            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-tr from-unoCyan to-blue-600 shadow-neon-cyan">
                                <img src={myAvatar} alt="avatar" className="w-full h-full rounded-full bg-gray-900 border-4 border-gray-900" />
                            </div>
                            <button onClick={nextAvatar} className="text-gray-500 hover:text-white transition"><i className="fas fa-chevron-right text-xl"></i></button>
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2 block">Player Name</label>
                        <input type="text" value={myName} onChange={e => setMyName(e.target.value)} className="w-full bg-gray-900/50 border border-gray-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-unoCyan transition-colors" placeholder="Enter your nickname..." />
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4">
                        <div className="flex justify-between items-center mb-3"><span className="text-white font-bold">Create Room</span></div>
                        <div className="flex bg-black/40 rounded-lg p-1 mb-4 border border-white/10">
                            {['QUICK','TOURNAMENT'].map(m => (
                                <button key={m} onClick={() => setGameMode(m as GameMode)} className={`flex-1 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${gameMode === m ? (m === 'QUICK' ? 'bg-unoCyan text-black' : 'bg-unoRed text-white') : 'text-gray-400 hover:text-white'}`}>{m === 'QUICK' ? 'Quick Match' : 'Tournament'}</button>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mb-3">
                           <span className="text-gray-400 text-xs uppercase tracking-widest">Max Players</span>
                           <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))} className="bg-black/40 text-white text-sm px-2 py-1 rounded border border-white/10 outline-none cursor-pointer hover:border-white/30">
                             {Array.from({length: 14}, (_, i) => i + 2).map(num => <option key={num} value={num}>{num} Players</option>)}
                           </select>
                        </div>
                        <button onClick={createGame} className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3 rounded-lg shadow-lg transform transition active:scale-[0.98]">Start New Game</button>
                    </div>
                    <div className="flex gap-2">
                        <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} className="flex-1 bg-gray-900/50 border border-gray-700 text-white px-4 py-3 rounded-lg text-sm tracking-widest text-center uppercase placeholder-gray-600" placeholder="ENTER CODE" />
                        <button onClick={joinGame} disabled={isJoinLoading} className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 sm:px-6 rounded-lg transition-colors flex items-center gap-2 text-sm sm:text-base">
                            {isJoinLoading && <i className="fas fa-spinner fa-spin"></i>} JOIN
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div className="absolute bottom-4 text-gray-500 text-[10px] md:text-xs tracking-[0.2em] uppercase opacity-50 w-full text-center">v2.3 • Cross-Device • Responsive</div>
      </div>
    );
  }

  // --- LOBBY & GAME SCENES use gameState ---
  
  if (view === 'LOBBY' && gameState) {
     const isHost = myId === 'host-id' || (gameServer instanceof MockGameServer);
     return (
       <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6 relative font-sans">
         <div className="glass-panel rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 max-w-6xl w-full border border-white/10 shadow-2xl relative">
            <button onClick={() => setShowExitConfirm(true)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-white/30 hover:text-red-400 transition"><i className="fas fa-sign-out-alt text-2xl"></i></button>
            <div className="text-center mb-8 sm:mb-10 mt-4 sm:mt-0">
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-2">Game Lobby</h2>
              <div className="flex gap-4 justify-center flex-wrap">
                  <div className="inline-flex items-center gap-3 px-4 sm:px-6 py-2 bg-white/5 rounded-full border border-white/10">
                     <span className="text-gray-400 uppercase text-xs tracking-wider">Room Code</span>
                     <span className="font-mono text-unoCyan text-lg sm:text-xl tracking-widest">{gameState.roomId}</span>
                  </div>
                  <div className={`inline-flex items-center gap-2 px-6 py-2 rounded-full border border-white/10 ${gameState.mode === 'TOURNAMENT' ? 'bg-unoRed/20 text-unoRed' : 'bg-unoCyan/20 text-unoCyan'}`}>
                     <i className={`fas ${gameState.mode === 'TOURNAMENT' ? 'fa-trophy' : 'fa-bolt'}`}></i>
                     <span className="text-sm font-bold uppercase tracking-wider">{gameState.mode === 'TOURNAMENT' ? 'Tournament' : 'Quick'}</span>
                  </div>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6 mb-12 max-h-[50vh] overflow-y-auto scrollbar-hide p-2">
              {gameState.players.map(player => (
                <div key={player.id} className="flex flex-col items-center animate-deal group">
                  <div className="relative">
                    <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full p-[2px] bg-gradient-to-tr from-unoCyan to-blue-600 shadow-lg">
                      <img src={player.avatar} alt={player.name} className="w-full h-full rounded-full bg-gray-900 border-2 border-gray-900" />
                    </div>
                    {player.isHost && <div className="absolute -top-1 -right-1 bg-unoYellow text-black w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full shadow-lg text-xs"><i className="fas fa-crown"></i></div>}
                    {player.isBot && <div className="absolute -bottom-1 -right-1 bg-gray-700 text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border border-gray-800 text-xs"><i className="fas fa-robot"></i></div>}
                    {player.isSpectator && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-2 py-0.5 rounded-full text-[9px] uppercase font-bold border border-white/20 whitespace-nowrap z-20 shadow-lg">Spectator</div>}
                  </div>
                  <span className="text-white mt-2 text-xs sm:text-sm font-medium tracking-wide group-hover:text-unoCyan transition-colors text-center w-full truncate px-1">{player.name}</span>
                </div>
              ))}
              {isHost && gameState.players.length < playerCount && (
                 <button onClick={addBot} className="flex flex-col items-center justify-center h-20 sm:h-28 border-2 border-dashed border-white/10 rounded-2xl hover:bg-white/5 transition-colors group">
                   <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/5 flex items-center justify-center mb-2 group-hover:bg-white/10"><i className="fas fa-plus text-white/30 text-xl group-hover:text-white/80"></i></div>
                   <span className="text-white/30 text-xs group-hover:text-white/80">Add Bot</span>
                 </button>
              )}
            </div>
            <div className="flex justify-center border-t border-white/5 pt-8">
              {isHost ? (
                <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                    <button onClick={startGame} disabled={gameState.players.length < 2} className={`w-full sm:w-auto py-4 px-16 rounded-xl font-bold text-xl text-white shadow-neon-cyan transition-all ${gameState.players.length < 2 ? 'bg-gray-800 cursor-not-allowed opacity-50 shadow-none' : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:scale-105 active:scale-95'}`}>START GAME</button>
                    <span className="text-gray-500 text-xs">{gameState.players.length} / {playerCount} Players Ready</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-white/50 bg-black/20 px-6 py-3 rounded-full animate-pulse border border-white/5 text-sm sm:text-base">
                  <div className="w-2 h-2 bg-unoCyan rounded-full"></div> Waiting for host to start...
                </div>
              )}
            </div>
         </div>
         {showExitConfirm && <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center"><div className="glass-panel p-8 rounded-3xl text-center max-w-sm w-full mx-4 border border-white/20"><h3 className="text-2xl font-bold text-white mb-4">Leave Game?</h3><div className="flex gap-4 justify-center"><button onClick={() => setShowExitConfirm(false)} className="px-6 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600">Cancel</button><button onClick={leaveGame} className="px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-lg">Leave</button></div></div></div>}
       </div>
     );
  }

  // GAME RENDER
  const me = gameState?.players.find(p => p.id === myId);
  const myIndex = gameState?.players.findIndex(p => p.id === myId) || 0;
  const isSpectating = me?.isSpectator;
  const isPortrait = dimensions.height > dimensions.width;

  return (
    <div className="h-[100dvh] w-full relative overflow-hidden font-sans bg-[#0f0c29]">
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-gray-900 to-[#0f0c29]"></div>
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-50 pointer-events-none">
          <button onClick={() => setShowExitConfirm(true)} className="pointer-events-auto w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-all"><i className="fas fa-sign-out-alt"></i></button>
          <div className="flex flex-col items-end gap-3">
              <button onClick={() => setShowSettings(!showSettings)} className="pointer-events-auto w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><i className="fas fa-cog"></i></button>
              {gameState && (
                <div className="pointer-events-auto bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 transition-all origin-right max-w-[150px] sm:max-w-[200px] truncate">
                   {gameState.players[gameState.currentPlayerIndex]?.id === myId ? (
                     <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-unoGreen rounded-full animate-pulse"></span><span className="text-unoGreen font-bold tracking-wide uppercase text-[10px] sm:text-xs">Your Turn</span></div>
                   ) : (
                     <div className="flex items-center gap-2"><img src={gameState.players[gameState.currentPlayerIndex]?.avatar} className="w-5 h-5 rounded-full border border-white/20"/><span className="text-gray-300 text-[10px] sm:text-xs truncate">Playing: <span className="text-white font-bold">{gameState.players[gameState.currentPlayerIndex]?.name}</span></span></div>
                   )}
                </div>
              )}
              {notification && <div className="pointer-events-auto bg-black/80 backdrop-blur-xl text-white px-4 py-2 rounded-xl shadow-neon-cyan border border-white/20 animate-bounce flex items-center gap-2 max-w-[200px] sm:max-w-[250px]"><i className="fas fa-bell text-unoCyan text-xs"></i><span className="text-xs font-bold tracking-wide">{notification}</span></div>}
              {/* Spectator Badge */}
              {isSpectating && (
                <div className="pointer-events-auto bg-purple-600/80 backdrop-blur-xl text-white px-4 py-2 rounded-xl shadow-lg border border-white/20 flex items-center gap-2">
                    <i className="fas fa-eye text-xs"></i><span className="text-xs font-bold tracking-wide">SPECTATING</span>
                </div>
              )}
          </div>
      </div>
      {isDealing && <DealingOverlay />}
      {showExitConfirm && <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center"><div className="glass-panel p-8 rounded-3xl text-center max-w-sm w-full mx-4 animate-deal border border-white/20"><h3 className="text-2xl font-bold text-white mb-2">Exit Match?</h3><p className="text-gray-400 mb-6 text-sm">Any progress will be lost.</p><div className="flex gap-3 justify-center"><button onClick={() => setShowExitConfirm(false)} className="flex-1 py-3 rounded-lg bg-white/5 text-white hover:bg-white/10 transition">Cancel</button><button onClick={leaveGame} className="flex-1 py-3 rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-lg transition">Exit</button></div></div></div>}
      {showSettings && <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center"><div className="glass-panel border border-white/20 p-8 rounded-3xl shadow-2xl w-full max-w-sm relative animate-deal"><button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><i className="fas fa-times text-xl"></i></button><h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3"><i className="fas fa-sliders-h text-unoCyan"></i> Settings</h2><div className="space-y-8"><div><div className="flex justify-between text-gray-300 mb-4 font-semibold text-sm uppercase tracking-wide"><span>Master Volume</span><span>{Math.round(volume * 100)}%</span></div><input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full accent-unoCyan" /></div><div className="pt-6 border-t border-white/10 text-center"><button onClick={leaveGame} className="text-red-400 hover:text-red-300 text-sm font-bold uppercase tracking-wide hover:underline">Quit Game</button></div></div></div></div>}
      {floatingEmojis.map(e => <div key={e.id} className="fixed text-6xl pointer-events-none z-50 animate-float-wobble drop-shadow-lg" style={{ left: `${e.x}%`, top: `${e.y}%`, '--tx': `${e.tx}px`, '--r': `${e.r}deg` } as React.CSSProperties}>{e.text}</div>)}
      {gameState && (
        <>
          {gameState.players.map((player, idx) => {
            if (player.id === myId) return null; 
            const pos = getPlayerPosition(idx, gameState.players.length, myIndex);
            const isTurn = idx === gameState.currentPlayerIndex;
            const timerPercentage = (gameState.turnTimer / 30) * 100;
            // Scale logic: smaller on mobile, smaller with more players
            const baseScale = isPortrait ? 0.7 : 0.85; 
            const scaleFactor = Math.max(0.5, baseScale - (gameState.players.length - 4) * 0.04);
            const cardLimit = 10;
            const extraCards = player.hand.length - cardLimit;
            return (
              <div key={player.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%, -50%) scale(${scaleFactor})` }}>
                <div className={`relative flex flex-col items-center transition-all duration-300 ${player.isEliminated || player.isSpectator ? 'opacity-30 grayscale' : ''} ${isTurn ? 'z-20 scale-110' : 'opacity-80 z-10'}`}>
                  {isTurn && !player.isEliminated && !player.isSpectator && <TimerRing progress={timerPercentage} size={isPortrait ? 56 : 72} color="#00d2d3" />}
                  <div className={`relative p-1 rounded-full transition-all duration-500 z-10 ${isTurn ? 'bg-gradient-to-tr from-unoGreen to-emerald-400 shadow-neon-blue' : 'bg-gray-800'}`}>
                     <img src={player.avatar} className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-gray-900 border-2 border-gray-900" />
                     {player.hasCalledUno && !player.isEliminated && <div className="absolute -top-3 -right-3 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full border border-white animate-bounce shadow-lg">UNO</div>}
                     {player.isEliminated && !player.isSpectator && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500 text-4xl font-bold drop-shadow-lg"><i className="fas fa-times"></i></div>}
                     {player.isSpectator && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-400 text-2xl font-bold drop-shadow-lg opacity-80"><i className="fas fa-eye"></i></div>}
                     <div className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-0.5 rounded-full whitespace-nowrap border border-white/10">{player.name}</div>
                  </div>
                  {!player.isEliminated && !player.isSpectator && (
                    <div className={`flex items-center justify-center mt-3 transition-opacity duration-1000 relative h-8 ${isDealing ? 'opacity-0' : 'opacity-100'}`}>
                        {player.hand.slice(0, cardLimit).map((_, i) => (
                          <div key={i} className="absolute w-3 h-5 sm:w-4 sm:h-6 md:w-5 md:h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded border border-white/20 shadow-sm origin-bottom" style={{ transform: `rotate(${(i - Math.min(player.hand.length, cardLimit)/2) * 10}deg) translateY(${Math.abs(i - Math.min(player.hand.length, cardLimit)/2) * 2}px)`, zIndex: i }}></div>
                        ))}
                        {extraCards > 0 && <div className="absolute -right-6 top-1/2 -translate-y-1/2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-md z-50">+{extraCards}</div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="absolute top-[42%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 md:gap-8 z-20 scale-75 md:scale-85 origin-center">
             <div className={`relative group cursor-pointer hover:scale-105 transition-transform ${isDealing ? 'opacity-0' : 'opacity-100'} z-30`} onClick={drawCard}>
               {gameState.deck.map((_, i) => i < 3 && <div key={i} className="absolute w-20 h-32 sm:w-24 sm:h-36 md:w-32 md:h-48 bg-gray-800 rounded-lg border border-gray-700 top-0 left-0 shadow-lg" style={{ transform: `translate(${-i*2}px, ${-i*2}px)`}}></div>)}
               <Card className="shadow-2xl border-white/10" /> 
             </div>
             <div className="relative">
                <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-72 md:h-72 rounded-full blur-3xl opacity-30 transition-colors duration-1000 bg-uno${gameState.currentColor.charAt(0).toUpperCase() + gameState.currentColor.slice(1)}`}></div>
                <div className={`relative transition-opacity duration-500 ${isDealing ? 'opacity-0' : 'opacity-100'}`}>
                    {gameState.discardPile.slice(-3).map((card, idx, arr) => (
                        <div key={card.id} className="absolute top-0 left-0" style={{ transform: idx === arr.length - 1 ? 'none' : `rotate(${getCardRotation(card.id)}deg)` }}><Card card={card} className={`shadow-2xl ${idx === arr.length - 1 ? 'animate-pop-in' : ''}`} /></div>
                    ))}
                    {gameState.discardPile.length === 0 && <div className="w-20 h-32 sm:w-24 sm:h-36"></div>}
                </div>
             </div>
             <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] border border-dashed border-white/5 rounded-full animate-[spin_30s_linear_infinite] pointer-events-none opacity-50 ${gameState.direction === -1 ? 'animate-reverse-spin' : ''}`}><div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white/20 rounded-full"></div></div>
          </div>
          {me && !me.isEliminated && !me.isSpectator && (
            <div className={`absolute bottom-0 left-0 right-0 z-30 flex justify-center items-end perspective-1000 h-36 sm:h-48 md:h-56 pointer-events-none pb-safe transition-opacity duration-1000 ${isDealing ? 'opacity-0' : 'opacity-100'}`}>
              <div className="flex -space-x-9 md:-space-x-12 hover:-space-x-4 transition-all duration-300 pointer-events-auto px-4 overflow-x-auto overflow-y-visible scrollbar-hide max-w-full items-end pb-4 pr-4 sm:pr-32 pt-10"> 
                 {me.hand.map((card, i) => (
                    <div key={card.id} className="transition-transform duration-500 hover:z-50 origin-bottom animate-deal shrink-0" style={{ transform: `rotate(${(i - me.hand.length/2) * 4}deg) translateY(${myIndex === gameState.currentPlayerIndex ? '-10px' : '0px'})` }}>
                      <Card card={card} playable={myIndex === gameState.currentPlayerIndex} onClick={() => handleCardClick(card)} />
                    </div>
                 ))}
              </div>
            </div>
          )}
          {me && !me.isEliminated && !me.isSpectator && (
            <div className={`absolute z-50 flex flex-col items-center justify-center transition-opacity duration-1000 ${isDealing ? 'opacity-0' : 'opacity-100'} ${isPortrait ? 'top-[55%] right-2 -translate-y-1/2 scale-75 origin-center' : 'bottom-8 right-8'}`}>
                {myIndex === gameState.currentPlayerIndex && <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"><TimerRing progress={(gameState.turnTimer/30)*100} size={160} color="#00d2d3" /></div>}
                {me.hand.length <= 2 && !me.hasCalledUno && <div className="mb-2 animate-bounce bg-white text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg">PRESS SPACE!</div>}
                <button onClick={callUno} disabled={me.hand.length > 2} className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full font-black text-white text-3xl sm:text-4xl shadow-2xl border-[6px] border-white/20 transform transition-all active:scale-95 flex items-center justify-center relative ${(me.hand.length > 2) ? 'bg-gray-800/80 opacity-40 cursor-default grayscale' : 'bg-gradient-to-b from-red-500 to-red-700 animate-pulse hover:scale-105 hover:shadow-neon-red cursor-pointer shadow-neon-red ring-4 ring-red-400/30'}`}>
                <span className="drop-shadow-md italic transform -rotate-6">UNO</span>{me.hand.length <= 2 && <span className="absolute -top-1 -right-1 flex h-8 w-8"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-8 w-8 bg-red-500 border-2 border-white"></span></span>}</button>
            </div>
          )}
          {me && me.isEliminated && !me.isSpectator && <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center animate-deal"><div className="bg-gray-900 border border-red-500/30 p-8 rounded-3xl text-center shadow-2xl max-w-md mx-4"><h2 className="text-4xl font-black text-red-500 mb-2">ELIMINATED!</h2><p className="text-gray-400 mb-8">You ran out of points for this round.</p><div className="flex flex-col gap-3"><div className="text-sm text-gray-500 mb-2 uppercase tracking-widest">You are spectating</div><button onClick={leaveGame} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all">Exit to Main Menu</button></div></div></div>}
        </>
      )}
      {wildPickerOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md"><div className="glass-panel rounded-[2rem] p-8 shadow-2xl animate-deal border border-white/20"><h3 className="text-3xl font-bold text-center mb-6 text-white font-display">Select Color</h3><div className="grid grid-cols-2 gap-4">{COLORS.map(c => <button key={c} onClick={() => handleWildColorSelect(c)} className={`w-28 h-28 rounded-2xl bg-uno${c.charAt(0).toUpperCase() + c.slice(1)} hover:scale-105 transition-transform shadow-lg border-2 border-white/10`} />)}</div></div></div>}
      {(view === 'ROUND_END' || view === 'WINNER') && gameState && (
        <div className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 overflow-hidden">
           {view === 'WINNER' && <Confetti />}
           <h1 className="text-5xl sm:text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 mb-4 sm:mb-8 drop-shadow-[0_0_20px_rgba(253,224,71,0.5)] animate-bounce font-display z-10 text-center">{view === 'WINNER' ? 'CHAMPION!' : 'ROUND OVER'}</h1>
           {/* Winner Podium Rendering omitted for brevity, assuming standard rendering logic logic persists */}
           <div className={`glass-panel p-4 sm:p-6 rounded-3xl w-full max-w-2xl border border-white/10 mb-8 animate-deal z-10 ${view === 'WINNER' ? 'hidden md:block opacity-80 scale-90' : ''}`}>
              <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-hide">
                 {gameState.players.sort((a,b) => b.score - a.score).map((p, i) => (<div key={p.id} className={`flex items-center justify-between p-4 rounded-xl transition-all ${p.isEliminated ? 'bg-red-900/30 grayscale opacity-70' : p.hand.length === 0 ? 'bg-green-600/40 border border-green-400' : 'bg-white/5'}`}><div className="flex items-center gap-4"><span className="text-gray-500 font-bold text-lg w-6">#{i+1}</span><img src={p.avatar} className="w-12 h-12 rounded-full border border-white/10" /><div className="flex flex-col"><span className={`font-bold text-lg ${p.id === myId ? 'text-unoBlue' : 'text-white'}`}>{p.name} {p.id === myId && '(You)'}</span></div></div><span className="text-3xl font-display font-bold text-white/90">{p.score} <span className="text-sm font-sans font-normal text-gray-400">pts</span></span></div>))}
              </div>
           </div>
           <div className="flex gap-4 z-20"><button onClick={leaveGame} className="px-8 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition backdrop-blur-md">Exit</button>{myId === 'host-id' && view !== 'WINNER' && <button onClick={handleNextRound} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 px-10 rounded-xl text-xl shadow-lg hover:scale-105 transition">Next Round <i className="fas fa-arrow-right ml-2"></i></button>}</div>
        </div>
      )}
      {gameState && view === 'GAME' && <><Chat players={gameState.players} currentPlayerId={myId || ''} messages={gameState.chatMessages || []} onSend={handleSendMessage} /><Reaction onReact={handleReaction} /></>}
    </div>
  );
};
export default App;