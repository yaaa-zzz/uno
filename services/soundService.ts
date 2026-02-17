// A simple synthesizer for sound effects to avoid external asset dependency issues
// in some environments, but can fall back to URLs if provided.

class SoundManager {
    private audioCtx: AudioContext | null = null;
    private masterVolume: number = 0.5; // Default 50%
  
    constructor() {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn("Audio Context not supported");
      }
    }

    setVolume(vol: number) {
      this.masterVolume = Math.max(0, Math.min(1, vol));
    }
  
    private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
      if (!this.audioCtx) return;
      
      // Resume if suspended (browser autoplay policy)
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
  
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
  
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      
      // Apply master volume
      const finalVolume = volume * this.masterVolume;

      gain.gain.setValueAtTime(finalVolume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
  
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
  
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    }
  
    play(type: 'deal' | 'play' | 'uno' | 'win' | 'turn' | 'notification' | 'shuffle') {
      switch (type) {
        case 'deal':
          this.playTone(300, 'sine', 0.1, 0.05);
          break;
        case 'play':
          this.playTone(600, 'triangle', 0.1, 0.1);
          break;
        case 'uno':
          this.playTone(800, 'square', 0.4, 0.1);
          setTimeout(() => this.playTone(600, 'square', 0.4, 0.1), 100);
          break;
        case 'win':
          this.playTone(440, 'sine', 0.2);
          setTimeout(() => this.playTone(554, 'sine', 0.2), 200);
          setTimeout(() => this.playTone(659, 'sine', 0.4), 400);
          break;
        case 'turn':
          this.playTone(200, 'sine', 0.1, 0.05);
          break;
        case 'notification':
          this.playTone(1200, 'sine', 0.1, 0.05);
          break;
        case 'shuffle':
          // Simulate riffling cards with rapid noise bursts
          const now = this.audioCtx?.currentTime || 0;
          for(let i=0; i<15; i++) {
             setTimeout(() => this.playTone(150 + Math.random()*100, 'square', 0.03, 0.05), i * 60);
          }
          break;
      }
    }
  }
  
  export const soundManager = new SoundManager();