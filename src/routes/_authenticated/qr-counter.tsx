import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { issueQrToken } from "@/lib/attendance.functions";
import { useMe } from "@/hooks/useMe";

export const Route = createFileRoute("/_authenticated/qr-counter")({
  head: () => ({
    meta: [
      { title: "Counter QR display — Brew Clock" },
      {
        name: "description",
        content: "Rotating single-use QR codes for the cafe register tablet.",
      },
      { property: "og:title", content: "Counter QR display — Brew Clock" },
      { property: "og:description", content: "A fresh encrypted QR token every 15 seconds." },
    ],
  }),
  component: QrCounterPage,
});

const REFRESH_MS = 15000;

function QrCounterPage() {
  const { isOwner, can, isLoading } = useMe();
  const allowed = isOwner || can("can_access_qr_display");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const issue = useServerFn(issueQrToken);

  const refresh = useCallback(async () => {
    try {
      const { payload } = await issue();
      const QRCode = (await import("qrcode")).default;
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, payload, {
          width: 420,
          margin: 1,
          errorCorrectionLevel: "M",
        });
      }
      setSecondsLeft(15);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate a QR code";
      setError(message);
      toast.error(message);
    }
  }, [issue]);

  useEffect(() => {
    if (!allowed) return;
    void refresh();
    const rotate = setInterval(() => void refresh(), REFRESH_MS);
    const tick = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, [allowed, refresh]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="surface-panel max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">No QR display access</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            You need the <span className="font-medium">Access QR display</span> permission.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-block text-sm underline underline-offset-4"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10">
      <h1 className="text-3xl font-bold text-foreground">Scan to clock in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This code refreshes every 15 seconds and expires 20 seconds after it is issued.
      </p>
      <div className="surface-panel mt-8 p-6">
        <canvas ref={canvasRef} className="h-[420px] w-[420px] max-w-full" />
      </div>
      <p className="mt-6 text-sm font-medium text-accent-foreground">
        {error ? error : `Refreshing in ${secondsLeft}s`}
      </p>
      <Link to="/dashboard" className="mt-8 text-xs text-muted-foreground underline underline-offset-4">
        Back to dashboard
      </Link>
    </main>
  );
}
