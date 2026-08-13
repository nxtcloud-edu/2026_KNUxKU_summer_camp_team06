import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

type AuthState = {
  ready: boolean;
  session: Session | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
let client: SupabaseClient | null = null;

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await client?.auth.getSession() || { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set('authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

export async function uploadPrivateFile(file: File) {
  if (!client) throw new Error('로그인 준비 중입니다. 잠시 후 다시 시도해 주세요.');
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('파일 저장을 위해 로그인해 주세요.');
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'upload';
  const objectPath = `${userData.user.id}/${crypto.randomUUID()}-${filename}`;
  const { error } = await client.storage.from('keeper-uploads').upload(objectPath, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`파일 업로드에 실패했습니다: ${error.message}`);
  return { objectPath, userId: userData.user.id };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    const boot = async () => {
      const response = await fetch('/v1/auth/config');
      const config = await response.json();
      if (!response.ok) throw new Error(config.error?.message || '인증 설정을 읽지 못했습니다.');
      client = createClient(config.supabase_url, config.supabase_anon_key, { auth: { flowType: 'pkce', detectSessionInUrl: false } });
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const { data } = await client.auth.getSession();
      if (live) setSession(data.session);
      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        if (live) setSession(nextSession);
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    };
    void boot().catch(() => { if (live) setSession(null); }).finally(() => { if (live) setReady(true); });
    return () => { live = false; unsubscribe?.(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    ready,
    session,
    signIn: async () => {
      if (!client) throw new Error('로그인 준비 중입니다. 잠시 후 다시 시도해 주세요.');
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw error;
    },
    signOut: async () => {
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  }), [ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider가 필요합니다.');
  return value;
}
