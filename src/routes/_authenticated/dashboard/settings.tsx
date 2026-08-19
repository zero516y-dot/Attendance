import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getCafeSettings, updateCafeSettings } from "@/lib/attendance.functions";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Cafe security settings — Brew Clock" },
      {
        name: "description",
        content: "Configure the cafe geofence radius, coordinates and gateway IP restriction.",
      },
      { property: "og:title", content: "Cafe security settings — Brew Clock" },
      { property: "og:description", content: "Geofence and network anti-spoofing configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const load = useServerFn(getCafeSettings);
  const save = useServerFn(updateCafeSettings);
  const { data, error } = useQuery({ queryKey: ["cafe-settings"], queryFn: () => load() });

  const [form, setForm] = useState({
    name: "Main Cafe",
    latitude: 0,
    longitude: 0,
    radius_meters: 30,
    gateway_ip: "",
    enforce_ip: false,
    enforce_geofence: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      radius_meters: data.radius_meters,
      gateway_ip: data.gateway_ip ?? "",
      enforce_ip: data.enforce_ip,
      enforce_geofence: data.enforce_geofence,
    });
  }, [data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ data: { ...form, gateway_ip: form.gateway_ip.trim() || null } });
      toast.success("Cafe settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        })),
      () => toast.error("Could not read your location"),
      { enableHighAccuracy: true },
    );
  }

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground">Cafe security</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        These values drive the geofence and network checks applied to every scan.
      </p>

      <form onSubmit={onSubmit} className="surface-panel mt-6 space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="name">Cafe name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="lat">Latitude</Label>
            <Input
              id="lat"
              type="number"
              step="any"
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lng">Longitude</Label>
            <Input
              id="lng"
              type="number"
              step="any"
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="radius">Radius (m)</Label>
            <Input
              id="radius"
              type="number"
              min={5}
              value={form.radius_meters}
              onChange={(e) => setForm({ ...form, radius_meters: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation}>
          <Crosshair className="mr-2 h-4 w-4" /> Use my current location
        </Button>

        <div className="space-y-2">
          <Label htmlFor="ip">Cafe gateway IP</Label>
          <Input
            id="ip"
            placeholder="203.0.113.7"
            value={form.gateway_ip}
            onChange={(e) => setForm({ ...form, gateway_ip: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <span className="text-sm text-muted-foreground">Enforce geofence radius</span>
          <Switch
            checked={form.enforce_geofence}
            onCheckedChange={(v) => setForm({ ...form, enforce_geofence: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <span className="text-sm text-muted-foreground">Enforce gateway IP match</span>
          <Switch
            checked={form.enforce_ip}
            onCheckedChange={(v) => setForm({ ...form, enforce_ip: v })}
          />
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </section>
  );
}
