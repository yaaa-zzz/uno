
export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'black';
export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  value?: number; // 0-9 for number cards
}

export interface Player {
  id: string;
  name: string;
  avatar: string; // URL or ID
  hand: Card[];
  isHost: boolean;
  score: number; // For round scoring
  isEliminated: boolean;
  hasCalledUno: boolean;
  isBot?: boolean;
  isSpectator?: boolean;
}

export type GameStatus = 'LOBBY' | 'PLAYING' | 'ROUND_OVER' | 'GAME_OVER';
export type GameMode = 'QUICK' | 'TOURNAMENT';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  status: GameStatus;
  winner: Player | null;
  currentColor: CardColor; // Tracks active color for Wild cards
  turnTimer: number; // Seconds remaining for turn
  log: string[]; // Game log messages
  mode: GameMode;
  chatMessages: ChatMessage[];
  lastReaction: { playerId: string; emoji: string; timestamp: number } | null;
}

export interface Reaction {
  id: string;
  senderId: string;
  emoji: string;
  x: number;
  y: number;
}
