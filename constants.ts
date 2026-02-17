import { CardColor } from './types';

export const COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];

export const AVATARS_MALE = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Alexander',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Christopher',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Ryker',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mason',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Caleb',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jace',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
];

export const AVATARS_FEMALE = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Lily',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mila',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aria',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Ella',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Grace',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Chloe',
];

export const ALL_AVATARS = [...AVATARS_MALE, ...AVATARS_FEMALE];

export const SOUNDS = {
  deal: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', // Generic swipe
  play: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', // Generic click/tap
  uno: 'https://assets.mixkit.co/active_storage/sfx/1049/1049-preview.mp3', // Alert
  win: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3', // Success
  turn: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3', // Tick
};
