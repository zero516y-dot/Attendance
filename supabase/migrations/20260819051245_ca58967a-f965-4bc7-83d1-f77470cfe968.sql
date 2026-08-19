CREATE TYPE public.app_role AS ENUM ('OWNER','MANAGER','ADMIN','STAFF');
CREATE TYPE public.attendance_event AS ENUM ('CHECK_IN','CHECK_OUT');
CREATE TYPE public.attendance_status AS ENUM ('PENDING','APPROVED','REJECTED');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  username text NOT NULL UNIQUE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'STAFF',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_approve_attendance boolean NOT NULL DEFAULT false,
  can_view_reports boolean NOT NULL DEFAULT false,
  can_manage_staff boolean NOT NULL DEFAULT false,
  can_access_qr_display boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cafe_settings (
  id boolean PRIMARY KEY DEFAULT true,
  name text NOT NULL DEFAULT 'Main Cafe',
  latitude double precision NOT NULL DEFAULT 0,
  longitude double precision NOT NULL DEFAULT 0,
  radius_meters integer NOT NULL DEFAULT 30,
  gateway_ip text,
  enforce_ip boolean NOT NULL DEFAULT false,
  enforce_geofence boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cafe_settings_singleton CHECK (id)
);
GRANT ALL ON public.cafe_settings TO service_role;
ALTER TABLE public.cafe_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.cafe_settings (id) VALUES (true);

CREATE TABLE public.qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX qr_sessions_token_hash_idx ON public.qr_sessions(token_hash);
GRANT ALL ON public.qr_sessions TO service_role;
ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.attendance_event NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'PENDING',
  scanned_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  ip_address text,
  ip_match boolean NOT NULL DEFAULT false,
  geo_ok boolean NOT NULL DEFAULT false,
  qr_session_id uuid REFERENCES public.qr_sessions(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_logs_status_idx ON public.attendance_logs(status, scanned_at DESC);
GRANT SELECT ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role AND is_active);
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF public.has_role(_user_id, 'OWNER') THEN RETURN true; END IF;
  SELECT CASE _perm
    WHEN 'can_approve_attendance' THEN p.can_approve_attendance
    WHEN 'can_view_reports' THEN p.can_view_reports
    WHEN 'can_manage_staff' THEN p.can_manage_staff
    WHEN 'can_access_qr_display' THEN p.can_access_qr_display
    ELSE false END
  INTO ok FROM public.user_permissions p WHERE p.user_id = _user_id;
  RETURN COALESCE(ok, false);
END;
$$;

CREATE POLICY "own profile readable" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "managers read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'can_manage_staff') OR public.has_permission(auth.uid(), 'can_approve_attendance') OR public.has_permission(auth.uid(), 'can_view_reports'));
CREATE POLICY "staff managers update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'can_manage_staff'))
  WITH CHECK (public.has_permission(auth.uid(), 'can_manage_staff'));

CREATE POLICY "own permissions readable" ON public.user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff managers read permissions" ON public.user_permissions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'can_manage_staff'));

CREATE POLICY "own attendance readable" ON public.attendance_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "reviewers read attendance" ON public.attendance_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'can_approve_attendance') OR public.has_permission(auth.uid(), 'can_view_reports'));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER permissions_touch BEFORE UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.attendance_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;