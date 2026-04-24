
-- Helper: updated_at trigger function (create if missing)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Payment fields on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_returned NUMERIC NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_payment_method_check
    CHECK (payment_method IN ('cash','card','upi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Exchanges table
CREATE TABLE IF NOT EXISTS public.mobile_exchanges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  imei TEXT NOT NULL,
  model TEXT NOT NULL,
  brand TEXT NOT NULL,
  condition_summary TEXT NOT NULL,
  valuation NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_exchanges_imei ON public.mobile_exchanges(imei);
CREATE INDEX IF NOT EXISTS idx_mobile_exchanges_phone ON public.mobile_exchanges(mobile_number);

ALTER TABLE public.mobile_exchanges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth view exchanges" ON public.mobile_exchanges;
DROP POLICY IF EXISTS "Auth insert exchanges" ON public.mobile_exchanges;
DROP POLICY IF EXISTS "Auth update exchanges" ON public.mobile_exchanges;
DROP POLICY IF EXISTS "Admin delete exchanges" ON public.mobile_exchanges;

CREATE POLICY "Auth view exchanges"
  ON public.mobile_exchanges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert exchanges"
  ON public.mobile_exchanges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update exchanges"
  ON public.mobile_exchanges FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete exchanges"
  ON public.mobile_exchanges FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_mobile_exchanges_updated_at ON public.mobile_exchanges;
CREATE TRIGGER update_mobile_exchanges_updated_at
BEFORE UPDATE ON public.mobile_exchanges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Update create_invoice RPC to accept payment fields
DROP FUNCTION IF EXISTS public.create_invoice(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_invoice(
  _customer_id uuid,
  _customer_name text,
  _customer_phone text,
  _items jsonb,
  _payment_method text DEFAULT 'cash',
  _amount_paid numeric DEFAULT 0
)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _payment_method NOT IN ('cash','card','upi') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  _invoice_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random()*10000))::text, 4, '0');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _product FROM public.products WHERE id = (_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    _qty := (_item->>'quantity')::int;
    IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    IF _product.stock_quantity < _qty THEN
      RAISE EXCEPTION 'Insufficient stock for %', _product.name;
    END IF;
    _line_sub := _product.price * _qty;
    _line_gst := _line_sub * _product.gst_percent / 100;
    _subtotal := _subtotal + _line_sub;
    _gst := _gst + _line_gst;
  END LOOP;

  _grand := _subtotal + _gst;

  IF _payment_method = 'cash' THEN
    IF _amount_paid < _grand THEN
      RAISE EXCEPTION 'Amount paid (%) is less than grand total (%)', _amount_paid, _grand;
    END IF;
    _change := _amount_paid - _grand;
  ELSE
    _amount_paid := _grand;
    _change := 0;
  END IF;

  INSERT INTO public.invoices (
    invoice_number, customer_id, customer_name, customer_phone,
    subtotal, gst_total, grand_total, created_by,
    payment_method, amount_paid, change_returned
  )
  VALUES (
    _invoice_number, _customer_id, _customer_name, _customer_phone,
    _subtotal, _gst, _grand, auth.uid(),
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
