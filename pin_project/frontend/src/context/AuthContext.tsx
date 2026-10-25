import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

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
  refreshUser: () => Promise<void>;
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
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const data = await apiRequest("/me");
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
    } catch (e) {
      localStorage.removeItem("token");
      setUser(null);
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  function logout() {
    localStorage.removeItem("token");
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
