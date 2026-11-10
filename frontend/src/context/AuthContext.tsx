import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api";
import { clearAuthToken, readAuthToken, readLocalStorageValue } from "../lib/authStorage";

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
  updateUserAvatar: (url: string) => void;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AVATAR_KEY = "pinposy_avatar";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<"client" | "admin">("client");
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  async function refreshUser() {
    const token = readAuthToken();
    if (!token) {
      setUser(null);
      return false;
    }
    try {
      const data = await apiRequest("/me");
      const localLanguage = readLocalStorageValue("pinposy_lang");
      if (localLanguage && ["en", "ru", "es", "pt", "de", "fr", "zh"].includes(localLanguage) && localLanguage !== data.preferred_language) {
        try {
          await apiRequest("/me", { method: "PATCH", body: JSON.stringify({ preferred_language: localLanguage }) });
          data.preferred_language = localLanguage;
        } catch (error) {
          console.warn("[auth] Could not sync saved interface language:", error);
        }
      }
      let avatar: string | undefined;
      try {
        avatar = localStorage.getItem(AVATAR_KEY) || undefined;
      } catch {
        avatar = undefined;
      }
      setUser({
        ...data,
        plan: data.subscription_tier || "free",
        onboarded: data.onboarded ?? false,
        tariff_plan: data.tariff_plan ?? "none",
        avatar,
      });
      return true;
    } catch (e) {
      // A transient network/5xx failure must not destroy a still-valid local
      // session. apiRequest already clears and redirects on protected-route 401.
      if (e instanceof ApiError && e.status === 401) {
        clearAuthToken();
        setUser(null);
      } else {
        console.warn("[auth] Could not refresh the current user; keeping the session for retry:", e);
      }
      return false;
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  function logout() {
    clearAuthToken();
    setUser(null);
    window.location.href = "/login";
  }

  function updateUserAvatar(url: string) {
    setUser((prev) => (prev ? { ...prev, avatar: url } : prev));
    try {
      localStorage.setItem(AVATAR_KEY, url);
    } catch {
      // localStorage может быть недоступен — не критично
    }
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
