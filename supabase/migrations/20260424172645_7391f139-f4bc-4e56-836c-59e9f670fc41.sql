CREATE TABLE public.mobile_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  device_model TEXT NOT NULL,
  brand TEXT NOT NULL,
  imei TEXT,
  problem_description TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'hardware',
  service_status TEXT NOT NULL DEFAULT 'pending',
  estimated_cost NUMERIC NOT NULL DEFAULT 0,
  final_cost NUMERIC NOT NULL DEFAULT 0,
  technician_name TEXT,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  password_type TEXT NOT NULL DEFAULT 'none',
  password_value TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_type_chk CHECK (service_type IN ('hardware','software','both')),
  CONSTRAINT service_status_chk CHECK (service_status IN ('pending','in_progress','completed','delivered','cancelled')),
  CONSTRAINT password_type_chk CHECK (password_type IN ('pattern','alphanumeric','pin','not_preferred','none'))
);

ALTER TABLE public.mobile_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view services" ON public.mobile_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert services" ON public.mobile_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update services" ON public.mobile_services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete services" ON public.mobile_services FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_mobile_services_updated_at
BEFORE UPDATE ON public.mobile_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();