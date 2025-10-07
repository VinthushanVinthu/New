
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
  `price` decimal(10,2) DEFAULT '0.00',
  `stock_quantity` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `shop_id` (`shop_id`),
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






