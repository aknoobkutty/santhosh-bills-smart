-- Hot list / sort indexes
CREATE INDEX IF NOT EXISTS idx_invoices_created_at_desc ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON public.invoices (invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices (customer_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items (product_id);

CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON public.products (lower(name));
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);

CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc ON public.customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);

CREATE INDEX IF NOT EXISTS idx_exchanges_created_at_desc ON public.mobile_exchanges (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchanges_status ON public.mobile_exchanges (status);

CREATE INDEX IF NOT EXISTS idx_services_created_at_desc ON public.mobile_services (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_services_status ON public.mobile_services (service_status);

CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice_id ON public.sales_returns (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_return_date ON public.sales_returns (return_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON public.attendance (staff_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance (attendance_date);

CREATE INDEX IF NOT EXISTS idx_salary_staff_month ON public.salary_records (staff_id, month);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);