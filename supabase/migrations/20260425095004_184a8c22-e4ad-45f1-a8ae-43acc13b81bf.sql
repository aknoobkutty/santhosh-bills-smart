-- Extend invoices to support multiple bill types (product, used_mobile, exchange, service)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS exchange_id UUID,
  ADD COLUMN IF NOT EXISTS service_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Validate invoice_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_type_check
      CHECK (invoice_type IN ('product','used_mobile','exchange','service'));
  END IF;
END $$;

-- Generic invoice creator for non-product bills (does not touch product stock)
CREATE OR REPLACE FUNCTION public.create_custom_invoice(
  _invoice_type TEXT,
  _customer_id UUID,
  _customer_name TEXT,
  _customer_phone TEXT,
  _items JSONB,
  _payment_method TEXT DEFAULT 'cash',
  _amount_paid NUMERIC DEFAULT 0,
  _exchange_id UUID DEFAULT NULL,
  _service_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _invoice_type NOT IN ('used_mobile','exchange','service') THEN
    RAISE EXCEPTION 'Invalid invoice type: %', _invoice_type;
  END IF;
  IF _payment_method NOT IN ('cash','card','upi') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

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
    payment_method, amount_paid, change_returned,
    invoice_type, exchange_id, service_id, notes
  ) VALUES (
    _invoice_number, _customer_id, _customer_name, _customer_phone,
    _subtotal, _gst, _grand, auth.uid(),
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

  -- Link back when applicable
  IF _exchange_id IS NOT NULL THEN
    UPDATE public.mobile_exchanges SET invoice_id = _invoice_id, updated_at = now() WHERE id = _exchange_id;
  END IF;

  RETURN _invoice_id;
END;
$$;