export type PresetAvatarId =
  | 'default'
  | 'spade'
  | 'fox'
  | 'owl'
  | 'lion'
  | 'crown'
  | 'phoenix';

export interface AvatarPresetOption {
  id: PresetAvatarId;
  label: string;
}

export const AVATAR_PRESETS: AvatarPresetOption[] = [
  { id: 'default', label: '默认' },
  { id: 'spade', label: '黑桃' },
  { id: 'fox', label: '赤狐' },
  { id: 'owl', label: '夜枭' },
  { id: 'lion', label: '雄狮' },
  { id: 'crown', label: '皇冠' },
  { id: 'phoenix', label: '火凤' },
];

export const MAX_CUSTOM_AVATAR_BYTES = 48_000;

const PRESET_SET = new Set<string>(AVATAR_PRESETS.map((p) => p.id));

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validates and normalizes a player's avatar identifier or custom data-URL image.
 * Falls back to 'default' for any unsupported or oversized payload.
 */
export function sanitizeAvatar(raw?: unknown): string {
  if (typeof raw !== 'string') return 'default';
  const trimmed = raw.trim();
  if (!trimmed) return 'default';
  if (PRESET_SET.has(trimmed)) return trimmed;
  if (
    trimmed.length <= MAX_CUSTOM_AVATAR_BYTES &&
    DATA_IMAGE_RE.test(trimmed)
  ) {
    return trimmed;
  }
  return 'default';
}

export function isCustomAvatarDataUrl(avatar?: string): boolean {
  return Boolean(avatar && avatar.startsWith('data:image/'));
}

/**
 * Picks a deterministic monogram initial from a player name.
 */
export function getAvatarInitial(name: string): string {
  const clean = name.trim();
  if (!clean) return 'V';
  return Array.from(clean)[0]!.toUpperCase();
}
