import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QrCode, ShieldCheck, MapPin, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBootstrapStatus } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Brew Clock — Secure QR Cafe Attendance" },
      {
        name: "description",
        content:
          "QR-based cafe attendance with rotating tokens, geofencing, IP checks and live owner approvals.",
      },
      { property: "og:title", content: "Brew Clock — Secure QR Cafe Attendance" },
      {
        property: "og:description",
        content: "Rotating QR tokens, geofencing and live approvals for cafe teams.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: QrCode,
    title: "Rotating counter QR",
    body: "The register tablet renders a fresh encrypted token every 15 seconds. Tokens die after 20.",
  },
  {
    icon: MapPin,
    title: "Geofenced scans",
    body: "Every scan is measured against the cafe coordinates and rejected outside the radius.",
  },
  {
    icon: ShieldCheck,
    title: "Single-use + IP checks",
    body: "Tokens are consumed on first use and compared against the cafe's gateway IP.",
  },
  {
    icon: Activity,
    title: "Live approval queue",
    body: "Owners and managers approve or reject check-ins the moment they land.",
  },
];

function Landing() {
  const fetchStatus = useServerFn(getBootstrapStatus);
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: () => fetchStatus() });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-widest text-secondary-foreground">
          Brew Clock
        </span>
        <h1 className="mt-6 max-w-2xl text-5xl leading-tight font-bold text-foreground sm:text-6xl">
          QR attendance your cafe staff can't fake.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          A single-owner, permission-driven attendance system: dynamic counter QR codes, anti-spoof
          validation and a real-time approval dashboard.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {data?.needsBootstrap ? (
            <Button asChild size="lg">
              <Link to="/signup">Create the owner account</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link to="/login">Staff login</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="surface-panel p-6">
              <f.icon className="h-6 w-6 text-accent" />
              <h2 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
