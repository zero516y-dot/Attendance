import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listAttendance } from "@/lib/attendance.functions";

export const Route = createFileRoute("/_authenticated/dashboard/reports")({
  head: () => ({
    meta: [
      { title: "Attendance reports — Brew Clock" },
      { name: "description", content: "Filter attendance logs by date range and export to CSV." },
      { property: "og:title", content: "Attendance reports — Brew Clock" },
      { property: "og:description", content: "Exportable cafe attendance history." },
    ],
  }),
  component: ReportsPage,
});

type Row = {
  id: string;
  event_type: string;
  status: string;
  scanned_at: string;
  distance_meters: number | null;
  ip_address: string | null;
  ip_match: boolean;
  review_note: string | null;
  profiles?: { full_name: string; username: string; role: string } | null;
};

function toCsv(rows: Row[]): string {
  const header = [
    "Staff",
    "Username",
    "Role",
    "Event",
    "Status",
    "Scanned at",
    "Distance (m)",
    "IP",
    "IP match",
    "Note",
  ];
  const body = rows.map((r) =>
    [
      r.profiles?.full_name ?? "",
      r.profiles?.username ?? "",
      r.profiles?.role ?? "",
      r.event_type,
      r.status,
      new Date(r.scanned_at).toISOString(),
      r.distance_meters === null ? "" : Math.round(r.distance_meters),
      r.ip_address ?? "",
      r.ip_match ? "yes" : "no",
      (r.review_note ?? "").replaceAll('"', "'"),
    ]
      .map((v) => `"${String(v)}"`)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function ReportsPage() {
  const fetchLogs = useServerFn(listAttendance);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [], isFetching, refetch } = useQuery({
    queryKey: ["attendance", "report", from, to],
    queryFn: () =>
      fetchLogs({
        data: {
          status: "ALL",
          limit: 500,
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
        },
      }) as unknown as Promise<Row[]>,
  });

  function download() {
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h1 className="text-3xl font-bold text-foreground">Reports</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Filter the attendance log and export it for payroll.
      </p>

      <div className="surface-panel mt-6 flex flex-wrap items-end gap-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          Apply
        </Button>
        <Button className="ml-auto" onClick={download} disabled={data.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="surface-panel mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Scanned</th>
              <th className="px-4 py-3">Distance</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 text-foreground">{row.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.event_type.replace("_", " ")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(row.scanned_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.distance_meters === null ? "—" : `${Math.round(row.distance_meters)}m`}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.ip_match ? "match" : "mismatch"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      row.status === "APPROVED"
                        ? "default"
                        : row.status === "REJECTED"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {row.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No attendance records for this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
