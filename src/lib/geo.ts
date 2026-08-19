export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const PERMISSION_KEYS = [
  "can_approve_attendance",
  "can_view_reports",
  "can_manage_staff",
  "can_access_qr_display",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_approve_attendance: "Approve attendance",
  can_view_reports: "View reports",
  can_manage_staff: "Manage staff",
  can_access_qr_display: "Access QR display",
};

export type AppRole = "OWNER" | "MANAGER" | "ADMIN" | "STAFF";
