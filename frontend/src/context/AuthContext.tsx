import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "../lib/api";
import { clearAuthToken, readAuthToken, readLocalStorageValue } from "../lib/authStorage";
import { clearUserScopedStorage } from "../lib/userScopedStorage";
import { isCurrentAuthRefresh } from "../utils/authRefreshFence";

export interface User {
  id: string;
  email: string;
  name?: string;
  credits_balance: number;
  subscription_tier: string;
  /** Прошёл ли пользователь онбординг-визард (колонка users.onboarded, миграция 004) */
  onboarded?: boolean;
  /** Тариф для «замочков»: none | analytics | start | pro | agency (колонка users.tariff_plan, миграция 004) */
  tariff_plan?: 'none' | 'analytics' | 'start' | 'pro' | 'agency';
  /** Подтверждён ли email (колонка users.email_verified, миграция 005). undefined — миграция не применена */
  email_verified?: boolean;
  preferred_language?: 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';
  /** Дата окончания оплаченного периода тарифа (users.tariff_period_end, миграция 006) */
  tariff_period_end?: string | null;
  /** Активна ли оплаченная подписка прямо сейчас — по этому полю кабинет снимает замочки */
  subscription_active?: boolean;
  is_admin?: boolean;
  /** Совместимость с компонентами, проверяющими тариф по названию */
  plan?: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  isAdmin: boolean;
  activeViewMode: "client" | "admin";
  setActiveViewMode: (mode: "client" | "admin") => void;
  isPrivacyModalOpen: boolean;
  closePrivacyModal: () => void;
  openPrivacyModal: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: (mode?: string) => void;
  closeAuthModal: () => void;
  refreshUser: () => Promise<boolean>;
  logout: () => void;
  updateUserAvatar: (url: string) => boolean;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AVATAR_KEY = "pinposy_avatar";
/** Remembers which account last used this browser, so a sign-in as somebody else
 *  on a shared device cannot inherit the previous user's cached work. */
const LAST_USER_KEY = "pinposy_last_user_id";

function rememberUser(userId: string) {
  try {
    localStorage.setItem(LAST_USER_KEY, String(userId));
  } catch {
    // Storage may be unavailable; the key is an isolation aid, not a requirement.
  }
}

function clearPreviousUserIfDifferent(userId: string) {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(LAST_USER_KEY);
  } catch {
    previous = null;
  }
  if (previous && previous !== String(userId)) clearUserScopedStorage();
  rememberUser(userId);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<"client" | "admin">("client");
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const refreshRequestIdRef = useRef(0);

  async function refreshUser() {
    const requestId = ++refreshRequestIdRef.current;
    const token = readAuthToken();
    if (!token) {
      setUser(null);
      return false;
    }
    const snapshot = { requestId, token };
    const isLatestRequest = () => requestId === refreshRequestIdRef.current;
    const isCurrentSession = () => isCurrentAuthRefresh(snapshot, refreshRequestIdRef.current, readAuthToken());
    try {
      const data = await apiRequest("/me");
      if (!isCurrentSession()) return false;
      // Different account on this browser: drop the previous user's queue, drafts
      // and preferences before the new profile is applied. Device-level language
      // and theme are preserved by the sweep.
      clearPreviousUserIfDifferent(String(data.id));
      const localLanguage = readLocalStorageValue("pinposy_lang");
      if (localLanguage && ["en", "ru", "es", "pt", "de", "fr", "zh"].includes(localLanguage) && localLanguage !== data.preferred_language) {
        try {
          await apiRequest("/me", { method: "PATCH", body: JSON.stringify({ preferred_language: localLanguage }) });
          if (!isCurrentSession()) return false;
          data.preferred_language = localLanguage;
        } catch (error) {
          if (!isLatestRequest()) return false;
          const currentToken = readAuthToken();
          if (currentToken && currentToken !== token) return false;
          if (error instanceof ApiError && error.status === 401) {
            clearAuthToken();
            setUser(null);
            return false;
          }
          if (!currentToken) {
            setUser(null);
            return false;
          }
          console.warn("[auth] Could not sync saved interface language:", error);
        }
      }
      let avatar: string | undefined;
      try {
        avatar = localStorage.getItem(AVATAR_KEY) || undefined;
      } catch {
        avatar = undefined;
      }
      if (!isCurrentSession()) return false;
      setUser({
        ...data,
        plan: data.subscription_tier || "free",
        onboarded: data.onboarded ?? false,
        tariff_plan: data.tariff_plan ?? "none",
        avatar,
      });
      return true;
    } catch (e) {
      // A late response from an old token must never replace the current account.
      if (!isLatestRequest()) return false;
      const currentToken = readAuthToken();
      if (currentToken && currentToken !== token) return false;
      if (e instanceof ApiError && e.status === 401) {
        clearAuthToken();
        setUser(null);
      } else if (!currentToken) {
        setUser(null);
      } else {
        console.warn("[auth] Could not refresh the current user; keeping the session for retry:", e);
      }
      return false;
    }
  }

  useEffect(() => {
    let active = true;
    void refreshUser().finally(() => {
      if (active) setIsAuthReady(true);
    });
    return () => { active = false; };
  }, []);

  function logout() {
    refreshRequestIdRef.current += 1;
    clearAuthToken();
    // Sign-out on a shared browser must not leave the queue, drafted descriptions,
    // uploaded photos or notification history behind for the next person.
    clearUserScopedStorage();
    setUser(null);
    window.location.href = "/login";
  }

  function updateUserAvatar(url: string): boolean {
    try {
      localStorage.setItem(AVATAR_KEY, url);
    } catch {
      return false;
    }
    setUser((prev) => (prev ? { ...prev, avatar: url } : prev));
    return true;
  }

  function updateUser(patch: Partial<User>) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function openAuthModal(mode?: string) {
    // Модальной регистрации больше нет — есть отдельные страницы /login и /register
    if (mode === "signup") window.location.href = "/register";
    else window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAuthReady,
        isAdmin: !!user?.is_admin,
        activeViewMode,
        setActiveViewMode,
        isPrivacyModalOpen,
        closePrivacyModal: () => setIsPrivacyModalOpen(false),
        openPrivacyModal: () => setIsPrivacyModalOpen(true),
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal: () => setIsAuthModalOpen(false),
        refreshUser,
        logout,
        updateUserAvatar,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
