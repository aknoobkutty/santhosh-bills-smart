-- Drop old check constraint
ALTER TABLE public.mobile_exchanges DROP CONSTRAINT IF EXISTS mobile_exchanges_status_check;

-- Migrate existing values
UPDATE public.mobile_exchanges SET status = 'available' WHERE status IN ('accepted','rejected');
UPDATE public.mobile_exchanges SET status = 'on_hand' WHERE status = 'pending';

-- Set default and add new constraint
ALTER TABLE public.mobile_exchanges ALTER COLUMN status SET DEFAULT 'available';
ALTER TABLE public.mobile_exchanges ADD CONSTRAINT mobile_exchanges_status_check
  CHECK (status IN ('available','on_hand','sold_out'));

-- Auto-mark sold_out when invoice is created for an exchange
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
    UPDATE public.mobile_exchanges
    SET invoice_id = _invoice_id, status = 'sold_out', updated_at = now()
    WHERE id = _exchange_id;
  END IF;

  RETURN _invoice_id;
END;
$function$;