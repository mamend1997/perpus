CREATE TABLE IF NOT EXISTS tenants_schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT COLLATE NOCASE NOT NULL,
  school_code TEXT COLLATE BINARY NOT NULL,
  npsn TEXT COLLATE NOCASE NULL,
  education_level TEXT COLLATE NOCASE NULL,
  phone TEXT COLLATE NOCASE NULL,
  email TEXT COLLATE NOCASE NULL,
  website TEXT COLLATE NOCASE NULL,
  address TEXT COLLATE NOCASE NULL,
  principal_name TEXT COLLATE NOCASE NULL,
  principal_nip TEXT COLLATE NOCASE NULL,
  librarian_name TEXT COLLATE NOCASE NULL,
  librarian_nip TEXT COLLATE NOCASE NULL,
  logo TEXT COLLATE NOCASE NULL,
  package_type TEXT COLLATE NOCASE CHECK (package_type IN ('trial', 'basic', 'premium', 'lifetime')) NOT NULL DEFAULT 'trial',
  status TEXT COLLATE NOCASE CHECK (status IN ('active', 'suspended', 'pending')) NOT NULL DEFAULT 'pending',
  students_count INTEGER NOT NULL DEFAULT 0,
  fine_per_day INTEGER NOT NULL DEFAULT 1000,
  subscription_expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tenants_schools_school_code UNIQUE (school_code),
  CONSTRAINT uq_tenants_schools_npsn UNIQUE (npsn)
);

CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT COLLATE NOCASE NOT NULL,
  username TEXT COLLATE NOCASE NOT NULL,
  email TEXT COLLATE NOCASE NULL,
  phone TEXT COLLATE NOCASE NULL,
  password TEXT COLLATE NOCASE NOT NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_super_admins_username UNIQUE (username),
  CONSTRAINT uq_super_admins_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  role TEXT COLLATE NOCASE CHECK (role IN ('admin', 'kepsek', 'kapus', 'member')) NOT NULL DEFAULT 'member',
  is_library_member INTEGER NOT NULL DEFAULT 0,
  name TEXT COLLATE NOCASE NOT NULL,
  username TEXT COLLATE NOCASE NULL,
  member_code TEXT COLLATE NOCASE NULL,
  email TEXT COLLATE NOCASE NULL,
  avatar TEXT COLLATE NOCASE NULL,
  password TEXT COLLATE NOCASE NULL,
  photo TEXT COLLATE NOCASE NULL,
  nis_nisn TEXT COLLATE NOCASE NULL,
  rombel TEXT COLLATE NOCASE NULL,
  phone TEXT COLLATE NOCASE NULL,
  gender TEXT COLLATE NOCASE CHECK (gender IN ('male', 'female', 'other')) NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('active', 'inactive', 'blocked')) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_school_username UNIQUE (school_id, username),
  CONSTRAINT uq_users_school_member_code UNIQUE (school_id, member_code),
  CONSTRAINT uq_users_school_email UNIQUE (school_id, email),
  CONSTRAINT uq_users_school_nis UNIQUE (school_id, nis_nisn),
  CONSTRAINT uq_users_school_id_id UNIQUE (school_id, id),
  CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS school_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  grade_level TEXT COLLATE NOCASE NULL,
  name TEXT COLLATE NOCASE NOT NULL,
  class_name TEXT COLLATE NOCASE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_classes_name UNIQUE (school_id, class_name),
  CONSTRAINT fk_school_classes_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS school_role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  role TEXT COLLATE NOCASE CHECK (role IN ('kepsek', 'kapus', 'member')) NOT NULL,
  feature_key TEXT COLLATE NOCASE NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_role_feature UNIQUE (school_id, role, feature_key),
  CONSTRAINT fk_school_role_permissions_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS school_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  `key` TEXT COLLATE NOCASE NOT NULL,
  `value` TEXT COLLATE NOCASE NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_settings_key UNIQUE (school_id, `key`),
  CONSTRAINT fk_school_settings_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS master_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  type TEXT COLLATE NOCASE CHECK (type IN ('bahasa', 'jenis', 'koleksi', 'klasifikasi', 'topik', 'rak', 'pengarang', 'penerbit', 'agen')) NOT NULL,
  code TEXT COLLATE NOCASE NULL,
  name TEXT COLLATE NOCASE NOT NULL,
  description TEXT COLLATE NOCASE NULL,
  email TEXT COLLATE NOCASE NULL,
  phone TEXT COLLATE NOCASE NULL,
  address TEXT COLLATE NOCASE NULL,
  capacity INTEGER NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_master_school_type_code UNIQUE (school_id, type, code),
  CONSTRAINT uq_master_school_id_id UNIQUE (school_id, id),
  CONSTRAINT fk_master_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  no_terima TEXT COLLATE NOCASE NULL,
  received_date DATE NULL,
  nomor_induk TEXT COLLATE NOCASE NULL,
  kode_buku TEXT COLLATE NOCASE NULL,
  title TEXT COLLATE NOCASE NOT NULL,
  physical_description TEXT COLLATE NOCASE NULL,
  author_id INTEGER NULL,
  publisher_id INTEGER NULL,
  agent_id INTEGER NULL,
  topic_id INTEGER NULL,
  collection_id INTEGER NULL,
  type_id INTEGER NULL,
  language_id INTEGER NULL,
  gmd TEXT COLLATE NOCASE NULL,
  isbn TEXT COLLATE NOCASE NULL,
  `year` INTEGER NULL,
  city TEXT COLLATE NOCASE NULL,
  source TEXT COLLATE NOCASE NULL,
  price REAL NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NULL,
  rack_id INTEGER NULL,
  description TEXT COLLATE NOCASE NULL,
  synopsis TEXT COLLATE NOCASE NULL,
  cover_image TEXT COLLATE NOCASE NULL,
  file_digital TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_books_school_induk UNIQUE (school_id, nomor_induk),
  CONSTRAINT uq_books_school_id_id UNIQUE (school_id, id),
  CONSTRAINT fk_books_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_books_author FOREIGN KEY (school_id, author_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_publisher FOREIGN KEY (school_id, publisher_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_collection FOREIGN KEY (school_id, collection_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_agent FOREIGN KEY (school_id, agent_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_topic FOREIGN KEY (school_id, topic_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_type FOREIGN KEY (school_id, type_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_language FOREIGN KEY (school_id, language_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_books_rack FOREIGN KEY (school_id, rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS book_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  serial_number TEXT COLLATE NOCASE NOT NULL,
  barcode_value TEXT COLLATE NOCASE NOT NULL,
  rack_id INTEGER NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('Tersedia', 'Dipinjam', 'Rusak', 'Hilang')) NOT NULL DEFAULT 'Tersedia',
  `condition` TEXT COLLATE NOCASE CHECK (`condition` IN ('Baik', 'Rusak Ringan', 'Rusak Berat')) NOT NULL DEFAULT 'Baik',
  destroyed_at DATETIME NULL,
  lost_date DATE NULL,
  found_date DATE NULL,
  lost_previous_status TEXT COLLATE NOCASE CHECK (lost_previous_status IN ('Tersedia', 'Rusak')) NULL,
  CONSTRAINT uq_book_items_serial UNIQUE (book_id, serial_number),
  CONSTRAINT uq_book_items_school_id_id UNIQUE (school_id, id),
  CONSTRAINT uq_book_items_school_barcode UNIQUE (school_id, barcode_value),
  CONSTRAINT fk_book_items_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_items_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_book_items_rack FOREIGN KEY (school_id, rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS book_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  actor_id INTEGER NULL,
  quantity_added INTEGER NOT NULL,
  quantity_removed INTEGER NOT NULL DEFAULT 0,
  previous_qty INTEGER NOT NULL,
  resulting_qty INTEGER NOT NULL,
  stock_date DATE NOT NULL,
  note TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_book_stock_movements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_stock_movements_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_book_stock_movements_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS book_destructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  rack_id INTEGER NULL,
  actor_id INTEGER NULL,
  quantity INTEGER NOT NULL,
  destruction_date DATE NOT NULL,
  reason TEXT COLLATE NOCASE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_book_destructions_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_destructions_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_book_destructions_rack FOREIGN KEY (school_id, rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_book_destructions_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS school_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER NULL,
  event_type TEXT COLLATE NOCASE CHECK (event_type IN ('login', 'page_view', 'change')) NOT NULL,
  activity TEXT COLLATE NOCASE NOT NULL,
  route TEXT COLLATE NOCASE NULL,
  ip_address TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_activity_logs_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_activity_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS book_rack_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  from_rack_id INTEGER NULL,
  to_rack_id INTEGER NOT NULL,
  moved_by INTEGER NULL,
  quantity INTEGER NOT NULL,
  note TEXT COLLATE NOCASE NULL,
  moved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rack_transfers_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_rack_transfers_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_rack_transfers_from_rack FOREIGN KEY (school_id, from_rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_rack_transfers_to_rack FOREIGN KEY (school_id, to_rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_rack_transfers_actor FOREIGN KEY (moved_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_item_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  borrow_date DATE NOT NULL,
  due_date DATE NOT NULL,
  return_date DATE NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('Pending', 'Borrowed', 'Returned', 'Rejected')) NOT NULL DEFAULT 'Pending',
  fine_amount REAL NOT NULL DEFAULT 0,
  fine_status TEXT COLLATE NOCASE CHECK (fine_status IN ('unpaid', 'paid', 'waived')) NOT NULL DEFAULT 'unpaid',
  renewal_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_loans_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_loans_item FOREIGN KEY (school_id, book_item_id) REFERENCES book_items (school_id, id),
  CONSTRAINT fk_loans_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
);

CREATE TABLE IF NOT EXISTS loan_renewal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  loan_id INTEGER NOT NULL,
  days INTEGER NOT NULL,
  previous_due_date DATE NOT NULL,
  new_due_date DATE NOT NULL,
  note TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_loan_renewal_history_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_loan_renewal_history_loan FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loan_fine_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  loan_id INTEGER NOT NULL,
  paid_by INTEGER NULL,
  amount REAL NOT NULL,
  payment_method TEXT COLLATE NOCASE CHECK (payment_method IN ('cash')) NOT NULL DEFAULT 'cash',
  note TEXT COLLATE NOCASE NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_loan_fine_payments_loan UNIQUE (loan_id),
  CONSTRAINT fk_loan_fine_payments_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_loan_fine_payments_loan FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE CASCADE,
  CONSTRAINT fk_loan_fine_payments_actor FOREIGN KEY (paid_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS procurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  request_type TEXT COLLATE NOCASE CHECK (request_type IN ('existing', 'new')) NOT NULL DEFAULT 'new',
  book_id INTEGER NULL,
  requester_name TEXT COLLATE NOCASE NULL,
  title TEXT COLLATE NOCASE NOT NULL,
  author TEXT COLLATE NOCASE NULL,
  publisher TEXT COLLATE NOCASE NULL,
  `year` INTEGER NULL,
  quantity_needed INTEGER NOT NULL DEFAULT 1,
  estimated_price REAL NULL,
  request_date DATE NOT NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('Pending', 'Diterima', 'Ditolak')) NOT NULL DEFAULT 'Pending',
  notes TEXT COLLATE NOCASE NULL,
  review_notes TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_procurements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_procurements_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id),
  CONSTRAINT fk_procurements_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER NULL,
  visit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purpose TEXT COLLATE NOCASE NULL,
  CONSTRAINT fk_visitors_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_visitors_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS book_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  review TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_book_reviews_school_book_user UNIQUE (school_id, book_id, user_id),
  CONSTRAINT fk_book_reviews_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_reviews_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_book_reviews_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_book_reviews_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS book_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT COLLATE NOCASE NULL,
  reservation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expired_date DATETIME NULL,
  ready_notified_at DATETIME NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('Active', 'Fulfilled', 'Cancelled')) NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_reservations_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_reservations_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_reservations_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS school_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT COLLATE NOCASE NOT NULL,
  title TEXT COLLATE NOCASE NOT NULL,
  message TEXT COLLATE NOCASE NOT NULL,
  link TEXT COLLATE NOCASE NULL,
  dedupe_key TEXT COLLATE NOCASE NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_notifications_dedupe UNIQUE (school_id, user_id, dedupe_key),
  CONSTRAINT fk_school_notifications_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_notifications_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  admin_id INTEGER NULL,
  title TEXT COLLATE NOCASE NOT NULL,
  content TEXT COLLATE NOCASE NOT NULL,
  category TEXT COLLATE NOCASE NOT NULL DEFAULT 'Informasi',
  target_audience TEXT COLLATE NOCASE CHECK (target_audience IN ('all', 'students', 'staff')) NOT NULL DEFAULT 'all',
  status TEXT COLLATE NOCASE CHECK (status IN ('Draft', 'Published')) NOT NULL DEFAULT 'Draft',
  start_date DATETIME NULL,
  end_date DATETIME NULL,
  banner TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_announcements_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS school_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  label TEXT COLLATE NOCASE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  students_archived_at DATETIME NULL,
  created_by INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_years_school_label UNIQUE (school_id, label),
  CONSTRAINT fk_school_years_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_years_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS school_year_student_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  school_year_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  nis_nisn TEXT COLLATE NOCASE NULL,
  name TEXT COLLATE NOCASE NOT NULL,
  email TEXT COLLATE NOCASE NULL,
  rombel TEXT COLLATE NOCASE NULL,
  phone TEXT COLLATE NOCASE NULL,
  gender TEXT COLLATE NOCASE CHECK (gender IN ('male', 'female', 'other')) NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('active', 'inactive', 'blocked')) NOT NULL,
  promotion_status TEXT COLLATE NOCASE CHECK (promotion_status IN ('promoted', 'graduated')) NOT NULL,
  next_rombel TEXT COLLATE NOCASE NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_year_student_archive UNIQUE (school_id, school_year_id, student_id),
  CONSTRAINT fk_school_year_student_archive_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_year_student_archive_year FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('unpaid', 'paid', 'pending_verification', 'failed', 'expired')) NOT NULL DEFAULT 'unpaid',
  due_date DATE NOT NULL,
  package_type TEXT COLLATE NOCASE CHECK (package_type IN ('trial', 'basic', 'premium', 'lifetime')) NULL,
  billing_period TEXT COLLATE NOCASE CHECK (billing_period IN ('monthly', 'semester', 'yearly', 'once')) NULL,
  payment_provider TEXT COLLATE NOCASE CHECK (payment_provider IN ('manual', 'kasera')) NOT NULL DEFAULT 'manual',
  provider_payment_id TEXT COLLATE NOCASE NULL,
  checkout_url TEXT COLLATE NOCASE NULL,
  expires_at DATETIME NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_invoices_provider_payment_id UNIQUE (provider_payment_id),
  CONSTRAINT fk_invoices_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kasera_webhook_events (
  event_id TEXT COLLATE NOCASE NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id)
);

CREATE TABLE IF NOT EXISTS billing_check_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NULL,
  open_invoice_count INTEGER NOT NULL DEFAULT 0,
  overdue_invoice_count INTEGER NOT NULL DEFAULT 0,
  open_amount REAL NOT NULL DEFAULT 0,
  new_invoice_count INTEGER NOT NULL DEFAULT 0,
  suspended_school_count INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_check_runs_admin FOREIGN KEY (admin_id) REFERENCES super_admins (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  subject TEXT COLLATE NOCASE NOT NULL,
  status TEXT COLLATE NOCASE CHECK (status IN ('open', 'responded', 'closed')) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  sender_type TEXT COLLATE NOCASE CHECK (sender_type IN ('school', 'admin')) NOT NULL,
  user_id INTEGER NULL,
  admin_id INTEGER NULL,
  message TEXT COLLATE NOCASE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES platform_tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_messages_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_messages_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_ticket_messages_admin FOREIGN KEY (admin_id) REFERENCES super_admins (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NULL,
  activity TEXT COLLATE NOCASE NOT NULL,
  ip_address TEXT COLLATE NOCASE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES super_admins (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_name TEXT COLLATE NOCASE NOT NULL,
  `value` TEXT COLLATE NOCASE NULL,
  CONSTRAINT uq_platform_settings_key UNIQUE (key_name)
);

CREATE TABLE IF NOT EXISTS school_support_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_by_admin_id INTEGER NULL,
  code_hash TEXT COLLATE BINARY NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_school_support_sessions_code_hash UNIQUE (code_hash),
  CONSTRAINT fk_school_support_sessions_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_support_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_support_sessions_admin FOREIGN KEY (created_by_admin_id) REFERENCES super_admins (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS school_registration_otps (
  id TEXT COLLATE BINARY NOT NULL,
  phone TEXT COLLATE NOCASE NOT NULL,
  code_hash TEXT COLLATE BINARY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS platform_payment_reminder_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  reminder_kind TEXT COLLATE NOCASE CHECK (reminder_kind IN ('before_due', 'overdue')) NOT NULL,
  recipient TEXT COLLATE NOCASE NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_platform_payment_reminder_invoice_kind UNIQUE (invoice_id, reminder_kind),
  CONSTRAINT fk_platform_payment_reminder_invoice FOREIGN KEY (invoice_id) REFERENCES tenant_invoices (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenants_status_created ON tenants_schools (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tenants_package ON tenants_schools (package_type);
CREATE INDEX IF NOT EXISTS idx_users_school_role_status ON users (school_id, role, status);
CREATE INDEX IF NOT EXISTS idx_school_classes_grade ON school_classes (school_id, grade_level, name);
CREATE INDEX IF NOT EXISTS idx_school_role_permissions_role ON school_role_permissions (school_id, role);
CREATE INDEX IF NOT EXISTS idx_master_school_type_status ON master_categories (school_id, type, status);
CREATE INDEX IF NOT EXISTS idx_books_school_title ON books (school_id, title);
CREATE INDEX IF NOT EXISTS idx_books_school_code ON books (school_id, kode_buku);
CREATE INDEX IF NOT EXISTS idx_books_author ON books (author_id);
CREATE INDEX IF NOT EXISTS idx_books_publisher ON books (publisher_id);
CREATE INDEX IF NOT EXISTS idx_books_collection ON books (school_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_books_agent ON books (school_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_books_topic ON books (school_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_books_type ON books (school_id, type_id);
CREATE INDEX IF NOT EXISTS idx_books_language ON books (school_id, language_id);
CREATE INDEX IF NOT EXISTS idx_books_rack ON books (rack_id);
CREATE INDEX IF NOT EXISTS idx_book_items_school_status ON book_items (school_id, status);
CREATE INDEX IF NOT EXISTS idx_book_items_rack_status ON book_items (school_id, rack_id, status);
CREATE INDEX IF NOT EXISTS idx_book_items_destruction ON book_items (school_id, book_id, rack_id, destroyed_at, status);
CREATE INDEX IF NOT EXISTS idx_book_stock_movements_school_book ON book_stock_movements (school_id, book_id, created_at);
CREATE INDEX IF NOT EXISTS idx_book_destructions_school_date ON book_destructions (school_id, destruction_date, id);
CREATE INDEX IF NOT EXISTS idx_book_destructions_book ON book_destructions (school_id, book_id, id);
CREATE INDEX IF NOT EXISTS idx_school_activity_logs_created ON school_activity_logs (school_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_school_activity_logs_user ON school_activity_logs (school_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rack_transfers_school_time ON book_rack_transfers (school_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_rack_transfers_book_time ON book_rack_transfers (school_id, book_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_loans_school_status_due ON loans (school_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_loans_school_borrow_date ON loans (school_id, borrow_date);
CREATE INDEX IF NOT EXISTS idx_loans_school_return_date ON loans (school_id, return_date);
CREATE INDEX IF NOT EXISTS idx_loans_user_date ON loans (user_id, borrow_date);
CREATE INDEX IF NOT EXISTS idx_loans_item_status ON loans (book_item_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_renewal_history_school_loan ON loan_renewal_history (school_id, loan_id, id);
CREATE INDEX IF NOT EXISTS idx_loan_fine_payments_school_paid ON loan_fine_payments (school_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_procurements_school_status ON procurements (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_procurements_book ON procurements (book_id);
CREATE INDEX IF NOT EXISTS idx_visitors_school_date ON visitors (school_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_visitors_school_user_date ON visitors (school_id, user_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_book_reviews_school_created ON book_reviews (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reservations_school_status_date ON book_reservations (school_id, status, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_school_expired ON book_reservations (school_id, status, expired_date);
CREATE INDEX IF NOT EXISTS idx_reservations_school_user ON book_reservations (school_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_school_notifications_user_created ON school_notifications (school_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_school_created ON announcements (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_school_status_dates ON announcements (school_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_school_years_school_dates ON school_years (school_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_school_year_archive_roster ON school_year_student_archives (school_id, school_year_id, rombel, name);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON tenant_invoices (status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_school_created ON tenant_invoices (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_check_runs_checked ON billing_check_runs (checked_at, id);
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON platform_tickets (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_school ON platform_tickets (school_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON platform_ticket_messages (ticket_id, id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_school ON platform_ticket_messages (school_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_admin_created ON audit_logs (admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_school_support_sessions_expiry ON school_support_sessions (expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_school_registration_otps_phone_created ON school_registration_otps (phone, created_at);
CREATE INDEX IF NOT EXISTS idx_school_registration_otps_expiry ON school_registration_otps (expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_platform_payment_reminder_sent ON platform_payment_reminder_logs (sent_at);

CREATE TRIGGER IF NOT EXISTS trg_school_role_permissions_updated_at
AFTER UPDATE ON school_role_permissions
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE school_role_permissions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_school_settings_updated_at
AFTER UPDATE ON school_settings
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE school_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_announcements_updated_at
AFTER UPDATE ON announcements
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE announcements SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
