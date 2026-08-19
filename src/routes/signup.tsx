import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapOwner, getBootstrapStatus } from "@/lib/auth.functions";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Owner bootstrap — Brew Clock" },
      {
        name: "description",
        content: "One-time owner account creation for the Brew Clock attendance system.",
      },
      { property: "og:title", content: "Owner bootstrap — Brew Clock" },
      { property: "og:description", content: "Create the single owner account, then signup locks." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getBootstrapStatus);
  const createOwner = useServerFn(bootstrapOwner);
  const { data, isLoading } = useQuery({ queryKey: ["bootstrap"], queryFn: () => fetchStatus() });
  const [form, setForm] = useState({ full_name: "", username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createOwner({ data: form });
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (error) throw new Error(error.message);
      toast.success("Owner account created");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create owner");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking system state…
      </main>
    );
  }

  if (!data?.needsBootstrap) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="surface-panel max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Signup is locked</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This system already has an owner. New accounts are created from the owner dashboard.
          </p>
          <Button asChild className="mt-6">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="surface-panel w-full max-w-md p-8">
        <span className="text-xs font-medium uppercase tracking-widest text-accent">
          System boot state
        </span>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Create the owner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This form works exactly once. After it succeeds, public signup is permanently disabled.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" required value={form.full_name} onChange={set("full_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" required value={form.username} onChange={set("username")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create owner account"}
          </Button>
        </form>
      </div>
    </main>
  );
}
