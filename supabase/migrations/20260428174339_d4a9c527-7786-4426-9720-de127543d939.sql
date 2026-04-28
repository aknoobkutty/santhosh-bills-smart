-- 1. STAFF TABLE
CREATE TABLE public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE,
  name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  phone TEXT,
  email TEXT NOT NULL UNIQUE,
  salary NUMERIC NOT NULL DEFAULT 0,
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_status_chk CHECK (status IN ('active','inactive'))
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view staff" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert staff" ON public.staff FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update staff" ON public.staff FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete staff" ON public.staff FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_staff_status ON public.staff(status);
CREATE INDEX idx_staff_user_id ON public.staff(user_id);

-- 2. ATTENDANCE TABLE
CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_status_chk CHECK (status IN ('present','absent','leave')),
  UNIQUE (staff_id, attendance_date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update attendance" ON public.attendance FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete attendance" ON public.attendance FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_attendance_staff_date ON public.attendance(staff_id, attendance_date);

-- 3. SALARY RECORDS TABLE
CREATE TABLE public.salary_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of month
  total_days INT NOT NULL DEFAULT 0,
  present_days INT NOT NULL DEFAULT 0,
  absent_days INT NOT NULL DEFAULT 0,
  leave_days INT NOT NULL DEFAULT 0,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  salary_paid NUMERIC NOT NULL DEFAULT 0,
  paid_on DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, month)
);

ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view salary" ON public.salary_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert salary" ON public.salary_records FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update salary" ON public.salary_records FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete salary" ON public.salary_records FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_salary_updated_at BEFORE UPDATE ON public.salary_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. INVOICES: add staff_id
ALTER TABLE public.invoices ADD COLUMN staff_id UUID;
CREATE INDEX idx_invoices_staff_id ON public.invoices(staff_id);

-- 5. RPC: mark_attendance
CREATE OR REPLACE FUNCTION public.mark_attendance(
  _staff_id UUID,
  _date DATE,
  _status TEXT,
  _notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _status NOT IN ('present','absent','leave') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  INSERT INTO public.attendance (staff_id, attendance_date, status, notes, created_by)
  VALUES (_staff_id, _date, _status, _notes, auth.uid())
  ON CONFLICT (staff_id, attendance_date)
  DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 6. RPC: compute_salary for a month
CREATE OR REPLACE FUNCTION public.compute_salary(
  _staff_id UUID,
  _month DATE,
  _mark_paid BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start DATE;
  _end DATE;
  _total INT;
  _present INT;
  _absent INT;
  _leave INT;
  _base NUMERIC;
  _paid NUMERIC;
  _per_day NUMERIC;
  _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  _start := date_trunc('month', _month)::date;
  _end := (_start + INTERVAL '1 month - 1 day')::date;
  _total := (_end - _start) + 1;

  SELECT COALESCE(salary, 0) INTO _base FROM public.staff WHERE id = _staff_id;
  IF _base IS NULL THEN RAISE EXCEPTION 'Staff not found'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE status='present'),
    COUNT(*) FILTER (WHERE status='absent'),
    COUNT(*) FILTER (WHERE status='leave')
  INTO _present, _absent, _leave
  FROM public.attendance
  WHERE staff_id = _staff_id AND attendance_date BETWEEN _start AND _end;

  _per_day := _base / NULLIF(_total, 0);
  -- Pay for present + leave days; deduct absent
  _paid := ROUND(COALESCE(_per_day, 0) * (_present + _leave), 2);

  INSERT INTO public.salary_records (
    staff_id, month, total_days, present_days, absent_days, leave_days,
    base_salary, salary_paid, paid_on, created_by
  ) VALUES (
    _staff_id, _start, _total, _present, _absent, _leave,
    _base, _paid, CASE WHEN _mark_paid THEN CURRENT_DATE ELSE NULL END, auth.uid()
  )
  ON CONFLICT (staff_id, month) DO UPDATE SET
    total_days = EXCLUDED.total_days,
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    leave_days = EXCLUDED.leave_days,
    base_salary = EXCLUDED.base_salary,
    salary_paid = EXCLUDED.salary_paid,
    paid_on = CASE WHEN _mark_paid THEN CURRENT_DATE ELSE public.salary_records.paid_on END,
    updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 7. Update create_invoice & create_custom_invoice to stamp staff_id
CREATE OR REPLACE FUNCTION public.create_invoice(_customer_id uuid, _customer_name text, _customer_phone text, _items jsonb, _payment_method text DEFAULT 'cash'::text, _amount_paid numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invoice_id UUID;
  _invoice_number TEXT;
  _item JSONB;
  _product RECORD;
  _qty INT;
  _subtotal NUMERIC := 0;
  _gst NUMERIC := 0;
  _grand NUMERIC := 0;
  _line_sub NUMERIC;
  _line_gst NUMERIC;
  _line_total NUMERIC;
  _change NUMERIC := 0;
  _staff_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _payment_method NOT IN ('cash','card','upi') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;

  SELECT id INTO _staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  _invoice_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random()*10000))::text, 4, '0');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _product FROM public.products WHERE id = (_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    _qty := (_item->>'quantity')::int;
    IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    IF _product.stock_quantity < _qty THEN RAISE EXCEPTION 'Insufficient stock for %', _product.name; END IF;
    _line_sub := _product.price * _qty;
    _line_gst := _line_sub * _product.gst_percent / 100;
    _subtotal := _subtotal + _line_sub;
    _gst := _gst + _line_gst;
  END LOOP;

  _grand := _subtotal + _gst;

  IF _payment_method = 'cash' THEN
    IF _amount_paid < _grand THEN RAISE EXCEPTION 'Amount paid (%) is less than grand total (%)', _amount_paid, _grand; END IF;
    _change := _amount_paid - _grand;
  ELSE
    _amount_paid := _grand;
    _change := 0;
  END IF;

  INSERT INTO public.invoices (
    invoice_number, customer_id, customer_name, customer_phone,
    subtotal, gst_total, grand_total, created_by, staff_id,
    payment_method, amount_paid, change_returned
  )
  VALUES (
    _invoice_number, _customer_id, _customer_name, _customer_phone,
    _subtotal, _gst, _grand, auth.uid(), _staff_id,
    _payment_method, _amount_paid, _change
  )
  RETURNING id INTO _invoice_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _product FROM public.products WHERE id = (_item->>'product_id')::uuid FOR UPDATE;
    _qty := (_item->>'quantity')::int;
    _line_sub := _product.price * _qty;
    _line_gst := _line_sub * _product.gst_percent / 100;
    _line_total := _line_sub + _line_gst;

    INSERT INTO public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, gst_percent, line_total)
    VALUES (_invoice_id, _product.id, _product.name, _qty, _product.price, _product.gst_percent, _line_total);

    UPDATE public.products SET stock_quantity = stock_quantity - _qty, updated_at = now() WHERE id = _product.id;
  END LOOP;

  RETURN _invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_custom_invoice(_invoice_type text, _customer_id uuid, _customer_name text, _customer_phone text, _items jsonb, _payment_method text DEFAULT 'cash'::text, _amount_paid numeric DEFAULT 0, _exchange_id uuid DEFAULT NULL::uuid, _service_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invoice_id UUID;
  _invoice_number TEXT;
  _item JSONB;
  _name TEXT;
  _qty INT;
  _price NUMERIC;
  _gst_pct NUMERIC;
  _line_sub NUMERIC;
  _line_gst NUMERIC;
  _line_total NUMERIC;
  _subtotal NUMERIC := 0;
  _gst NUMERIC := 0;
  _grand NUMERIC := 0;
  _change NUMERIC := 0;
  _prefix TEXT;
  _staff_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _invoice_type NOT IN ('used_mobile','exchange','service') THEN RAISE EXCEPTION 'Invalid invoice type: %', _invoice_type; END IF;
  IF _payment_method NOT IN ('cash','card','upi') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'At least one line is required'; END IF;

  SELECT id INTO _staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  _prefix := CASE _invoice_type
    WHEN 'used_mobile' THEN 'UMB-'
    WHEN 'exchange'    THEN 'EXB-'
    WHEN 'service'     THEN 'SRV-'
    ELSE 'INV-' END;

  _invoice_number := _prefix || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random()*10000))::text, 4, '0');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _name    := COALESCE(_item->>'name', '');
    _qty     := COALESCE((_item->>'quantity')::int, 1);
    _price   := COALESCE((_item->>'unit_price')::numeric, 0);
    _gst_pct := COALESCE((_item->>'gst_percent')::numeric, 0);
    IF _name = '' THEN RAISE EXCEPTION 'Line name required'; END IF;
    IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    _line_sub := _price * _qty;
    _line_gst := _line_sub * _gst_pct / 100;
    _subtotal := _subtotal + _line_sub;
    _gst := _gst + _line_gst;
  END LOOP;

  _grand := _subtotal + _gst;

  IF _payment_method = 'cash' THEN
    IF _amount_paid < _grand THEN RAISE EXCEPTION 'Amount paid (%) is less than grand total (%)', _amount_paid, _grand; END IF;
    _change := _amount_paid - _grand;
  ELSE
    _amount_paid := _grand;
    _change := 0;
  END IF;

  INSERT INTO public.invoices (
    invoice_number, customer_id, customer_name, customer_phone,
    subtotal, gst_total, grand_total, created_by, staff_id,
    payment_method, amount_paid, change_returned,
    invoice_type, exchange_id, service_id, notes
  ) VALUES (
    _invoice_number, _customer_id, _customer_name, _customer_phone,
    _subtotal, _gst, _grand, auth.uid(), _staff_id,
    _payment_method, _amount_paid, _change,
    _invoice_type, _exchange_id, _service_id, _notes
  ) RETURNING id INTO _invoice_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _name    := _item->>'name';
    _qty     := COALESCE((_item->>'quantity')::int, 1);
    _price   := COALESCE((_item->>'unit_price')::numeric, 0);
    _gst_pct := COALESCE((_item->>'gst_percent')::numeric, 0);
    _line_sub := _price * _qty;
    _line_gst := _line_sub * _gst_pct / 100;
    _line_total := _line_sub + _line_gst;
    INSERT INTO public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, gst_percent, line_total)
    VALUES (_invoice_id, NULL, _name, _qty, _price, _gst_pct, _line_total);
  END LOOP;

  IF _exchange_id IS NOT NULL THEN
    UPDATE public.mobile_exchanges SET invoice_id = _invoice_id, updated_at = now() WHERE id = _exchange_id;
  END IF;

  RETURN _invoice_id;
END;
$function$;