import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/auth.functions";
import type { PermissionKey } from "@/lib/geo";

export function useMe() {
  const fetchMe = useServerFn(getMe);
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    staleTime: 30_000,
  });

  const isOwner = query.data?.profile?.role === "OWNER";
  const can = (key: PermissionKey) =>
    isOwner || Boolean(query.data?.permissions?.[key as keyof typeof query.data.permissions]);

  return { ...query, profile: query.data?.profile ?? null, isOwner, can };
}
