import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitScan } from "@/lib/attendance.functions";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Scan to clock in — Brew Clock" },
      { name: "description", content: "Scan the counter QR code to check in or out." },
      { property: "og:title", content: "Scan to clock in — Brew Clock" },
      { property: "og:description", content: "Geofenced QR check-in for cafe staff." },
    ],
  }),
  component: ScanPage,
});

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This device does not support geolocation."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(err.message)), {
      enableHighAccuracy: true,
      timeout: 12000,
    });
  });
}

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const busyRef = useRef(false);
  const [eventType, setEventType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const send = useServerFn(submitScan);

  useEffect(() => {
    return () => {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  async function handleResult(raw: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("Validating…");
    try {
      const parsed = JSON.parse(raw) as { token_hash?: string };
      if (!parsed.token_hash) throw new Error("This is not a Brew Clock counter code.");
      const position = await getPosition();
      const result = await send({
        data: {
          qr_token: parsed.token_hash,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          event_type: eventType,
        },
      });
      toast.success(
        `${eventType === "CHECK_IN" ? "Check-in" : "Check-out"} submitted — awaiting approval`,
      );
      setStatus(
        `Submitted from ${Math.round(result.distance_meters ?? 0)}m away. Waiting for approval.`,
      );
      stopScanner();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      toast.error(message);
      setStatus(message);
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }

  function stopScanner() {
    scannerRef.current?.stop();
    setScanning(false);
  }

  async function startScanner() {
    setStatus(null);
    const QrScanner = (await import("qr-scanner")).default;
    if (!videoRef.current) return;
    scannerRef.current?.destroy();
    const scanner = new QrScanner(videoRef.current, (result) => void handleResult(result.data), {
      highlightScanRegion: true,
      highlightCodeOutline: true,
      preferredCamera: "environment",
    });
    scannerRef.current = scanner;
    try {
      await scanner.start();
      setScanning(true);
    } catch {
      toast.error("Camera access was denied.");
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/dashboard" className="text-xs text-muted-foreground underline underline-offset-4">
          Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Scan the counter</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Point your camera at the register tablet. Codes expire after 20 seconds and can only be
          used once.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button
            variant={eventType === "CHECK_IN" ? "default" : "outline"}
            onClick={() => setEventType("CHECK_IN")}
          >
            <LogIn className="mr-2 h-4 w-4" /> Check in
          </Button>
          <Button
            variant={eventType === "CHECK_OUT" ? "default" : "outline"}
            onClick={() => setEventType("CHECK_OUT")}
          >
            <LogOut className="mr-2 h-4 w-4" /> Check out
          </Button>
        </div>

        <div className="surface-panel mt-6 overflow-hidden p-2">
          <video ref={videoRef} className="aspect-square w-full rounded-lg bg-muted object-cover" />
        </div>

        <div className="mt-4 flex gap-2">
          {scanning ? (
            <Button variant="outline" className="w-full" onClick={stopScanner}>
              Stop camera
            </Button>
          ) : (
            <Button className="w-full" onClick={() => void startScanner()}>
              <Camera className="mr-2 h-4 w-4" /> Start camera
            </Button>
          )}
        </div>

        {status && (
          <p className="mt-4 rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
            {status}
          </p>
        )}
      </div>
    </main>
  );
}
