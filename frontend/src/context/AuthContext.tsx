import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'user';
  plan: 'Analytics' | 'Start' | 'Pro' | 'Agency';
  credits: number;
  authProvider: 'email' | 'google' | 'apple';
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  activeViewMode: 'client' | 'admin';
  setActiveViewMode: (mode: 'client' | 'admin') => void;
  isAuthModalOpen: boolean;
  authModalTab: 'signin' | 'signup';
  openAuthModal: (tab?: 'signin' | 'signup') => void;
  closeAuthModal: () => void;
  isPrivacyModalOpen: boolean;
  openPrivacyModal: () => void;
  closePrivacyModal: () => void;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => void;
  updateUserAvatar: (avatarUrl: string) => void;
}

const DEFAULT_ADMIN_USER: UserProfile = {
  id: 'usr-1',
  name: 'Елена Смирнова',
  email: 'sdreimei@gmail.com',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face',
  role: 'admin',
  plan: 'Pro',
  credits: 840,
  authProvider: 'google',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('pinsprig_user');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_ADMIN_USER;
  });

  const [activeViewMode, setActiveViewMode] = useState<'client' | 'admin'>('client');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem('pinsprig_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('pinsprig_user');
      }
    } catch {
      // ignore
    }
  }, [user]);

  const openAuthModal = (tab: 'signin' | 'signup' = 'signin') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => setIsAuthModalOpen(false);
  const openPrivacyModal = () => setIsPrivacyModalOpen(true);
  const closePrivacyModal = () => setIsPrivacyModalOpen(false);

  const loginWithEmail = async (email: string, _pass: string) => {
    const isOwner = email.toLowerCase().includes('sdreimei') || email.toLowerCase().includes('admin');
    const loggedUser: UserProfile = {
      id: `usr-${Date.now()}`,
      name: email.split('@')[0],
      email,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face',
      role: isOwner ? 'admin' : 'user',
      plan: isOwner ? 'Pro' : 'Start',
      credits: isOwner ? 840 : 400,
      authProvider: 'email',
    };
    setUser(loggedUser);
    setIsAuthModalOpen(false);
  };

  const registerWithEmail = async (name: string, email: string, _pass: string) => {
    const isOwner = email.toLowerCase().includes('sdreimei') || email.toLowerCase().includes('admin');
    const newUser: UserProfile = {
      id: `usr-${Date.now()}`,
      name: name.trim() || email.split('@')[0],
      email,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face',
      role: isOwner ? 'admin' : 'user',
      plan: 'Start',
      credits: 400,
      authProvider: 'email',
    };
    setUser(newUser);
    setIsAuthModalOpen(false);
  };

  const loginWithGoogle = async () => {
    const googleUser: UserProfile = {
      id: 'usr-1',
      name: 'Елена Смирнова',
      email: 'sdreimei@gmail.com',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face',
      role: 'admin',
      plan: 'Pro',
      credits: 840,
      authProvider: 'google',
    };
    setUser(googleUser);
    setIsAuthModalOpen(false);
  };

  const loginWithApple = async () => {
    const appleUser: UserProfile = {
      id: `usr-apple-${Date.now()}`,
      name: 'Apple User',
      email: 'user@privaterelay.appleid.com',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=face',
      role: 'user',
      plan: 'Start',
      credits: 400,
      authProvider: 'apple',
    };
    setUser(appleUser);
    setIsAuthModalOpen(false);
  };

  const logout = () => {
    setUser(null);
    setActiveViewMode('client');
  };

  const updateUserAvatar = (avatarUrl: string) => {
    setUser((prev) => (prev ? { ...prev, avatar: avatarUrl } : null));
  };

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        activeViewMode,
        setActiveViewMode,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        isPrivacyModalOpen,
        openPrivacyModal,
        closePrivacyModal,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        loginWithApple,
        logout,
        updateUserAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
