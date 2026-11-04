import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Configuration keys for local storage fallback
const STORAGE_SUPABASE_URL = 'ai_dir_supabase_url';
const STORAGE_SUPABASE_ANON_KEY = 'ai_dir_supabase_anon_key';

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'super_admin' | 'editor' | 'moderator';
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
}

export interface AuthAdminSession {
  user: User;
  session: Session;
  adminProfile: AdminProfile;
}

// Retrieve configured URL and Key from environment or local storage
export function getSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_SUPABASE_URL) || '' : '';
  const storedKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_SUPABASE_ANON_KEY) || '' : '';

  const url = (envUrl && !envUrl.includes('your-project.supabase.co')) ? envUrl : storedUrl;
  const anonKey = (envKey && !envKey.includes('your-anon-public-key')) ? envKey : storedKey;

  return { url, anonKey };
}

// Check if credentials are validly configured
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey && url.startsWith('http') && anonKey.length > 20);
}

// Save runtime credentials to localStorage
export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_SUPABASE_URL, url.trim());
    localStorage.setItem(STORAGE_SUPABASE_ANON_KEY, anonKey.trim());
    // Reset client instance
    cachedClient = null;
  }
}

// Clear runtime credentials
export function clearSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_SUPABASE_URL);
    localStorage.removeItem(STORAGE_SUPABASE_ANON_KEY);
    cachedClient = null;
  }
}

let cachedClient: SupabaseClient | null = null;

// Get or initialize the Supabase client
export function getSupabase(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || !url.startsWith('http')) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  return cachedClient;
}

/**
 * Sign in an administrator via Supabase Auth and verify active role in public.admin_users
 */
export async function signInAdminWithSupabase(
  email: string,
  password: string
): Promise<AuthAdminSession> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Please provide your Supabase Project URL and Anon Public Key.');
  }

  // 1. Authenticate with Supabase Auth
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (authError || !authData.user || !authData.session) {
    throw new Error(authError?.message || 'Authentication failed. Please verify your email and password.');
  }

  const user = authData.user;
  const session = authData.session;

  // 2. Query public.admin_users to verify administrator privileges
  const { data: adminRecord, error: adminError } = await client
    .from('admin_users')
    .select('id, email, full_name, role, is_active, created_at, last_login_at')
    .eq('id', user.id)
    .maybeSingle();

  if (adminError) {
    // If permission or table error
    await client.auth.signOut();
    throw new Error(`Authorization check failed: ${adminError.message}`);
  }

  if (!adminRecord) {
    // Authenticated user exists in auth.users, but not in admin_users
    await client.auth.signOut();
    throw new Error(
      `Access Denied: The account "${user.email}" is authenticated, but has not been granted administrator privileges in public.admin_users. Please execute "supabase/bootstrap_super_admin.sql" in your Supabase SQL Editor.`
    );
  }

  if (!adminRecord.is_active) {
    await client.auth.signOut();
    throw new Error(`Access Denied: Administrator account "${user.email}" has been deactivated. Please contact the primary super_admin.`);
  }

  // 3. Update last login timestamp in admin_users (best-effort)
  try {
    await client
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);
  } catch {
    // Ignore minor error on timestamp update
  }

  // 4. Log audit entry for login
  try {
    await client
      .from('audit_logs')
      .insert({
        administrator_id: user.id,
        administrator_email: user.email,
        action: 'admin_login',
        entity_type: 'auth',
        entity_id: user.id,
        metadata: {
          client: 'admin_portal',
          role: adminRecord.role,
          logged_in_at: new Date().toISOString()
        }
      });
  } catch {
    // Best-effort audit insert
  }

  return {
    user,
    session,
    adminProfile: adminRecord as AdminProfile
  };
}

/**
 * Check currently active session and verify admin profile
 */
export async function getActiveAdminSession(): Promise<AuthAdminSession | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data: { session }, error: sessionErr } = await client.auth.getSession();
    if (sessionErr || !session || !session.user) return null;

    const user = session.user;
    const { data: adminRecord, error: adminErr } = await client
      .from('admin_users')
      .select('id, email, full_name, role, is_active, created_at, last_login_at')
      .eq('id', user.id)
      .maybeSingle();

    if (adminErr || !adminRecord || !adminRecord.is_active) {
      await client.auth.signOut();
      return null;
    }

    return {
      user,
      session,
      adminProfile: adminRecord as AdminProfile
    };
  } catch {
    return null;
  }
}

/**
 * Sign out of Supabase Auth
 */
export async function signOutAdmin(): Promise<void> {
  const client = getSupabase();
  if (client) {
    await client.auth.signOut();
  }
}

/**
 * Send password reset email via Supabase Auth
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) {
    throw new Error(error.message);
  }
}
