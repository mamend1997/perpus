CREATE TABLE IF NOT EXISTS tenants_schools (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  school_code CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  npsn CHAR(8) NULL,
  education_level VARCHAR(16) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  website VARCHAR(255) NULL,
  address TEXT NULL,
  principal_name VARCHAR(180) NULL,
  principal_nip VARCHAR(30) NULL,
  librarian_name VARCHAR(180) NULL,
  librarian_nip VARCHAR(30) NULL,
  logo MEDIUMTEXT NULL,
  package_type ENUM('trial', 'basic', 'premium', 'lifetime') NOT NULL DEFAULT 'trial',
  status ENUM('active', 'suspended', 'pending') NOT NULL DEFAULT 'pending',
  students_count INT UNSIGNED NOT NULL DEFAULT 0,
  fine_per_day INT UNSIGNED NOT NULL DEFAULT 1000,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_schools_school_code (school_code),
  UNIQUE KEY uq_tenants_schools_npsn (npsn),
  KEY idx_tenants_status_created (status, created_at),
  KEY idx_tenants_package (package_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS super_admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  username VARCHAR(32) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  password VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_super_admins_username (username),
  UNIQUE KEY uq_super_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  role ENUM('admin', 'kepsek', 'kapus', 'member') NOT NULL DEFAULT 'member',
  is_library_member TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(180) NOT NULL,
  username VARCHAR(32) NULL,
  member_code VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  avatar MEDIUMTEXT NULL,
  password VARCHAR(255) NULL,
  photo MEDIUMTEXT NULL,
  nis_nisn VARCHAR(40) NULL,
  rombel VARCHAR(80) NULL,
  phone VARCHAR(30) NULL,
  gender ENUM('male', 'female', 'other') NULL,
  status ENUM('active', 'inactive', 'blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_school_username (school_id, username),
  UNIQUE KEY uq_users_school_member_code (school_id, member_code),
  UNIQUE KEY uq_users_school_email (school_id, email),
  UNIQUE KEY uq_users_school_nis (school_id, nis_nisn),
  UNIQUE KEY uq_users_school_id_id (school_id, id),
  KEY idx_users_school_role_status (school_id, role, status),
  CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_classes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  grade_level VARCHAR(16) NULL,
  name VARCHAR(80) NOT NULL,
  class_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_classes_name (school_id, class_name),
  KEY idx_school_classes_grade (school_id, grade_level, name),
  CONSTRAINT fk_school_classes_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_role_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  role ENUM('kepsek', 'kapus', 'member') NOT NULL,
  feature_key VARCHAR(80) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_role_feature (school_id, role, feature_key),
  KEY idx_school_role_permissions_role (school_id, role),
  CONSTRAINT fk_school_role_permissions_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  `key` VARCHAR(80) NOT NULL,
  `value` MEDIUMTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_settings_key (school_id, `key`),
  CONSTRAINT fk_school_settings_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS master_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  type ENUM('bahasa', 'jenis', 'koleksi', 'klasifikasi', 'topik', 'rak', 'pengarang', 'penerbit', 'agen') NOT NULL,
  code VARCHAR(50) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  address TEXT NULL,
  capacity INT UNSIGNED NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_master_school_type_code (school_id, type, code),
  UNIQUE KEY uq_master_school_id_id (school_id, id),
  KEY idx_master_school_type_status (school_id, type, status),
  CONSTRAINT fk_master_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS books (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  no_terima VARCHAR(60) NULL,
  received_date DATE NULL,
  nomor_induk VARCHAR(60) NULL,
  kode_buku VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  physical_description TEXT NULL,
  author_id BIGINT UNSIGNED NULL,
  publisher_id BIGINT UNSIGNED NULL,
  agent_id BIGINT UNSIGNED NULL,
  topic_id BIGINT UNSIGNED NULL,
  collection_id BIGINT UNSIGNED NULL,
  type_id BIGINT UNSIGNED NULL,
  language_id BIGINT UNSIGNED NULL,
  gmd VARCHAR(100) NULL,
  isbn VARCHAR(20) NULL,
  `year` SMALLINT UNSIGNED NULL,
  city VARCHAR(120) NULL,
  source VARCHAR(120) NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  qty INT UNSIGNED NOT NULL DEFAULT 0,
  pages SMALLINT UNSIGNED NULL,
  rack_id BIGINT UNSIGNED NULL,
  description TEXT NULL,
  synopsis TEXT NULL,
  cover_image VARCHAR(100) NULL,
  file_digital VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_books_school_induk (school_id, nomor_induk),
  UNIQUE KEY uq_books_school_id_id (school_id, id),
  KEY idx_books_school_title (school_id, title),
  KEY idx_books_school_code (school_id, kode_buku),
  KEY idx_books_author (author_id),
  KEY idx_books_publisher (publisher_id),
  KEY idx_books_collection (school_id, collection_id),
  KEY idx_books_agent (school_id, agent_id),
  KEY idx_books_topic (school_id, topic_id),
  KEY idx_books_type (school_id, type_id),
  KEY idx_books_language (school_id, language_id),
  KEY idx_books_rack (rack_id),
  CONSTRAINT fk_books_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_books_author FOREIGN KEY (school_id, author_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_publisher FOREIGN KEY (school_id, publisher_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_collection FOREIGN KEY (school_id, collection_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_agent FOREIGN KEY (school_id, agent_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_topic FOREIGN KEY (school_id, topic_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_type FOREIGN KEY (school_id, type_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_language FOREIGN KEY (school_id, language_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_rack FOREIGN KEY (school_id, rack_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(50) NOT NULL,
  rack_id BIGINT UNSIGNED NULL,
  status ENUM('Tersedia', 'Dipinjam', 'Rusak') NOT NULL DEFAULT 'Tersedia',
  PRIMARY KEY (id),
  UNIQUE KEY uq_book_items_serial (book_id, serial_number),
  UNIQUE KEY uq_book_items_school_id_id (school_id, id),
  KEY idx_book_items_school_status (school_id, status),
  KEY idx_book_items_rack_status (school_id, rack_id, status),
  CONSTRAINT fk_book_items_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_items_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_items_rack FOREIGN KEY (school_id, rack_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  quantity_added INT UNSIGNED NOT NULL,
  previous_qty INT UNSIGNED NOT NULL,
  resulting_qty INT UNSIGNED NOT NULL,
  stock_date DATE NOT NULL,
  note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_book_stock_movements_school_book (school_id, book_id, created_at),
  CONSTRAINT fk_book_stock_movements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_stock_movements_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_stock_movements_actor FOREIGN KEY (actor_id) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_rack_transfers (
   id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
   school_id BIGINT UNSIGNED NOT NULL,
   book_id BIGINT UNSIGNED NOT NULL,
   from_rack_id BIGINT UNSIGNED NULL,
   to_rack_id BIGINT UNSIGNED NOT NULL,
   moved_by BIGINT UNSIGNED NULL,
   quantity INT UNSIGNED NOT NULL,
   note VARCHAR(500) NULL,
   moved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (id),
   KEY idx_rack_transfers_school_time (school_id, moved_at),
   KEY idx_rack_transfers_book_time (school_id, book_id, moved_at),
   CONSTRAINT fk_rack_transfers_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
   CONSTRAINT fk_rack_transfers_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id) ON DELETE CASCADE,
   CONSTRAINT fk_rack_transfers_from_rack FOREIGN KEY (school_id, from_rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
   CONSTRAINT fk_rack_transfers_to_rack FOREIGN KEY (school_id, to_rack_id) REFERENCES master_categories (school_id, id) ON DELETE RESTRICT,
   CONSTRAINT fk_rack_transfers_actor FOREIGN KEY (moved_by) REFERENCES users (id) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  book_item_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  borrow_date DATE NOT NULL,
  due_date DATE NOT NULL,
  return_date DATE NULL,
  status ENUM('Pending', 'Borrowed', 'Returned', 'Rejected') NOT NULL DEFAULT 'Pending',
  fine_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  fine_status ENUM('unpaid', 'paid', 'waived') NOT NULL DEFAULT 'unpaid',
  renewal_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_loans_school_status_due (school_id, status, due_date),
  KEY idx_loans_school_borrow_date (school_id, borrow_date),
  KEY idx_loans_school_return_date (school_id, return_date),
  KEY idx_loans_user_date (user_id, borrow_date),
  KEY idx_loans_item_status (book_item_id, status),
  CONSTRAINT fk_loans_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_loans_item FOREIGN KEY (school_id, book_item_id) REFERENCES book_items (school_id, id),
  CONSTRAINT fk_loans_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_fine_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  loan_id BIGINT UNSIGNED NOT NULL,
  paid_by BIGINT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash') NOT NULL DEFAULT 'cash',
  note VARCHAR(500) NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_fine_payments_loan (loan_id),
  KEY idx_loan_fine_payments_school_paid (school_id, paid_at),
  CONSTRAINT fk_loan_fine_payments_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_loan_fine_payments_loan FOREIGN KEY (loan_id) REFERENCES loans (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_loan_fine_payments_actor FOREIGN KEY (paid_by) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procurements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  request_type ENUM('existing', 'new') NOT NULL DEFAULT 'new',
  book_id BIGINT UNSIGNED NULL,
  requester_name VARCHAR(180) NULL,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(180) NULL,
  publisher VARCHAR(180) NULL,
  `year` SMALLINT UNSIGNED NULL,
  quantity_needed INT UNSIGNED NOT NULL DEFAULT 1,
  estimated_price DECIMAL(12,2) NULL,
  request_date DATE NOT NULL,
  status ENUM('Pending', 'Diterima', 'Ditolak') NOT NULL DEFAULT 'Pending',
  notes TEXT NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_procurements_school_status (school_id, status, created_at),
  KEY idx_procurements_book (book_id),
  CONSTRAINT fk_procurements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_procurements_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id),
  CONSTRAINT fk_procurements_book FOREIGN KEY (book_id) REFERENCES books (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visitors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  visit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purpose VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_visitors_school_date (school_id, visit_date),
  KEY idx_visitors_school_user_date (school_id, user_id, visit_date),
  CONSTRAINT fk_visitors_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_visitors_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_book_reviews_school_book_user (school_id, book_id, user_id),
  KEY idx_book_reviews_school_created (school_id, created_at),
  CONSTRAINT fk_book_reviews_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_reviews_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_reviews_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
    ON DELETE CASCADE,
  CONSTRAINT chk_book_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  notes TEXT NULL,
  reservation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expired_date DATETIME NULL,
  ready_notified_at DATETIME NULL,
  status ENUM('Active', 'Fulfilled', 'Cancelled') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (id),
  KEY idx_reservations_school_status_date (school_id, status, reservation_date),
  KEY idx_reservations_school_expired (school_id, status, expired_date),
  KEY idx_reservations_school_user (school_id, user_id, status),
  CONSTRAINT fk_reservations_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reservations_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reservations_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message VARCHAR(500) NOT NULL,
  link VARCHAR(500) NULL,
  dedupe_key VARCHAR(120) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_notifications_dedupe (school_id, user_id, dedupe_key),
  KEY idx_school_notifications_user_created (school_id, user_id, created_at),
  CONSTRAINT fk_school_notifications_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_school_notifications_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  admin_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Informasi',
  target_audience ENUM('all', 'students', 'staff') NOT NULL DEFAULT 'all',
  status ENUM('Draft', 'Published') NOT NULL DEFAULT 'Draft',
  start_date DATETIME NULL,
  end_date DATETIME NULL,
  banner MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_announcements_school_created (school_id, created_at),
  KEY idx_announcements_school_status_dates (school_id, status, start_date, end_date),
  CONSTRAINT fk_announcements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_announcements_admin FOREIGN KEY (admin_id) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  students_archived_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_years_school_label (school_id, label),
  KEY idx_school_years_school_dates (school_id, start_date, end_date),
  CONSTRAINT fk_school_years_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_school_years_creator FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_year_student_archives (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  school_year_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  nis_nisn VARCHAR(40) NULL,
  name VARCHAR(180) NOT NULL,
  email VARCHAR(190) NULL,
  rombel VARCHAR(80) NULL,
  phone VARCHAR(30) NULL,
  gender ENUM('male', 'female', 'other') NULL,
  status ENUM('active', 'inactive', 'blocked') NOT NULL,
  promotion_status ENUM('promoted', 'graduated') NOT NULL,
  next_rombel VARCHAR(80) NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_year_student_archive (school_id, school_year_id, student_id),
  KEY idx_school_year_archive_roster (school_id, school_year_id, rombel, name),
  CONSTRAINT fk_school_year_student_archive_school
    FOREIGN KEY (school_id) REFERENCES tenants_schools (id) ON DELETE CASCADE,
  CONSTRAINT fk_school_year_student_archive_year
    FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('unpaid', 'paid', 'pending_verification') NOT NULL DEFAULT 'unpaid',
  due_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoices_status_due (status, due_date),
  KEY idx_invoices_school_created (school_id, created_at),
  CONSTRAINT fk_invoices_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_check_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NULL,
  open_invoice_count INT UNSIGNED NOT NULL DEFAULT 0,
  overdue_invoice_count INT UNSIGNED NOT NULL DEFAULT 0,
  open_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  new_invoice_count INT UNSIGNED NOT NULL DEFAULT 0,
  suspended_school_count INT UNSIGNED NOT NULL DEFAULT 0,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_billing_check_runs_checked (checked_at, id),
  CONSTRAINT fk_billing_check_runs_admin FOREIGN KEY (admin_id) REFERENCES super_admins (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('open', 'responded', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tickets_status_created (status, created_at),
  KEY idx_tickets_school (school_id),
  CONSTRAINT fk_tickets_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NULL,
  activity VARCHAR(500) NOT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_admin_created (admin_id, created_at),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES super_admins (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  key_name VARCHAR(120) NOT NULL,
  `value` MEDIUMTEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_platform_settings_key (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
