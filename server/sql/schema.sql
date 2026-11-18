CREATE TABLE IF NOT EXISTS tenants_schools (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  npsn CHAR(8) NULL,
  address TEXT NULL,
  logo VARCHAR(500) NULL,
  package_type ENUM('trial', 'basic', 'premium', 'lifetime') NOT NULL DEFAULT 'trial',
  status ENUM('active', 'suspended', 'pending') NOT NULL DEFAULT 'pending',
  students_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_schools_npsn (npsn),
  KEY idx_tenants_status_created (status, created_at),
  KEY idx_tenants_package (package_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS super_admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_super_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  role ENUM('admin', 'kepsek', 'kapus', 'member') NOT NULL DEFAULT 'member',
  name VARCHAR(180) NOT NULL,
  email VARCHAR(190) NULL,
  password VARCHAR(255) NOT NULL,
  nis_nisn VARCHAR(40) NULL,
  rombel VARCHAR(80) NULL,
  phone VARCHAR(30) NULL,
  gender ENUM('male', 'female', 'other') NULL,
  status ENUM('active', 'inactive', 'blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_school_email (school_id, email),
  UNIQUE KEY uq_users_school_nis (school_id, nis_nisn),
  UNIQUE KEY uq_users_school_id_id (school_id, id),
  KEY idx_users_school_role_status (school_id, role, status),
  CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS master_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  type ENUM('bahasa', 'jenis', 'koleksi', 'klasifikasi', 'topik', 'rak', 'pengarang', 'penerbit', 'agen') NOT NULL,
  code VARCHAR(50) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
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
  nomor_induk VARCHAR(60) NULL,
  kode_buku VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  author_id BIGINT UNSIGNED NULL,
  publisher_id BIGINT UNSIGNED NULL,
  isbn VARCHAR(20) NULL,
  `year` YEAR NULL,
  city VARCHAR(120) NULL,
  source VARCHAR(120) NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  qty INT UNSIGNED NOT NULL DEFAULT 0,
  pages SMALLINT UNSIGNED NULL,
  rack_id BIGINT UNSIGNED NULL,
  description TEXT NULL,
  synopsis TEXT NULL,
  file_digital VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_books_school_induk (school_id, nomor_induk),
  UNIQUE KEY uq_books_school_id_id (school_id, id),
  KEY idx_books_school_title (school_id, title),
  KEY idx_books_school_code (school_id, kode_buku),
  KEY idx_books_author (author_id),
  KEY idx_books_publisher (publisher_id),
  KEY idx_books_rack (rack_id),
  CONSTRAINT fk_books_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_books_author FOREIGN KEY (school_id, author_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_publisher FOREIGN KEY (school_id, publisher_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_books_rack FOREIGN KEY (school_id, rack_id) REFERENCES master_categories (school_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  book_id BIGINT UNSIGNED NOT NULL,
  serial_number VARCHAR(50) NOT NULL,
  status ENUM('Tersedia', 'Dipinjam', 'Rusak') NOT NULL DEFAULT 'Tersedia',
  PRIMARY KEY (id),
  UNIQUE KEY uq_book_items_serial (book_id, serial_number),
  UNIQUE KEY uq_book_items_school_id_id (school_id, id),
  KEY idx_book_items_school_status (school_id, status),
  CONSTRAINT fk_book_items_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_book_items_book FOREIGN KEY (school_id, book_id) REFERENCES books (school_id, id)
    ON DELETE CASCADE
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_loans_school_status_due (school_id, status, due_date),
  KEY idx_loans_user_date (user_id, borrow_date),
  KEY idx_loans_item_status (book_item_id, status),
  CONSTRAINT fk_loans_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_loans_item FOREIGN KEY (school_id, book_item_id) REFERENCES book_items (school_id, id),
  CONSTRAINT fk_loans_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procurements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(180) NULL,
  publisher VARCHAR(180) NULL,
  request_date DATE NOT NULL,
  status ENUM('Pending', 'Diterima', 'Ditolak') NOT NULL DEFAULT 'Pending',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_procurements_school_status (school_id, status, created_at),
  CONSTRAINT fk_procurements_school FOREIGN KEY (school_id) REFERENCES tenants_schools (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_procurements_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id)
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
  `value` TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_platform_settings_key (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
