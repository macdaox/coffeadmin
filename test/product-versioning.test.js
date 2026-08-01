const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { JsonProductStore } = require('../src/store');

function variant(method = '加入原料并完成制作') {
  return {
    standardCold: {
      enabled: true,
      method,
      isRecommended: true,
      hotScore: 10
    }
  };
}

async function createStore(products = []) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-sop-version-'));
  const dataFile = path.join(directory, 'products.json');
  await fs.writeFile(dataFile, JSON.stringify(products));
  const store = new JsonProductStore(dataFile);
  await store.init();
  return { store, dataFile, directory };
}

test('historical products default to 1.0 and are persisted', async (t) => {
  const legacy = {
    id: 'legacy-1',
    name: '生椰拿铁',
    category: '咖啡',
    cupType: '标准杯',
    temperature: '冷',
    method: '旧版做法',
    isRecommended: false,
    hotScore: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const { store, dataFile, directory } = await createStore([legacy]);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const oldGroups = await store.listGroups({ version: '1.0', pageSize: 100 });
  const newGroups = await store.listGroups({ version: '2.0', pageSize: 100 });
  const persisted = JSON.parse(await fs.readFile(dataFile, 'utf8'));

  assert.equal(oldGroups.total, 1);
  assert.equal(oldGroups.items[0].version, '1.0');
  assert.equal(newGroups.total, 0);
  assert.equal(persisted[0].version, '1.0');
});

test('2.0 creation prefixes the product name exactly once and stays isolated', async (t) => {
  const { store, directory } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.saveGroup({ name: '生椰拿铁', version: '2.0', variants: variant() });
  await store.saveGroup({
    name: '[2.0]生椰拿铁',
    previousName: '[2.0]生椰拿铁',
    version: '2.0',
    variants: variant('更新后的做法')
  });

  const oldGroups = await store.listGroups({ version: '1.0', pageSize: 100 });
  const newGroups = await store.listGroups({ version: '2.0', pageSize: 100 });

  assert.equal(oldGroups.total, 0);
  assert.equal(newGroups.total, 1);
  assert.equal(newGroups.items[0].name, '[2.0]生椰拿铁');
  assert.equal(newGroups.items[0].variants.standardCold.method, '更新后的做法');
});

test('omitting the version preserves legacy 1.0 behavior', async (t) => {
  const { store, directory } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await store.saveGroup({ name: '旧产品', version: '1.0', variants: variant() });
  await store.saveGroup({ name: '新产品', version: '2.0', variants: variant() });

  const groups = await store.listGroups({ pageSize: 100 });

  assert.deepEqual(groups.items.map((item) => item.name), ['旧产品']);
});

test('search filters by version before matching', async (t) => {
  const { store, directory } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await store.saveGroup({ name: '生椰拿铁', version: '1.0', variants: variant('1.0 做法') });
  await store.saveGroup({ name: '生椰拿铁', version: '2.0', variants: variant('2.0 做法') });

  const oldProduct = await store.search('生椰拿铁标准杯冰', '1.0');
  const newProduct = await store.search('[2.0]生椰拿铁标准杯冰', '2.0');

  assert.equal(oldProduct.version, '1.0');
  assert.equal(oldProduct.method, '1.0 做法');
  assert.equal(newProduct.version, '2.0');
  assert.equal(newProduct.method, '2.0 做法');
});

test('invalid versions are rejected', async (t) => {
  const { store, directory } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(() => store.listGroups({ version: '3.0' }), /版本/);
  await assert.rejects(
    () => store.saveGroup({ name: '错误版本', version: '3.0', variants: variant() }),
    /版本/
  );
});

test('recommendations and hot products only use the requested version', async (t) => {
  const { store, directory } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await store.saveGroup({ name: '旧推荐', version: '1.0', variants: variant() });
  await store.saveGroup({ name: '新推荐', version: '2.0', variants: variant() });

  const recommended = await store.recommend(8, '2.0');
  const hot = await store.hot(8, '2.0');

  assert.deepEqual(recommended.map((item) => item.name), ['[2.0]新推荐']);
  assert.deepEqual(hot.map((item) => item.name), ['[2.0]新推荐']);
});

test('deleting a group cannot delete the same name from another version', async (t) => {
  const { store, directory } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await store.saveGroup({ name: '[2.0]同名产品', version: '1.0', variants: variant() });
  await store.saveGroup({ name: '同名产品', version: '2.0', variants: variant() });

  await store.deleteGroup('[2.0]同名产品', '2.0');

  const oldGroups = await store.listGroups({ version: '1.0' });
  const newGroups = await store.listGroups({ version: '2.0' });
  assert.equal(oldGroups.total, 1);
  assert.equal(newGroups.total, 0);
});
