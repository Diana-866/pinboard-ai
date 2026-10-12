import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

interface User {
  id: string;
  email: string;
  name?: string;
  credits_balance: number;
  subscription_tier: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  activeViewMode: "client" | "admin";
  setActiveViewMode: (mode: "client" | "admin") => void;
  isPrivacyModalOpen: boolean;
  closePrivacyModal: () => void;
  openPrivacyModal: () => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<"client" | "admin">("client");
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  async function refreshUser() {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const data = await apiRequest("/me");
      setUser(data);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: !!user?.is_admin,
        activeViewMode,
        setActiveViewMode,
        isPrivacyModalOpen,
        closePrivacyModal: () => setIsPrivacyModalOpen(false),
        openPrivacyModal: () => setIsPrivacyModalOpen(true),
        refreshUser,
        logout,
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