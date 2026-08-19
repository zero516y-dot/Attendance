import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { listUsers, resetUserPassword, updateUserAccess } from "@/lib/auth.functions";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/dashboard/users")({
  head: () => ({
    meta: [
      { title: "Staff management — Brew Clock" },
      { name: "description", content: "Create accounts and tune permissions for your cafe team." },
      { property: "og:title", content: "Staff management — Brew Clock" },
      { property: "og:description", content: "Owner-only account provisioning and RBAC." },
    ],
  }),
  component: UsersPage,
});

type UserRow = {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: "OWNER" | "MANAGER" | "ADMIN" | "STAFF";
  is_active: boolean;
  user_permissions: Record<PermissionKey, boolean> | null;
};

function UsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const update = useServerFn(updateUserAccess);
  const resetPassword = useServerFn(resetUserPassword);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers() as unknown as Promise<UserRow[]>,
  });

  const mutate = useMutation({
    mutationFn: (vars: {
      user_id: string;
      is_active?: boolean;
      role?: "MANAGER" | "ADMIN" | "STAFF";
      permissions?: Record<PermissionKey, boolean>;
    }) => update({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onResetPassword(userId: string) {
    const password = window.prompt("New password (min 8 characters)");
    if (!password) return;
    try {
      await resetPassword({ data: { user_id: userId, password } });
      toast.success("Password reset");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset password");
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Staff & permissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Provision accounts and grant granular capabilities.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      {error && <p className="mt-6 text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      <div className="mt-6 space-y-4">
        {data.map((user) => (
          <div key={user.id} className="surface-panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-semibold text-foreground">{user.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  @{user.username} · {user.email}
                </p>
              </div>
              <Badge variant={user.role === "OWNER" ? "default" : "secondary"}>{user.role}</Badge>
              {!user.is_active && <Badge variant="destructive">Revoked</Badge>}
              {user.role !== "OWNER" && (
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={(checked) =>
                        mutate.mutate({ user_id: user.id, is_active: checked })
                      }
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void onResetPassword(user.id)}>
                    <KeyRound className="mr-1 h-4 w-4" /> Reset password
                  </Button>
                </div>
              )}
            </div>

            {user.role !== "OWNER" && (
              <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                {PERMISSION_KEYS.map((key) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{PERMISSION_LABELS[key]}</span>
                    <Switch
                      checked={Boolean(user.user_permissions?.[key])}
                      onCheckedChange={(checked) =>
                        mutate.mutate({
                          user_id: user.id,
                          permissions: {
                            can_approve_attendance: Boolean(
                              user.user_permissions?.can_approve_attendance,
                            ),
                            can_view_reports: Boolean(user.user_permissions?.can_view_reports),
                            can_manage_staff: Boolean(user.user_permissions?.can_manage_staff),
                            can_access_qr_display: Boolean(
                              user.user_permissions?.can_access_qr_display,
                            ),
                            [key]: checked,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
