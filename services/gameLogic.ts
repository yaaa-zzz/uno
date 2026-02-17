import { Card, CardColor, CardType, GameState, Player, GameMode } from '../types';
import { COLORS, AVATARS_MALE, AVATARS_FEMALE } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import { Peer, DataConnection } from 'peerjs';

// --- SHARED TYPES ---
export interface IGameService {
    subscribe(cb: (state: GameState) => void): () => void;
    cleanup(): void;
    joinGame(name: string, avatar: string, existingId?: string): Promise<string>;
    leaveGame(playerId: string): void;
    addBot(): void;
    startGame(): void;
    playCard(playerId: string, cardId: string, wildColor?: CardColor): void;
    drawCard(playerId: string): void;
    callUno(playerId: string): void;
    sendReaction(playerId: string, emoji: string): void;
    sendChat(playerId: string, text: string): void;
    nextRound(): void;
    get roomId(): string;
}

const PEER_PREFIX = 'uno-w-v5-';

// --- HELPER FUNCTIONS ---
export const generateDeck = (): Card[] => {
  const deck: Card[] = [];
  COLORS.forEach((color) => {
    deck.push({ id: uuidv4(), color, type: 'number', value: 0 });
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: uuidv4(), color, type: 'number', value: i });
      deck.push({ id: uuidv4(), color, type: 'number', value: i });
    }
    ['skip', 'reverse', 'draw2'].forEach((type) => {
      deck.push({ id: uuidv4(), color, type: type as CardType });
      deck.push({ id: uuidv4(), color, type: type as CardType });
    });
  });
  for (let i = 0; i < 4; i++) {
    deck.push({ id: uuidv4(), color: 'black', type: 'wild' });
    deck.push({ id: uuidv4(), color: 'black', type: 'wild4' });
  }
  return shuffleDeck(deck);
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const isValidMove = (card: Card, topCard: Card, currentColor: CardColor): boolean => {
  if (card.color === 'black') return true;
  if (card.color === currentColor) return true;
  if (card.type === topCard.type) {
    if (card.type === 'number') return card.value === topCard.value;
    return true;
  }
  return false;
};

export const calculateHandScore = (hand: Card[]): number => {
  return hand.reduce((total, card) => {
    if (card.type === 'wild' || card.type === 'wild4') return total + 50; 
    if (card.type === 'skip' || card.type === 'reverse' || card.type === 'draw2') return total + 20;
    return total + (card.value || 0);
  }, 0);
};

// --- HOST SERVER ---
export class MockGameServer implements IGameService {
  private state: GameState;
  private listeners: ((state: GameState) => void)[] = [];
  private botTurnTimeout: any = null;
  private timerInterval: any = null;
  
  // PeerJS
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map(); // PlayerID -> Connection

  constructor(hostName: string, hostAvatar: string, maxPlayers: number, mode: GameMode = 'TOURNAMENT') {
    const host: Player = {
      id: 'host-id',
      name: hostName,
      avatar: hostAvatar,
      hand: [],
      isHost: true,
      score: 0,
      isEliminated: false,
      hasCalledUno: false,
      isBot: false,
      isSpectator: false
    };

    // Generate a 6-char alpha-numeric room ID
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    this.state = {
      roomId: roomCode,
      players: [host],
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      direction: 1,
      status: 'LOBBY',
      winner: null,
      currentColor: 'black',
      turnTimer: 30,
      log: ['Lobby created. Waiting for players...'],
      mode: mode,
      chatMessages: [],
      lastReaction: null
    };

    this.initializePeer(roomCode);
  }

  private initializePeer(roomCode: string) {
      const peerId = `${PEER_PREFIX}${roomCode}`;
      this.peer = new Peer(peerId);

      this.peer.on('open', (id) => {
          console.log('Host Peer ID:', id);
          this.state.log.push(`Room Code: ${roomCode}`);
          this.notify();
      });

      this.peer.on('connection', (conn) => {
          conn.on('open', () => {
              // Connection established, wait for JOIN_REQUEST
          });
          
          conn.on('data', (data: any) => {
             this.handleMessage(conn, data);
          });

          conn.on('close', () => {
             // Handle explicit disconnection (tab close, network loss)
             let disconnectedPlayerId: string | null = null;
             
             // Reverse lookup the player ID associated with this connection
             for (const [pid, connection] of this.connections.entries()) {
                 if (connection === conn) {
                     disconnectedPlayerId = pid;
                     break;
                 }
             }

             if (disconnectedPlayerId) {
                 console.log(`Connection closed for ${disconnectedPlayerId}. Eliminating player.`);
                 this.handlePlayerExit(disconnectedPlayerId);
             }
          });
          
          conn.on('error', (err) => console.error('Connection error:', err));
      });

      this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          this.state.log.push(`Network Error: ${err.type}`);
          this.notify();
      });
  }

  get roomId() { return this.state.roomId; }

  // --- NETWORKING HANDLERS ---
  private handleMessage(conn: DataConnection, data: any) {
      switch(data.type) {
          case 'JOIN_REQUEST':
              this.handleJoinRequest(conn, data.payload);
              break;
          case 'ACTION':
              this.handleRemoteAction(data.payload);
              break;
          case 'LEAVE_REQUEST':
              this.handleLeaveRequest(data.payload.playerId);
              break;
      }
  }

  private handleJoinRequest(conn: DataConnection, payload: any) {
     // 1. RECONNECTION CHECK
     if (payload.existingId) {
         const existingPlayer = this.state.players.find(p => p.id === payload.existingId);
         if (existingPlayer) {
             this.connections.set(existingPlayer.id, conn);
             conn.send({ 
                type: 'JOIN_RESPONSE', 
                payload: { requestId: payload.requestId, success: true, playerId: existingPlayer.id, initialState: this.state }
             });
             this.notify();
             return;
         }
     }

     // 2. NEW JOIN CHECKS
     if (this.state.players.length >= 15) {
         conn.send({ type: 'JOIN_RESPONSE', payload: { requestId: payload.requestId, success: false, error: 'Room Full' }});
         return;
     }

     // 3. SPECTATOR CHECK (Late Join)
     const isSpectator = this.state.status !== 'LOBBY';
     
     const newPlayer: Player = {
         id: uuidv4(),
         name: payload.name,
         avatar: payload.avatar,
         hand: [],
         isHost: false,
         score: 0,
         isEliminated: false,
         hasCalledUno: false,
         isBot: false,
         isSpectator: isSpectator
     };
     
     this.state.players.push(newPlayer);
     this.connections.set(newPlayer.id, conn);

     this.state.log.push(`${newPlayer.name} joined${isSpectator ? ' as Spectator' : ''}`);
     this.notify();
     
     conn.send({ 
         type: 'JOIN_RESPONSE', 
         payload: { requestId: payload.requestId, success: true, playerId: newPlayer.id, initialState: this.state }
     });
  }

  private handleLeaveRequest(playerId: string) {
      this.handlePlayerExit(playerId);
  }

  private handlePlayerExit(playerId: string) {
      // Close connection if open
      const conn = this.connections.get(playerId);
      if (conn) {
          conn.removeAllListeners('close'); 
          conn.close();
          this.connections.delete(playerId);
      }

      if (this.state.status === 'LOBBY') {
          this.state.players = this.state.players.filter(p => p.id !== playerId);
      } else {
          const player = this.state.players.find(p => p.id === playerId);
          if (player && !player.isEliminated) {
              player.isEliminated = true;
              player.hand = [];
              player.isSpectator = true; 
              this.state.log.push(`${player.name} left the game.`);
              
              const activePlayers = this.state.players.filter(p => !p.isEliminated && !p.isSpectator);
              
              if (activePlayers.length <= 1 && this.state.status !== 'GAME_OVER') {
                  if (this.timerInterval) clearInterval(this.timerInterval);
                  if (this.botTurnTimeout) clearTimeout(this.botTurnTimeout);
                  
                  this.state.status = 'GAME_OVER';
                  
                  if (activePlayers.length === 1) {
                      this.state.winner = activePlayers[0];
                      this.state.log.push(`${activePlayers[0].name} wins!`);
                  } else {
                      this.state.log.push("Game Over - No players remaining");
                  }
              } else if (this.state.status !== 'GAME_OVER') {
                  if (this.state.players[this.state.currentPlayerIndex]?.id === playerId) {
                     this.advanceTurn(1);
                     this.notify();
                     this.checkBotTurn();
                     return;
                  }
              }
          }
      }
      this.notify();
  }

  private handleRemoteAction(payload: any) {
      switch(payload.action) {
          case 'playCard': this.playCard(payload.playerId, payload.cardId, payload.wildColor); break;
          case 'drawCard': this.drawCard(payload.playerId); break;
          case 'callUno': this.callUno(payload.playerId); break;
          case 'reaction': this.sendReaction(payload.playerId, payload.emoji); break;
          case 'chat': this.sendChat(payload.playerId, payload.text); break;
      }
  }

  // --- CORE LOGIC ---
  cleanup() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      if (this.botTurnTimeout) clearTimeout(this.botTurnTimeout);
      this.connections.forEach(conn => conn.close());
      this.peer?.destroy();
      this.listeners = [];
  }

  subscribe(callback: (state: GameState) => void) {
    this.listeners.push(callback);
    callback(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach(l => l({ ...this.state }));
    
    // Broadcast to Peers
    this.connections.forEach((conn) => {
        if (conn.open) {
            conn.send({ type: 'STATE_UPDATE', payload: { roomId: this.state.roomId, state: this.state } });
        }
    });
  }

  async joinGame(name: string, avatar: string, existingId?: string): Promise<string> {
      return "HOST_ALREADY_JOINED";
  }
  
  leaveGame(playerId: string) {
      this.handlePlayerExit(playerId);
  }

  addBot() {
    if (this.state.players.length >= 15) return;
    const botNames = ["Alpha", "Beta", "Gamma", "Delta", "Omega", "Neo", "Trinity", "Morpheus"];
    const name = `Bot ${botNames[Math.floor(Math.random() * botNames.length)]} ${Math.floor(Math.random() * 99)}`;
    const avatars = [...AVATARS_MALE, ...AVATARS_FEMALE];
    const avatar = avatars[Math.floor(Math.random() * avatars.length)];
    
    const bot: Player = { id: uuidv4(), name, avatar, hand: [], isHost: false, score: 0, isEliminated: false, hasCalledUno: false, isBot: true, isSpectator: false };
    this.state.players.push(bot);
    this.state.log.push(`${name} (Bot) added`);
    this.notify();
  }

  startGame() {
    if (this.state.players.length < 2) return;
    
    this.state.deck = generateDeck();
    this.state.players.forEach(p => {
      if (!p.isSpectator) {
          p.hand = this.state.deck.splice(0, 7);
          p.isEliminated = false;
          p.score = 0;
          p.hasCalledUno = false;
      } else {
          p.hand = [];
          p.isEliminated = true; 
      }
    });

    let firstCard = this.state.deck.pop()!;
    while(firstCard.color === 'black') {
      this.state.deck.unshift(firstCard);
      firstCard = this.state.deck.pop()!;
    }
    this.state.discardPile = [firstCard];
    this.state.currentColor = firstCard.color;
    this.state.status = 'PLAYING';
    this.state.currentPlayerIndex = 0;
    
    while(this.state.players[this.state.currentPlayerIndex].isSpectator) {
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
    }

    this.state.log.push(`Game Started (${this.state.mode} Mode)`);
    this.startTurnTimer();
    this.notify();
    this.checkBotTurn();
  }

  private startTurnTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.state.turnTimer = 30;
    this.timerInterval = setInterval(() => {
        if (this.state.status !== 'PLAYING') {
            clearInterval(this.timerInterval);
            return;
        }
        this.state.turnTimer--;
        if (this.state.turnTimer <= 0) {
            this.handleTimeout();
        } else {
            this.notify();
        }
    }, 1000);
  }

  private handleTimeout() {
      const currentPlayer = this.state.players[this.state.currentPlayerIndex];
      if (currentPlayer.isSpectator || currentPlayer.isEliminated) {
          this.advanceTurn(1);
          this.notify();
          this.checkBotTurn();
      } else {
          this.drawCard(currentPlayer.id); 
      }
  }

  private checkBotTurn() {
    if (this.botTurnTimeout) clearTimeout(this.botTurnTimeout);
    if (this.state.status !== 'PLAYING') return;
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer && currentPlayer.isBot && !currentPlayer.isEliminated && !currentPlayer.isSpectator) {
      const thinkingTime = 1500 + Math.random() * 1500;
      this.botTurnTimeout = setTimeout(() => { this.executeBotTurn(currentPlayer); }, thinkingTime);
    }
  }

  private executeBotTurn(bot: Player) {
     const topCard = this.state.discardPile[this.state.discardPile.length - 1];
     const validMoves = bot.hand.filter(c => isValidMove(c, topCard, this.state.currentColor));
     
     if (validMoves.length > 0) {
       validMoves.sort((a, b) => {
          const scoreA = (a.type === 'wild4' ? 10 : 0) + (a.type === 'draw2' ? 5 : 0) + (a.type === 'skip' || a.type === 'reverse' ? 3 : 0);
          const scoreB = (b.type === 'wild4' ? 10 : 0) + (b.type === 'draw2' ? 5 : 0) + (b.type === 'skip' || b.type === 'reverse' ? 3 : 0);
          return scoreB - scoreA;
       });
       const cardToPlay = validMoves[0];
       let wildColor: CardColor | undefined;
       if (cardToPlay.color === 'black') {
           const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
           bot.hand.forEach(c => { if(c.color !== 'black') counts[c.color]++; });
           const bestColor = Object.keys(counts).reduce((a, b) => counts[a as keyof typeof counts] > counts[b as keyof typeof counts] ? a : b) as CardColor;
           wildColor = bestColor;
       }
       if (bot.hand.length === 2) this.callUno(bot.id);
       this.playCard(bot.id, cardToPlay.id, wildColor);
     } else {
       this.drawCard(bot.id);
     }
  }

  playCard(playerId: string, cardId: string, wildColor?: CardColor) {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.state.currentPlayerIndex) return;

    const player = this.state.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;
    
    const card = player.hand[cardIndex];
    const topCard = this.state.discardPile[this.state.discardPile.length - 1];

    if (!isValidMove(card, topCard, this.state.currentColor)) return;

    player.hand.splice(cardIndex, 1);
    this.state.discardPile.push(card);

    if (player.hand.length === 1 && !player.hasCalledUno) {
        this.state.log.push(`${player.name} forgot UNO! +1 Card Penalty.`);
        this.drawCards(playerIndex, 1);
    }
    if (player.hand.length > 1) player.hasCalledUno = false;

    let nextOffset = 1;
    this.state.currentColor = card.color;
    if (card.color === 'black' && wildColor) this.state.currentColor = wildColor;

    if (card.type === 'reverse') {
      const activeCount = this.state.players.filter(p => !p.isEliminated && !p.isSpectator).length;
      if (activeCount === 2) nextOffset = 2; else this.state.direction *= -1;
    } else if (card.type === 'skip') {
      nextOffset = 2;
    } else if (card.type === 'draw2') {
      nextOffset = 2; 
      const nextP = this.getNextPlayerIndex(1);
      this.drawCards(nextP, 2);
    } else if (card.type === 'wild4') {
      nextOffset = 2;
      const nextP = this.getNextPlayerIndex(1);
      this.drawCards(nextP, 4);
    }

    if (player.hand.length === 0) {
      this.handleRoundWin(player);
      return;
    }

    this.advanceTurn(nextOffset);
    this.notify();
    this.checkBotTurn();
  }

  drawCard(playerId: string) {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.state.currentPlayerIndex) return;
    
    this.drawCards(playerIndex, 1);
    this.state.log.push(`${this.state.players[playerIndex].name} drew a card`);
    this.advanceTurn(1);
    this.notify();
    this.checkBotTurn();
  }

  callUno(playerId: string) {
     const player = this.state.players.find(p => p.id === playerId);
     if (player && player.hand.length <= 2) {
       player.hasCalledUno = true;
       this.state.log.push(`${player.name} called UNO!`);
       this.notify();
     }
  }

  sendReaction(playerId: string, emoji: string) {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
        // Sync the reaction via state
        this.state.lastReaction = { playerId, emoji, timestamp: Date.now() };
        this.state.log.push(`${player.name} reacted ${emoji}`);
        this.notify();
    }
  }

  sendChat(playerId: string, text: string) {
    const player = this.state.players.find(p => p.id === playerId);
    if (player && text.trim()) {
        const msg = {
            id: uuidv4(),
            senderId: playerId,
            senderName: player.name,
            text: text.trim().substring(0, 100), // Limit length
            timestamp: Date.now()
        };
        this.state.chatMessages.push(msg);
        if (this.state.chatMessages.length > 50) this.state.chatMessages.shift(); // Keep history manageable
        this.notify();
    }
  }

  private drawCards(playerIndex: number, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.state.deck.length === 0) {
        if (this.state.discardPile.length > 0) {
            const top = this.state.discardPile.pop()!;
            this.state.deck = shuffleDeck(this.state.discardPile);
            this.state.discardPile = [top];
        } else { break; }
      }
      if (this.state.deck.length > 0) {
        this.state.players[playerIndex].hand.push(this.state.deck.pop()!);
      }
    }
  }

  private getNextPlayerIndex(offset: number = 1): number {
    const len = this.state.players.length;
    let nextIndex = this.state.currentPlayerIndex;
    let count = 0;
    while (count < offset) {
        nextIndex = (nextIndex + this.state.direction + len) % len;
        // Skip eliminated OR spectators
        if (!this.state.players[nextIndex].isEliminated && !this.state.players[nextIndex].isSpectator) count++;
        if(count > len * 2) break; 
    }
    return nextIndex;
  }

  private advanceTurn(offset: number) {
    this.startTurnTimer();
    this.state.currentPlayerIndex = this.getNextPlayerIndex(offset);
  }

  private handleRoundWin(roundWinner: Player) {
    clearInterval(this.timerInterval);
    if (this.state.mode === 'QUICK') {
        this.state.status = 'GAME_OVER';
        this.state.winner = roundWinner;
        this.state.log.push(`${roundWinner.name} won the Quick Match!`);
        this.notify();
        return;
    }
    this.state.status = 'ROUND_OVER';
    this.state.log.push(`${roundWinner.name} won the round!`);
    const activePlayers = this.state.players.filter(p => !p.isEliminated && !p.isSpectator);
    activePlayers.forEach(p => {
       if (p.id !== roundWinner.id) p.score = calculateHandScore(p.hand);
       else p.score = 0;
    });
    const sortedByScore = [...activePlayers].sort((a, b) => b.score - a.score);
    const highestScorer = sortedByScore[0];
    if (highestScorer && highestScorer.score > 0) {
        const playerToEliminate = this.state.players.find(p => p.id === highestScorer.id);
        if (playerToEliminate) {
            playerToEliminate.isEliminated = true;
            this.state.log.push(`${playerToEliminate.name} eliminated! (${playerToEliminate.score} pts)`);
        }
    }
    const remainingPlayers = this.state.players.filter(p => !p.isEliminated && !p.isSpectator);
    if (remainingPlayers.length === 1) {
        this.state.winner = remainingPlayers[0];
        this.state.status = 'GAME_OVER';
    }
    this.notify();
  }
  
  nextRound() {
      if (this.state.status === 'GAME_OVER') return;
      this.state.deck = generateDeck();
      this.state.discardPile = [];
      const activePlayers = this.state.players.filter(p => !p.isEliminated && !p.isSpectator);
      
      if (activePlayers.length < 2) {
          this.state.status = 'GAME_OVER';
          if (activePlayers.length === 1) this.state.winner = activePlayers[0];
          this.notify();
          return;
      }

      activePlayers.forEach(p => {
          p.hand = this.state.deck.splice(0,7);
          p.hasCalledUno = false;
          p.score = 0; 
      });
      let firstCard = this.state.deck.pop()!;
      while(firstCard.color === 'black') {
        this.state.deck.unshift(firstCard);
        firstCard = this.state.deck.pop()!;
      }
      this.state.discardPile = [firstCard];
      this.state.currentColor = firstCard.color;
      this.state.status = 'PLAYING';
      const firstPlayerId = activePlayers[0].id;
      this.state.currentPlayerIndex = this.state.players.findIndex(p => p.id === firstPlayerId);
      this.state.log.push("Next Round Started!");
      this.startTurnTimer();
      this.notify();
      this.checkBotTurn();
  }
}

// --- CLIENT CONTROLLER ---
export class RemoteGameController implements IGameService {
    private peer: Peer;
    private conn: DataConnection | null = null;
    private listeners: ((state: GameState) => void)[] = [];
    public roomId: string;
    private lastState: GameState | null = null;

    constructor(roomId: string) {
        this.roomId = roomId;
        this.peer = new Peer(); 
        this.peer.on('error', (err) => console.log('Client Peer Warning:', err.type));
    }

    subscribe(callback: (state: GameState) => void) {
        this.listeners.push(callback);
        if (this.lastState) callback(this.lastState);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notify() {
        if (this.lastState) {
            this.listeners.forEach(l => l(this.lastState!));
        }
    }

    cleanup() {
        this.conn?.close();
        this.peer.destroy();
        this.listeners = [];
    }

    joinGame(name: string, avatar: string, existingId?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const requestId = uuidv4();
            const hostPeerId = `${PEER_PREFIX}${this.roomId}`;
            
            const timeoutTimer = setTimeout(() => {
                reject("Connection timed out. Room may be closed.");
                this.conn?.close();
            }, 5000);

            const peerErrorListener = (err: any) => {
                if (err.type === 'peer-unavailable') {
                    clearTimeout(timeoutTimer);
                    this.peer.off('error', peerErrorListener); 
                    reject(`Room ${this.roomId} not found or host offline.`);
                }
            };
            this.peer.on('error', peerErrorListener);

            const executeJoin = () => {
                this.conn = this.peer.connect(hostPeerId, { reliable: true });

                if (!this.conn) {
                    clearTimeout(timeoutTimer);
                    this.peer.off('error', peerErrorListener);
                    reject("Critical: Peer connection failed to create.");
                    return;
                }

                this.conn.on('open', () => {
                    this.conn?.send({ 
                        type: 'JOIN_REQUEST', 
                        payload: { roomId: this.roomId, name, avatar, requestId, existingId } 
                    });
                });

                this.conn.on('data', (data: any) => {
                    if (data.type === 'JOIN_RESPONSE' && data.payload.requestId === requestId) {
                        clearTimeout(timeoutTimer);
                        this.peer.off('error', peerErrorListener);
                        
                        if (data.payload.success) {
                            this.lastState = data.payload.initialState;
                            this.notify();
                            resolve(data.payload.playerId);
                        } else {
                            reject(data.payload.error || 'Join refused by host.');
                        }
                    }
                    if (data.type === 'STATE_UPDATE') {
                        this.lastState = data.payload.state;
                        this.notify();
                    }
                });

                this.conn.on('close', () => {
                    console.log("Host connection closed.");
                });
                this.conn.on('error', (err) => console.error("DataConnection Error:", err));
            };

            if (this.peer.open) {
                executeJoin();
            } else {
                this.peer.on('open', () => executeJoin());
            }
        });
    }

    leaveGame(playerId: string) {
        this.conn?.send({ type: 'LEAVE_REQUEST', payload: { roomId: this.roomId, playerId } });
    }

    startGame() { /* Host Only */ }
    addBot() { /* Host Only */ }
    nextRound() { /* Host Only */ }

    playCard(playerId: string, cardId: string, wildColor?: CardColor) {
        this.conn?.send({ type: 'ACTION', payload: { roomId: this.roomId, action: 'playCard', playerId, cardId, wildColor } });
    }
    drawCard(playerId: string) {
        this.conn?.send({ type: 'ACTION', payload: { roomId: this.roomId, action: 'drawCard', playerId } });
    }
    callUno(playerId: string) {
        this.conn?.send({ type: 'ACTION', payload: { roomId: this.roomId, action: 'callUno', playerId } });
    }
    sendReaction(playerId: string, emoji: string) {
        this.conn?.send({ type: 'ACTION', payload: { roomId: this.roomId, action: 'reaction', playerId, emoji } });
    }
    sendChat(playerId: string, text: string) {
        this.conn?.send({ type: 'ACTION', payload: { roomId: this.roomId, action: 'chat', playerId, text } });
    }
}
