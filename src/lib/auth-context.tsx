import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "staff";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => fetchRole(sess.user.id), 0);
      } else {
        setRole(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) fetchRole(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Single-session enforcement: watch our profile's active_session_id;
  // if it changes to something other than ours, sign out this device.
  useEffect(() => {
    if (!user) return;
    const mySid = (() => { try { return sessionStorage.getItem("active_session_id"); } catch { return null; } })();
    if (!mySid) return;

    const channel = supabase
      .channel(`profile-session-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as any)?.active_session_id;
          if (next && next !== mySid) {
            supabase.auth.signOut().then(() => {
              try { sessionStorage.removeItem("active_session_id"); } catch {}
              if (typeof window !== "undefined") window.location.href = "/login?kicked=1";
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function fetchRole(uid: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();
    setRole((data?.role as Role) ?? "staff");
  }

  async function signOut() {
    const sid = (() => { try { return sessionStorage.getItem("active_session_id"); } catch { return null; } })();
    if (sid) {
      try { await supabase.rpc("end_session", { _session_id: sid }); } catch {}
      try { sessionStorage.removeItem("active_session_id"); } catch {}
    }
    await supabase.auth.signOut();
    setRole(null);
  }

  return (
    <Ctx.Provider value={{ user, session, role, loading, signOut, isAdmin: role === "admin" }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}