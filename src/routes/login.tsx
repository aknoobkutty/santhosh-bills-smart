import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Smartphone, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const lastSubmitRef = useRef(0);

  useEffect(() => {
    if (loading) submitBtnRef.current?.focus();
  }, [loading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const now = Date.now();
    if (loading || now - lastSubmitRef.current < 800) return;
    lastSubmitRef.current = now;
    setLoading(true);
    setStatusMsg("Signing in, please wait…");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Claim this device as the active session — kicks any other device.
      const sid =
        (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
      try { sessionStorage.setItem("active_session_id", sid); } catch {}
      await supabase.rpc("claim_session", {
        _session_id: sid,
        _user_agent: navigator.userAgent.slice(0, 200),
        _ip: null,
      });
      setStatusMsg("Signed in successfully. Redirecting…");
      nav({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
      setStatusMsg(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--gradient-subtle)" }}>
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
            <Smartphone className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Santhosh Mobiles</h1>
          <p className="text-sm text-muted-foreground">Billing Management System</p>
        </div>

        <form onSubmit={submit} className="space-y-4" aria-busy={loading}>
          <fieldset disabled={loading} className="space-y-4 border-0 p-0 m-0">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="pw">Password</Label>
            <div className="relative">
              <Input
                id="pw"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button ref={submitBtnRef} type="submit" className="w-full" disabled={loading} aria-busy={loading} aria-live="polite">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </span>
            ) : (
              "Sign In"
            )}
          </Button>
          </fieldset>
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {statusMsg}
          </div>
        </form>

        <div className="text-center mt-4 text-sm space-y-1">
          <Link to="/forgot-password" className="text-primary hover:underline block">Forgot password?</Link>
          <p className="text-xs text-muted-foreground">Accounts are created by an administrator.</p>
        </div>
      </Card>
    </div>
  );
}