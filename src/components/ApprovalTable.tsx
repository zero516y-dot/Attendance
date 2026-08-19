import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listAttendance, reviewAttendance } from "@/lib/attendance.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Row = {
  id: string;
  event_type: "CHECK_IN" | "CHECK_OUT";
  status: "PENDING" | "APPROVED" | "REJECTED";
  scanned_at: string;
  distance_meters: number | null;
  ip_match: boolean;
  ip_address: string | null;
  review_note: string | null;
  profiles?: { full_name: string; username: string; role: string } | null;
};

export function ApprovalTable({ canApprove }: { canApprove: boolean }) {
  const queryClient = useQueryClient();
  const fetchLogs = useServerFn(listAttendance);
  const review = useServerFn(reviewAttendance);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["attendance", "PENDING"],
    queryFn: () => fetchLogs({ data: { status: "PENDING", limit: 100 } }) as unknown as Promise<Row[]>,
  });

  useEffect(() => {
    const channel = supabase
      .channel("attendance-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        () => void queryClient.invalidateQueries({ queryKey: ["attendance"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: "APPROVED" | "REJECTED" }) =>
      review({ data: { ...vars, note: notes[vars.id]?.trim() || undefined } }),
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === "APPROVED" ? "Approved" : "Rejected");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading queue…</p>;
  if (data.length === 0)
    return (
      <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
        No pending requests. The queue updates live as staff scan.
      </div>
    );

  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.id} className="surface-panel flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-48">
            <p className="font-semibold text-foreground">{row.profiles?.full_name ?? "Unknown"}</p>
            <p className="text-xs text-muted-foreground">
              @{row.profiles?.username} · {row.profiles?.role}
            </p>
          </div>
          <Badge variant={row.event_type === "CHECK_IN" ? "default" : "secondary"}>
            {row.event_type.replace("_", " ")}
          </Badge>
          <div className="text-sm text-muted-foreground">
            {new Date(row.scanned_at).toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {row.distance_meters === null ? "—" : `${Math.round(row.distance_meters)}m`}
          </div>
          {!row.ip_match && (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> IP mismatch
            </span>
          )}
          {canApprove && (
            <div className="ml-auto flex items-center gap-2">
              <Input
                placeholder="Audit note (optional)"
                className="h-9 w-48"
                value={notes[row.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
              />
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: row.id, decision: "APPROVED" })}
              >
                <Check className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: row.id, decision: "REJECTED" })}
              >
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
