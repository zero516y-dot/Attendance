ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;