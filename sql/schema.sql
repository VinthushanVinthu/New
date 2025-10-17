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


//new
ALTER TABLE sarees ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00 AFTER price;


 ALTER TABLE sarees ADD COLUMN item_code VARCHAR(80) NULL AFTER design;       
 
  ALTER TABLE sarees ADD UNIQUE KEY idx_sarees_shop_code (shop_id, item_code);                                             
  ALTER TABLE bills  ADD COLUMN bill_period CHAR(6) NULL AFTER user_id,                                                    
                     ADD COLUMN bill_sequence INT NULL AFTER bill_period,                                                  
                     ADD COLUMN bill_number VARCHAR(24) NULL AFTER bill_sequence,                                          
                     ADD KEY idx_bills_period (shop_id, bill_period, bill_sequence); 
                     
                     
CREATE TABLE `bill_sequences` (
  `shop_id` int NOT NULL,
  `bill_period` char(6) NOT NULL,
  `last_sequence` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`shop_id`,`bill_period`),
  CONSTRAINT `bill_sequences_ibfk_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `bill_edit_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `shop_id` int NOT NULL,
  `requested_by` int NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','USED') NOT NULL DEFAULT 'PENDING',
  `manager_note` varchar(255) DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` timestamp NULL DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_edit_requests_status` (`status`),
  KEY `idx_edit_requests_shop` (`shop_id`),
  KEY `idx_edit_requests_bill` (`bill_id`),
  CONSTRAINT `bill_edit_requests_ibfk_bill` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`bill_id`) ON DELETE CASCADE,
  CONSTRAINT `bill_edit_requests_ibfk_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`),
  CONSTRAINT `bill_edit_requests_ibfk_requestor` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `bill_edit_requests_ibfk_manager` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


ALTER TABLE bill_edit_requests ADD COLUMN request_reason VARCHAR(255) NULL;

ALTER TABLE bill_edit_requests ADD COLUMN request_reason VARCHAR(255) NULL;   
                                        
ALTER TABLE bills                                                                                                     
       MODIFY bill_period CHAR(6) NOT NULL,                                                                                
       MODIFY bill_sequence INT NOT NULL,
       MODIFY bill_number VARCHAR(24) NOT NULL;                  
       
ALTER TABLE bills                                                                                                     
       ADD CONSTRAINT uniq_bills_sequence UNIQUE (shop_id, bill_period, bill_sequence),                                    
       ADD CONSTRAINT uniq_bills_number UNIQUE (bill_number); 
       
CREATE TABLE bill_sequences (                                                                                         
       shop_id INT NOT NULL,                                                                                               
       bill_period CHAR(6) NOT NULL,                                                                                       
       last_sequence INT NOT NULL DEFAULT 0,                                                                               
       PRIMARY KEY (shop_id, bill_period)                                                                                  
     );    
     
     
     UPDATE bills                                                                                                             
  SET bill_number = CONCAT(shop_id, '-', bill_period, '-', LPAD(bill_sequence, 4, '0'))                                    
  WHERE bill_number IS NULL OR bill_number NOT LIKE CONCAT(shop_id, '-%'); 