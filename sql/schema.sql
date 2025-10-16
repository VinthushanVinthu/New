-- MySQL schema
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Owner','Manager','Cashier') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shops (
  shop_id INT AUTO_INCREMENT PRIMARY KEY,
  shop_name VARCHAR(150) NOT NULL,
  owner_id INT NOT NULL,
  secret_code VARCHAR(6) NOT NULL UNIQUE,
  address_line VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  tax_percentage DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);


CREATE TABLE IF NOT EXISTS user_shops (
  user_id INT NOT NULL,
  shop_id INT NOT NULL,
  PRIMARY KEY (user_id, shop_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
);

CREATE TABLE IF NOT EXISTS sarees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(80),
  color VARCHAR(50),
  design VARCHAR(120),
  item_code VARCHAR(80),
  price DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  stock_quantity INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id),
  UNIQUE KEY idx_sarees_shop_code (shop_id, item_code)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  name VARCHAR(120),
  phone VARCHAR(40),
  email VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
);

CREATE TABLE IF NOT EXISTS bills (
  bill_id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  customer_id INT NULL,
  user_id INT NOT NULL,
  bill_period CHAR(6) NOT NULL,
  bill_sequence INT NOT NULL,
  bill_number VARCHAR(24) NOT NULL,
  subtotal DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  status ENUM('PAID','PARTIAL','UNPAID') DEFAULT 'UNPAID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  KEY idx_bills_period (shop_id, bill_period, bill_sequence),
  UNIQUE KEY uniq_bills_sequence (shop_id, bill_period, bill_sequence),
  UNIQUE KEY uniq_bills_number (bill_number)
);

CREATE TABLE IF NOT EXISTS bill_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  saree_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(bill_id),
  FOREIGN KEY (saree_id) REFERENCES sarees(id)
);

CREATE TABLE IF NOT EXISTS bill_sequences (
  shop_id INT NOT NULL,
  bill_period CHAR(6) NOT NULL,
  last_sequence INT NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, bill_period),
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
);

CREATE TABLE IF NOT EXISTS bill_edit_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  shop_id INT NOT NULL,
  requested_by INT NOT NULL,
  request_reason VARCHAR(255),
  status ENUM('PENDING','APPROVED','REJECTED','USED') NOT NULL DEFAULT 'PENDING',
  manager_note VARCHAR(255),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  approved_by INT NULL,
  used_at TIMESTAMP NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(bill_id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  KEY idx_edit_requests_status (status),
  KEY idx_edit_requests_shop (shop_id),
  KEY idx_edit_requests_bill (bill_id)
);
