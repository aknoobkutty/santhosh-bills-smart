
-- Single-session tracking: track the active session id for each user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_session_id text;

-- Login history table
CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  user_agent text,
  ip_address text,
  logged_in_at timestamptz NOT NULL DEFAULT now(),
  logged_out_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id, logged_in_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own login history"
  ON public.login_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own login history"
  ON public.login_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own login history"
  ON public.login_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow user to update own active_session_id (already covered by Users update own profile)

-- Realtime: enable for profiles so other devices get kicked
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Function: claim session (sets new session id, returns previous)
CREATE OR REPLACE FUNCTION public.claim_session(_session_id text, _user_agent text DEFAULT NULL, _ip text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles SET active_session_id = _session_id WHERE id = auth.uid();
  INSERT INTO public.login_history (user_id, session_id, user_agent, ip_address)
  VALUES (auth.uid(), _session_id, _user_agent, _ip);
END;
$$;

-- Function: end session (clears active_session_id if matches, marks history)
CREATE OR REPLACE FUNCTION public.end_session(_session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET active_session_id = NULL
    WHERE id = auth.uid() AND active_session_id = _session_id;
  UPDATE public.login_history SET logged_out_at = now()
    WHERE user_id = auth.uid() AND session_id = _session_id AND logged_out_at IS NULL;
END;
$$;
