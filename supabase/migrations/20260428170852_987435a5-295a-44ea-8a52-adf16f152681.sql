
CREATE TABLE public.sales_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  invoice_id UUID NOT NULL,
  invoice_item_id UUID,
  product_id UUID,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0,
  gst_percent NUMERIC NOT NULL DEFAULT 0,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  return_reason TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_returns_invoice ON public.sales_returns(invoice_id);
CREATE INDEX idx_sales_returns_product ON public.sales_returns(product_id);
CREATE INDEX idx_sales_returns_date ON public.sales_returns(return_date);

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view sales returns" ON public.sales_returns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth insert sales returns" ON public.sales_returns
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin delete sales returns" ON public.sales_returns
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sales_returns_updated_at
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: create a sales return atomically
CREATE OR REPLACE FUNCTION public.create_sales_return(
  _invoice_id UUID,
  _items JSONB,
  _payment_method TEXT DEFAULT 'cash',
  _return_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _return_number TEXT;
  _item JSONB;
  _invoice_item RECORD;
  _qty INT;
  _already_returned INT;
  _line_sub NUMERIC;
  _line_gst NUMERIC;
  _line_refund NUMERIC;
  _total_refund NUMERIC := 0;
  _first_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _payment_method NOT IN ('cash','card','upi','store_credit') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  _return_number := 'RET-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random()*10000))::text, 4, '0');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_item->>'quantity')::int, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid return quantity'; END IF;

    SELECT * INTO _invoice_item
    FROM public.invoice_items
    WHERE id = (_item->>'invoice_item_id')::uuid AND invoice_id = _invoice_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice line not found'; END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO _already_returned
    FROM public.sales_returns
    WHERE invoice_id = _invoice_id
      AND COALESCE(invoice_item_id::text, '') = COALESCE(_invoice_item.id::text, '');

    IF _already_returned + _qty > _invoice_item.quantity THEN
      RAISE EXCEPTION 'Return quantity exceeds remaining for %', _invoice_item.product_name;
    END IF;

    _line_sub := _invoice_item.unit_price * _qty;
    _line_gst := _line_sub * _invoice_item.gst_percent / 100;
    _line_refund := _line_sub + _line_gst;
    _total_refund := _total_refund + _line_refund;

    INSERT INTO public.sales_returns (
      return_number, invoice_id, invoice_item_id, product_id, product_name,
      quantity, unit_price, gst_percent, refund_amount,
      return_reason, payment_method, created_by
    ) VALUES (
      _return_number, _invoice_id, _invoice_item.id, _invoice_item.product_id, _invoice_item.product_name,
      _qty, _invoice_item.unit_price, _invoice_item.gst_percent, _line_refund,
      _return_reason, _payment_method, auth.uid()
    ) RETURNING id INTO _first_id;

    -- Restock if product still exists
    IF _invoice_item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity + _qty, updated_at = now()
      WHERE id = _invoice_item.product_id;
    END IF;
  END LOOP;

  RETURN _first_id;
END;
$$;
