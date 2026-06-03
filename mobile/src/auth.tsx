import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setToken, clearToken, User, AuthResponse } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync('user');
        const token = await SecureStore.getItemAsync('token');
        if (stored && token) setUser(JSON.parse(stored));
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAuth = useCallback(async (res: AuthResponse) => {
    await setToken(res.token);
    await SecureStore.setItemAsync('user', JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await handleAuth(res);
  }, [handleAuth]);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.register(username, email, password);
    await handleAuth(res);
  }, [handleAuth]);

  const logout = useCallback(async () => {
    await clearToken();
    await SecureStore.deleteItemAsync('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
