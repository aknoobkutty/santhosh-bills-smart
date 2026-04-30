import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
    // Debounce guard: ignore rapid double submits within 800ms
    const now = Date.now();
    if (loading || now - lastSubmitRef.current < 800) return;
    lastSubmitRef.current = now;
    setLoading(true);
    setStatusMsg(mode === "signin" ? "Signing in, please wait…" : "Creating your account, please wait…");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setStatusMsg("Account created successfully.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStatusMsg("Signed in successfully. Redirecting…");
        nav({ to: "/dashboard" });
      }
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
          {mode === "signup" && (
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
            </div>
          )}
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
                {mode === "signin" ? "Signing in…" : "Creating account…"}
              </span>
            ) : mode === "signin" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </Button>
          </fieldset>
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {statusMsg}
          </div>
        </form>

        <div className="text-center mt-4 text-sm">
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-primary hover:underline">
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}