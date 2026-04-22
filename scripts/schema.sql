CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  cupType VARCHAR(32) NOT NULL,
  temperature VARCHAR(16) NOT NULL,
  method TEXT NOT NULL,
  isRecommended TINYINT(1) NOT NULL DEFAULT 0,
  hotScore INT NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_name (name),
  INDEX idx_recommend_hot (isRecommended, hotScore),
  INDEX idx_updated (updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
