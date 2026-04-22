const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { sampleProducts } = require('./sampleProducts');

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeKeyword(keyword) {
  return String(keyword || '').trim().toLowerCase();
}

function pbkdf2(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `pbkdf2$120000$${salt}$${pbkdf2(password, salt)}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, iterations, salt, hash] = parts;
  const candidate = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex');
  const left = Buffer.from(candidate, 'hex');
  const right = Buffer.from(hash, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function toPublicProduct(product) {
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    cupType: product.cupType,
    temperature: product.temperature,
    method: product.method,
    isRecommended: Boolean(product.isRecommended),
    hotScore: Number(product.hotScore || 0),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function validateProductInput(input, partial = false) {
  const errors = [];
  const data = {};

  if (!partial || input.name !== undefined) {
    data.name = String(input.name || '').trim();
    if (!data.name) errors.push('品名不能为空');
  }

  if (!partial || input.cupType !== undefined) {
    data.cupType = String(input.cupType || '').trim();
    if (!['标准杯', '吨吨桶'].includes(data.cupType)) errors.push('杯型只能是标准杯或吨吨桶');
  }

  if (!partial || input.temperature !== undefined) {
    data.temperature = String(input.temperature || '').trim();
    if (!['冷', '热'].includes(data.temperature)) errors.push('温度只能是冷或热');
  }

  if (!partial || input.method !== undefined) {
    data.method = String(input.method || '').trim();
    if (!data.method) errors.push('制作方法不能为空');
  }

  if (!partial || input.isRecommended !== undefined) {
    data.isRecommended = Boolean(input.isRecommended);
  }

  if (!partial || input.hotScore !== undefined) {
    const hotScore = Number(input.hotScore || 0);
    if (!Number.isFinite(hotScore) || hotScore < 0) errors.push('热度值必须是非负数字');
    data.hotScore = Math.round(hotScore);
  }

  return { data, errors };
}

const VARIANT_KEYS = [
  { key: 'standardCold', cupType: '标准杯', temperature: '冷', label: '标准杯（冷）' },
  { key: 'standardHot', cupType: '标准杯', temperature: '热', label: '标准杯（热）' },
  { key: 'bucketCold', cupType: '吨吨桶', temperature: '冷', label: '吨吨桶（冷）' },
  { key: 'bucketHot', cupType: '吨吨桶', temperature: '热', label: '吨吨桶（热）' }
];

function makeVariantKey(cupType, temperature) {
  const item = VARIANT_KEYS.find((variant) => variant.cupType === cupType && variant.temperature === temperature);
  return item ? item.key : `${cupType}-${temperature}`;
}

function emptyVariants() {
  return Object.fromEntries(
    VARIANT_KEYS.map((variant) => [
      variant.key,
      {
        id: '',
        enabled: false,
        cupType: variant.cupType,
        temperature: variant.temperature,
        method: ''
      }
    ])
  );
}

function productsToGroups(products) {
  const map = new Map();
  for (const product of products) {
    const publicProduct = toPublicProduct(product);
    if (!map.has(publicProduct.name)) {
      map.set(publicProduct.name, {
        name: publicProduct.name,
        variants: emptyVariants(),
        isRecommended: false,
        hotScore: 0,
        updatedAt: publicProduct.updatedAt,
        createdAt: publicProduct.createdAt
      });
    }
    const group = map.get(publicProduct.name);
    const key = makeVariantKey(publicProduct.cupType, publicProduct.temperature);
    group.variants[key] = {
      id: publicProduct.id,
      enabled: true,
      cupType: publicProduct.cupType,
      temperature: publicProduct.temperature,
      method: publicProduct.method,
      isRecommended: publicProduct.isRecommended,
      hotScore: publicProduct.hotScore
    };
    group.isRecommended = group.isRecommended || publicProduct.isRecommended;
    group.hotScore = Math.max(group.hotScore, publicProduct.hotScore);
    if (!group.updatedAt || new Date(publicProduct.updatedAt) > new Date(group.updatedAt)) group.updatedAt = publicProduct.updatedAt;
  }
  return [...map.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function validateProductGroupInput(input) {
  const name = String(input.name || '').trim();
  const errors = [];
  if (!name) errors.push('品名不能为空');
  const variants = input.variants || {};
  const normalized = [];
  for (const variant of VARIANT_KEYS) {
    const current = variants[variant.key] || {};
    const enabled = Boolean(current.enabled);
    const method = String(current.method || '').trim();
    if (enabled && !method) errors.push(`${variant.label} 的制作方法不能为空`);
    if (enabled) {
      const hotScore = Number(current.hotScore || 0);
      if (!Number.isFinite(hotScore) || hotScore < 0) errors.push(`${variant.label} 的热度值必须是非负数字`);
      normalized.push({
        id: current.id || '',
        name,
        cupType: variant.cupType,
        temperature: variant.temperature,
        method,
        isRecommended: Boolean(current.isRecommended),
        hotScore: Math.round(hotScore)
      });
    }
  }
  if (normalized.length === 0) errors.push('至少启用一个规格');
  return {
    data: {
      name,
      previousName: String(input.previousName || input.name || '').trim(),
      variants: normalized
    },
    errors
  };
}

class JsonProductStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, '..', 'data', 'products.json');
    this.adminFilePath = path.join(path.dirname(this.filePath), 'admin-users.json');
    this.products = [];
    this.adminUsers = [];
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.products = JSON.parse(raw);
    } catch (error) {
      const stamp = nowIso();
      this.products = sampleProducts.map((item) => ({
        ...item,
        createdAt: stamp,
        updatedAt: stamp
      }));
      await this.save();
    }
    await this.initAdminUsers();
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.products, null, 2));
  }

  async saveAdminUsers() {
    await fs.writeFile(this.adminFilePath, JSON.stringify(this.adminUsers, null, 2));
  }

  async initAdminUsers() {
    try {
      const raw = await fs.readFile(this.adminFilePath, 'utf8');
      this.adminUsers = JSON.parse(raw);
    } catch (error) {
      this.adminUsers = [];
    }
    if (this.adminUsers.length === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'admin123456';
      const stamp = nowIso();
      this.adminUsers.push({
        id: makeId(),
        username,
        passwordHash: makePasswordHash(password),
        createdAt: stamp,
        updatedAt: stamp
      });
      await this.saveAdminUsers();
      if (!process.env.ADMIN_PASSWORD) {
        console.warn('Created local default admin user: admin / admin123456');
      }
    }
  }

  async list({ keyword = '', page = 1, pageSize = 20 } = {}) {
    const q = normalizeKeyword(keyword);
    const filtered = this.products
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const start = (Math.max(page, 1) - 1) * pageSize;
    return {
      total: filtered.length,
      items: filtered.slice(start, start + pageSize).map(toPublicProduct)
    };
  }

  async listGroups({ keyword = '', page = 1, pageSize = 20 } = {}) {
    const q = normalizeKeyword(keyword);
    const filtered = productsToGroups(this.products).filter((item) => !q || item.name.toLowerCase().includes(q));
    const start = (Math.max(page, 1) - 1) * pageSize;
    return {
      total: filtered.length,
      items: filtered.slice(start, start + pageSize)
    };
  }

  async search(keyword) {
    const q = normalizeKeyword(keyword);
    if (!q) return null;
    const exact = this.products.find((item) => item.name.toLowerCase() === q);
    if (exact) return toPublicProduct(exact);
    const fuzzy = this.products.find((item) => item.name.toLowerCase().includes(q));
    return toPublicProduct(fuzzy);
  }

  async recommend(limit = 8) {
    const recommended = this.products
      .filter((item) => item.isRecommended)
      .sort((a, b) => b.hotScore - a.hotScore);
    const ids = new Set(recommended.map((item) => item.id));
    const hot = this.products
      .filter((item) => !ids.has(item.id))
      .sort((a, b) => b.hotScore - a.hotScore);
    return [...recommended, ...hot].slice(0, limit).map(({ id, name, cupType, temperature }) => ({
      id,
      name,
      cupType,
      temperature
    }));
  }

  async create(input) {
    const { data, errors } = validateProductInput(input);
    if (errors.length) {
      const error = new Error(errors.join('；'));
      error.status = 400;
      throw error;
    }
    const stamp = nowIso();
    const product = { id: makeId(), ...data, createdAt: stamp, updatedAt: stamp };
    this.products.unshift(product);
    await this.save();
    return toPublicProduct(product);
  }

  async update(id, input) {
    const index = this.products.findIndex((item) => item.id === id);
    if (index < 0) {
      const error = new Error('产品不存在');
      error.status = 404;
      throw error;
    }
    const { data, errors } = validateProductInput(input, true);
    if (errors.length) {
      const error = new Error(errors.join('；'));
      error.status = 400;
      throw error;
    }
    this.products[index] = { ...this.products[index], ...data, updatedAt: nowIso() };
    await this.save();
    return toPublicProduct(this.products[index]);
  }

  async delete(id) {
    const before = this.products.length;
    this.products = this.products.filter((item) => item.id !== id);
    if (this.products.length === before) {
      const error = new Error('产品不存在');
      error.status = 404;
      throw error;
    }
    await this.save();
    return true;
  }

  async saveGroup(input) {
    const { data, errors } = validateProductGroupInput(input);
    if (errors.length) {
      const error = new Error(errors.join('；'));
      error.status = 400;
      throw error;
    }
    const stamp = nowIso();
    const existingByKey = new Map(
      this.products
        .filter((item) => item.name === data.previousName || item.name === data.name)
        .map((item) => [makeVariantKey(item.cupType, item.temperature), item])
    );
    const nextProducts = this.products.filter((item) => item.name !== data.previousName && item.name !== data.name);
    for (const variant of data.variants) {
      const key = makeVariantKey(variant.cupType, variant.temperature);
      const existing = existingByKey.get(key);
      nextProducts.push({
        id: existing?.id || variant.id || makeId(),
        name: data.name,
        cupType: variant.cupType,
        temperature: variant.temperature,
        method: variant.method,
        isRecommended: variant.isRecommended,
        hotScore: variant.hotScore,
        createdAt: existing?.createdAt || stamp,
        updatedAt: stamp
      });
    }
    this.products = nextProducts;
    await this.save();
    const groups = await this.listGroups({ keyword: data.name, page: 1, pageSize: 1 });
    return groups.items[0];
  }

  async deleteGroup(name) {
    const before = this.products.length;
    this.products = this.products.filter((item) => item.name !== name);
    if (this.products.length === before) {
      const error = new Error('产品不存在');
      error.status = 404;
      throw error;
    }
    await this.save();
    return true;
  }

  async verifyAdminLogin(username, password) {
    const user = this.adminUsers.find((item) => item.username === String(username || '').trim());
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, username: user.username };
  }
}

class MySqlProductStore {
  constructor(config) {
    this.pool = mysql.createPool({
      host: config.host,
      port: Number(config.port || 3306),
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4'
    });
  }

  async init() {
    await this.pool.execute(`
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
    `);
    const [[{ count }]] = await this.pool.execute('SELECT COUNT(*) AS count FROM products');
    if (count === 0) {
      for (const item of sampleProducts) {
        await this.create(item);
      }
    }
    await this.initAdminUsers();
  }

  async initAdminUsers() {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        passwordHash VARCHAR(255) NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [[{ count }]] = await this.pool.execute('SELECT COUNT(*) AS count FROM admin_users');
    if (count > 0) return;

    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) {
      const error = new Error('MySQL 模式必须配置 ADMIN_USERNAME 和 ADMIN_PASSWORD 用于初始化后台管理员');
      error.status = 500;
      throw error;
    }
    const stamp = nowIso().slice(0, 19).replace('T', ' ');
    await this.pool.execute(
      `INSERT INTO admin_users (id, username, passwordHash, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [makeId(), username, makePasswordHash(password), stamp, stamp]
    );
  }

  rowToProduct(row) {
    return toPublicProduct({
      ...row,
      cupType: row.cupType,
      isRecommended: Boolean(row.isRecommended),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
    });
  }

  async list({ keyword = '', page = 1, pageSize = 20 } = {}) {
    const offset = (Math.max(page, 1) - 1) * pageSize;
    const q = `%${String(keyword || '').trim()}%`;
    const hasKeyword = String(keyword || '').trim().length > 0;
    const where = hasKeyword ? 'WHERE name LIKE ?' : '';
    const params = hasKeyword ? [q] : [];
    const [[{ total }]] = await this.pool.execute(`SELECT COUNT(*) AS total FROM products ${where}`, params);
    const [rows] = await this.pool.execute(
      `SELECT * FROM products ${where} ORDER BY updatedAt DESC LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );
    return { total, items: rows.map((row) => this.rowToProduct(row)) };
  }

  async listGroups({ keyword = '', page = 1, pageSize = 20 } = {}) {
    const offset = (Math.max(page, 1) - 1) * pageSize;
    const hasKeyword = String(keyword || '').trim().length > 0;
    const params = hasKeyword ? [`%${String(keyword || '').trim()}%`] : [];
    const where = hasKeyword ? 'WHERE name LIKE ?' : '';
    const [[{ total }]] = await this.pool.execute(`SELECT COUNT(DISTINCT name) AS total FROM products ${where}`, params);
    const [nameRows] = await this.pool.execute(
      `SELECT name, MAX(updatedAt) AS updatedAt
       FROM products
       ${where}
       GROUP BY name
       ORDER BY updatedAt DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );
    if (nameRows.length === 0) return { total, items: [] };
    const names = nameRows.map((row) => row.name);
    const placeholders = names.map(() => '?').join(',');
    const [rows] = await this.pool.execute(`SELECT * FROM products WHERE name IN (${placeholders})`, names);
    const groups = productsToGroups(rows.map((row) => this.rowToProduct(row)));
    groups.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
    return { total, items: groups };
  }

  async search(keyword) {
    const trimmed = String(keyword || '').trim();
    if (!trimmed) return null;
    const [exactRows] = await this.pool.execute('SELECT * FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1', [trimmed]);
    if (exactRows[0]) return this.rowToProduct(exactRows[0]);
    const [fuzzyRows] = await this.pool.execute('SELECT * FROM products WHERE LOWER(name) LIKE LOWER(?) ORDER BY hotScore DESC LIMIT 1', [`%${trimmed}%`]);
    return fuzzyRows[0] ? this.rowToProduct(fuzzyRows[0]) : null;
  }

  async recommend(limit = 8) {
    const [rows] = await this.pool.execute(
      `SELECT id, name, cupType, temperature
       FROM products
       ORDER BY isRecommended DESC, hotScore DESC, updatedAt DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  async create(input) {
    const { data, errors } = validateProductInput(input);
    if (errors.length) {
      const error = new Error(errors.join('；'));
      error.status = 400;
      throw error;
    }
    const id = input.id || makeId();
    const stamp = nowIso().slice(0, 19).replace('T', ' ');
    await this.pool.execute(
      `INSERT INTO products (id, name, cupType, temperature, method, isRecommended, hotScore, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.cupType, data.temperature, data.method, data.isRecommended ? 1 : 0, data.hotScore, stamp, stamp]
    );
    return this.search(data.name);
  }

  async update(id, input) {
    const current = await this.getById(id);
    if (!current) {
      const error = new Error('产品不存在');
      error.status = 404;
      throw error;
    }
    const { data, errors } = validateProductInput(input, true);
    if (errors.length) {
      const error = new Error(errors.join('；'));
      error.status = 400;
      throw error;
    }
    const next = { ...current, ...data };
    await this.pool.execute(
      `UPDATE products
       SET name = ?, cupType = ?, temperature = ?, method = ?, isRecommended = ?, hotScore = ?, updatedAt = ?
       WHERE id = ?`,
      [
        next.name,
        next.cupType,
        next.temperature,
        next.method,
        next.isRecommended ? 1 : 0,
        Number(next.hotScore || 0),
        nowIso().slice(0, 19).replace('T', ' '),
        id
      ]
    );
    return this.getById(id);
  }

  async getById(id) {
    const [rows] = await this.pool.execute('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? this.rowToProduct(rows[0]) : null;
  }

  async delete(id) {
    const [result] = await this.pool.execute('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      const error = new Error('产品不存在');
      error.status = 404;
      throw error;
    }
    return true;
  }

  async saveGroup(input) {
    const { data, errors } = validateProductGroupInput(input);
    if (errors.length) {
      const error = new Error(errors.join('；'));
      error.status = 400;
      throw error;
    }
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const names = [...new Set([data.previousName, data.name].filter(Boolean))];
      const placeholders = names.map(() => '?').join(',');
      const [existingRows] = names.length
        ? await conn.execute(`SELECT * FROM products WHERE name IN (${placeholders})`, names)
        : [[]];
      const existingByKey = new Map(existingRows.map((row) => [makeVariantKey(row.cupType, row.temperature), this.rowToProduct(row)]));
      if (names.length) {
        await conn.execute(`DELETE FROM products WHERE name IN (${placeholders})`, names);
      }
      const stamp = nowIso().slice(0, 19).replace('T', ' ');
      for (const variant of data.variants) {
        const key = makeVariantKey(variant.cupType, variant.temperature);
        const existing = existingByKey.get(key);
        await conn.execute(
          `INSERT INTO products (id, name, cupType, temperature, method, isRecommended, hotScore, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            existing?.id || variant.id || makeId(),
            data.name,
            variant.cupType,
            variant.temperature,
            variant.method,
            variant.isRecommended ? 1 : 0,
            variant.hotScore,
            existing?.createdAt ? String(existing.createdAt).slice(0, 19).replace('T', ' ') : stamp,
            stamp
          ]
        );
      }
      await conn.commit();
      const groups = await this.listGroups({ keyword: data.name, page: 1, pageSize: 1 });
      return groups.items[0];
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async deleteGroup(name) {
    const [result] = await this.pool.execute('DELETE FROM products WHERE name = ?', [name]);
    if (result.affectedRows === 0) {
      const error = new Error('产品不存在');
      error.status = 404;
      throw error;
    }
    return true;
  }

  async verifyAdminLogin(username, password) {
    const [rows] = await this.pool.execute('SELECT * FROM admin_users WHERE username = ? LIMIT 1', [String(username || '').trim()]);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, username: user.username };
  }
}

function shouldUseMysql() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function createStore() {
  if (shouldUseMysql()) {
    return new MySqlProductStore({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE
    });
  }
  return new JsonProductStore(process.env.DATA_FILE);
}

module.exports = {
  createStore,
  validateProductInput
};
