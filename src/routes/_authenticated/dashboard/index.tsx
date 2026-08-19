import { createFileRoute } from "@tanstack/react-router";
import { ApprovalTable } from "@/components/ApprovalTable";
import { useMe } from "@/hooks/useMe";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Live attendance queue — Brew Clock" },
      { name: "description", content: "Approve or reject staff check-ins in real time." },
      { property: "og:title", content: "Live attendance queue — Brew Clock" },
      { property: "og:description", content: "Real-time cafe attendance approvals." },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const { isOwner, can, isLoading } = useMe();
  const canApprove = isOwner || can("can_approve_attendance");
  const canSee = canApprove || can("can_view_reports");

  return (
    <section>
      <h1 className="text-3xl font-bold text-foreground">Live queue</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pending check-in and check-out requests arrive here instantly.
      </p>
      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : canSee ? (
          <ApprovalTable canApprove={canApprove} />
        ) : (
          <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
            You don't have permission to view the attendance queue. Head to{" "}
            <span className="font-medium text-foreground">Scan</span> to record your own
            attendance.
          </div>
        )}
      </div>
    </section>
  );
}
