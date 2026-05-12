-- ===================================================
-- نظام متابعة حضور الموظفات - قاعدة بيانات Supabase
-- شغّل هذا الكود في Supabase > SQL Editor
-- ===================================================

-- جدول الموظفات
CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  weekly_hours INTEGER DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول سجلات الحضور
CREATE TABLE entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIME NOT NULL,
  check_out TIME,
  minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرسة للأداء
CREATE INDEX idx_entries_employee ON entries(employee_id);
CREATE INDEX idx_entries_date ON entries(date);

-- السماح بالقراءة والكتابة للجميع (بما أن التطبيق بدون تسجيل دخول)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول
CREATE POLICY "allow_all_employees" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_entries" ON entries FOR ALL USING (true) WITH CHECK (true);

-- تفعيل Realtime للتحديثات الفورية
ALTER PUBLICATION supabase_realtime ADD TABLE entries;
