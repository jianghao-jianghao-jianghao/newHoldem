import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AchievementDatesMap,
  AchievementId,
  EquippedAchievementPref,
} from '../shared/achievements';
import type { LeaderboardEntry } from '../shared/types';

export interface AccountProfile {
  uid: string;
  displayName: string;
  email: string;
  avatar: string;
  points: number;
  netChips: number;
  handsPlayed: number;
  handsWon: number;
  bestHandName: string;
  bestHandScore: number;
  achievements: AchievementId[];
  achievementDates: AchievementDatesMap;
  equippedAchievement?: EquippedAchievementPref;
  currentWinStreak: number;
  maxWinStreak: number;
  bgmEnabled: boolean;
}

export interface SendOtpResponse {
  ok: boolean;
  error?: string;
  retryAfterSec?: number;
  expiresInSec?: number;
  deliveryMode?: 'email' | 'preview';
  previewCode?: string;
}

interface AuthContextValue {
  authReady: boolean;
  profile: AccountProfile | null;
  sendingCode: boolean;
  verifyingCode: boolean;
  authError: string | null;
  sendEmailCode: (email: string) => Promise<SendOtpResponse>;
  verifyEmailCode: (params: {
    email: string;
    code: string;
    displayName?: string;
    avatar?: string;
    localAchievements?: AchievementId[];
    localAchievementDates?: AchievementDatesMap;
  }) => Promise<AccountProfile | null>;
  signOutUser: () => Promise<void>;
  updatePreferences: (patch: {
    displayName?: string;
    avatar?: string;
    bgmEnabled?: boolean;
    equippedAchievement?: EquippedAchievementPref;
  }) => Promise<void>;
  syncMatchOutcomeToCloud: (entry: LeaderboardEntry, avatar?: string) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_STORAGE_KEY = 'velvet_holdem_auth_token';

const SERVER_BASE_URL = (
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? ''
)
  .trim()
  .replace(/\/+$/, '');

function getApiUrl(path: string): string {
  return SERVER_BASE_URL ? `${SERVER_BASE_URL}${path}` : path;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    fetch(getApiUrl('/api/auth/session'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('session_invalid');
        return (await res.json()) as { profile?: AccountProfile };
      })
      .then((data) => {
        if (!cancelled) {
          setProfile(data.profile ?? null);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          try {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
          } catch {
            // Ignore storage issues
          }
          setToken(null);
          setProfile(null);
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const sendEmailCode = useCallback(async (email: string): Promise<SendOtpResponse> => {
    setSendingCode(true);
    setAuthError(null);
    try {
      const res = await fetch(getApiUrl('/api/auth/send-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as SendOtpResponse;
      if (!res.ok || !data.ok) {
        const msg = data.error ?? '验证码发送失败，请稍后重试';
        setAuthError(msg);
        return { ok: false, error: msg, retryAfterSec: data.retryAfterSec };
      }
      return data;
    } catch {
      const msg = '无法连接服务器，请检查网络后再试';
      setAuthError(msg);
      return { ok: false, error: msg };
    } finally {
      setSendingCode(false);
    }
  }, []);

  const verifyEmailCode = useCallback(
    async (params: {
      email: string;
      code: string;
      displayName?: string;
      avatar?: string;
      localAchievements?: AchievementId[];
      localAchievementDates?: AchievementDatesMap;
    }): Promise<AccountProfile | null> => {
      setVerifyingCode(true);
      setAuthError(null);
      try {
        const res = await fetch(getApiUrl('/api/auth/verify-code'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          token?: string;
          profile?: AccountProfile;
        };
        if (!res.ok || !data.ok || !data.token || !data.profile) {
          setAuthError(data.error ?? '验证码校验失败');
          return null;
        }
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        } catch {
          // Ignore storage quota issues
        }
        setToken(data.token);
        setProfile(data.profile);
        return data.profile;
      } catch {
        setAuthError('验证请求失败，请检查网络连接');
        return null;
      } finally {
        setVerifyingCode(false);
      }
    },
    []
  );

  const signOutUser = useCallback(async () => {
    try {
      await fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // Ignore network errors during logout
    }
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage issues
    }
    setToken(null);
    setProfile(null);
    setAuthError(null);
  }, [token]);

  const updatePreferences = useCallback(
    async (patch: {
      displayName?: string;
      avatar?: string;
      bgmEnabled?: boolean;
      equippedAchievement?: EquippedAchievementPref;
    }) => {
      if (!token) return;
      try {
        const res = await fetch(getApiUrl('/api/auth/profile'), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: AccountProfile };
        if (data.profile) setProfile(data.profile);
      } catch {
        // Ignore transient offline errors
      }
    },
    [token]
  );

  const syncMatchOutcomeToCloud = useCallback(
    async (entry: LeaderboardEntry, avatar?: string) => {
      if (!token) return;
      try {
        const res = await fetch(getApiUrl('/api/auth/sync-outcome'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entry, avatar }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: AccountProfile };
        if (data.profile) setProfile(data.profile);
      } catch {
        // Ignore transient offline errors
      }
    },
    [token]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      profile,
      sendingCode,
      verifyingCode,
      authError,
      sendEmailCode,
      verifyEmailCode,
      signOutUser,
      updatePreferences,
      syncMatchOutcomeToCloud,
      clearAuthError: () => setAuthError(null),
    }),
    [
      authReady,
      profile,
      sendingCode,
      verifyingCode,
      authError,
      sendEmailCode,
      verifyEmailCode,
      signOutUser,
      updatePreferences,
      syncMatchOutcomeToCloud,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
