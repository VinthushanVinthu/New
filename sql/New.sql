
Drop database retail_billing;
CREATE DATABASE IF NOT EXISTS retail_billing;
USE retail_billing;



CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_expires` bigint DEFAULT NULL,
  `role` enum('Owner','Manager','Cashier') NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_reset_token` (`reset_token`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `shops` (
  `shop_id` int NOT NULL AUTO_INCREMENT,
  `shop_name` varchar(150) NOT NULL,
  `owner_id` int NOT NULL,
  `secret_code` varchar(6) NOT NULL,
  `address_line` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `tax_percentage` decimal(5,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`shop_id`),
  UNIQUE KEY `secret_code` (`secret_code`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `shops_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE `user_shops` (
  `user_id` int NOT NULL,
  `shop_id` int NOT NULL,
  PRIMARY KEY (`user_id`,`shop_id`),
  KEY `shop_id` (`shop_id`),
  CONSTRAINT `user_shops_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_shops_ibfk_2` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE `sarees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shop_id` int NOT NULL,
  `name` varchar(150) NOT NULL,
  `type` varchar(80) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `design` varchar(120) DEFAULT NULL,
  `item_code` varchar(80) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT '0.00',
  `discount` decimal(10,2) DEFAULT '0.00',
  `stock_quantity` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `shop_id` (`shop_id`),
  UNIQUE KEY `idx_sarees_shop_code` (`shop_id`,`item_code`),
  CONSTRAINT `sarees_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `customers` (
  `customer_id` int NOT NULL AUTO_INCREMENT,
  `shop_id` int NOT NULL,
  `name` varchar(120) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  KEY `shop_id` (`shop_id`),
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE `bills` (
  `bill_id` int NOT NULL AUTO_INCREMENT,
  `shop_id` int NOT NULL,
  `customer_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `bill_period` char(6) DEFAULT NULL,
  `bill_sequence` int DEFAULT NULL,
  `bill_number` varchar(24) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT '0.00',
  `discount` decimal(10,2) DEFAULT '0.00',
  `tax` decimal(10,2) DEFAULT '0.00',
  `total_amount` decimal(10,2) DEFAULT '0.00',
  `status` enum('PAID','PARTIAL','UNPAID') DEFAULT 'UNPAID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`bill_id`),
  KEY `idx_bills_shop` (`shop_id`),
  KEY `idx_bills_user` (`user_id`),
  KEY `idx_bills_customer` (`customer_id`),
  KEY `idx_bills_period` (`shop_id`,`bill_period`,`bill_sequence`),
  KEY `idx_bills_status_created` (`status`,`created_at`),
  CONSTRAINT `bills_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`),
  CONSTRAINT `bills_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`),
  CONSTRAINT `bills_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE `bill_items` (
  `bill_item_id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `saree_id` int NOT NULL,
  `quantity` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `line_total` decimal(10,2) GENERATED ALWAYS AS ((`price` * `quantity`)) STORED,
  PRIMARY KEY (`bill_item_id`),
  KEY `idx_bill_items_bill` (`bill_id`),
  KEY `idx_bill_items_saree` (`saree_id`),
  CONSTRAINT `bill_items_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`bill_id`) ON DELETE CASCADE,
  CONSTRAINT `bill_items_ibfk_2` FOREIGN KEY (`saree_id`) REFERENCES `sarees` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `method` enum('Cash','Card','UPI') NOT NULL,
  `reference` varchar(64) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `idx_payments_bill` (`bill_id`),
  KEY `idx_payments_method` (`method`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`bill_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS suppliers (
supplier_id INT NOT NULL AUTO_INCREMENT,
shop_id INT NOT NULL,
name VARCHAR(150) NOT NULL,
phone VARCHAR(40) DEFAULT NULL,
email VARCHAR(120) DEFAULT NULL,
address_line VARCHAR(255) DEFAULT NULL,
city VARCHAR(100) DEFAULT NULL,
state VARCHAR(100) DEFAULT NULL,
postal_code VARCHAR(20) DEFAULT NULL,
country VARCHAR(100) DEFAULT NULL,
created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (supplier_id),
KEY idx_suppliers_shop (shop_id),
CONSTRAINT suppliers_ibfk_1 FOREIGN KEY (shop_id) REFERENCES shops (shop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS purchase_orders (
po_id INT NOT NULL AUTO_INCREMENT,
shop_id INT NOT NULL,
supplier_id INT NOT NULL,
status ENUM('DRAFT','ORDERED','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
ordered_at DATETIME DEFAULT NULL,
received_at DATETIME DEFAULT NULL,
sub_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
tax DECIMAL(12,2) NOT NULL DEFAULT 0.00,
total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
notes VARCHAR(255) DEFAULT NULL,
created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (po_id),
KEY idx_po_shop (shop_id),
KEY idx_po_supplier (supplier_id),
KEY idx_po_status (status),
CONSTRAINT po_ibfk_shop FOREIGN KEY (shop_id) REFERENCES shops (shop_id),
CONSTRAINT po_ibfk_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS purchase_order_items (
po_item_id INT NOT NULL AUTO_INCREMENT,
po_id INT NOT NULL,
saree_id INT NOT NULL,
qty_ordered INT NOT NULL,
qty_received INT NOT NULL DEFAULT 0,
unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
line_total DECIMAL(12,2) GENERATED ALWAYS AS (qty_ordered * unit_cost) STORED,
PRIMARY KEY (po_item_id),
KEY idx_poi_po (po_id),
KEY idx_poi_saree (saree_id),
CONSTRAINT poi_ibfk_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id) ON DELETE CASCADE,
CONSTRAINT poi_ibfk_saree FOREIGN KEY (saree_id) REFERENCES sarees (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS stock_movements (
movement_id INT NOT NULL AUTO_INCREMENT,
shop_id INT NOT NULL,
saree_id INT NOT NULL,
source_type ENUM('PURCHASE','SALE','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN_IN','RETURN_OUT') NOT NULL,
source_id INT DEFAULT NULL, -- po_id for PURCHASE, bill_id for SALE, etc.
quantity_change INT NOT NULL, -- + for in, - for out
unit_value DECIMAL(12,2) DEFAULT NULL, -- cost for PURCHASE, sale price for SALE (optional)
note VARCHAR(255) DEFAULT NULL,
created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (movement_id),
KEY idx_sm_shop_saree (shop_id, saree_id),
KEY idx_sm_source (source_type, source_id),
CONSTRAINT sm_ibfk_shop FOREIGN KEY (shop_id) REFERENCES shops (shop_id),
CONSTRAINT sm_ibfk_saree FOREIGN KEY (saree_id) REFERENCES sarees (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


DELIMITER $$

CREATE TRIGGER trg_stock_movements_after_insert
AFTER INSERT ON stock_movements
FOR EACH ROW
BEGIN
  UPDATE sarees
  SET stock_quantity = GREATEST(0, stock_quantity + NEW.quantity_change)
  WHERE id = NEW.saree_id;
END$$

DELIMITER ;



