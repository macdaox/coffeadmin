const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCatalogQuery, normalizeCatalogVersion } = require('../../miniprogram/utils/product-version');

test('catalog query always carries the selected version and preserves the keyword', () => {
  assert.equal(
    buildCatalogQuery('生椰 拿铁', '2.0'),
    '?page=1&pageSize=500&keyword=%E7%94%9F%E6%A4%B0%20%E6%8B%BF%E9%93%81&version=2.0'
  );
  assert.equal(buildCatalogQuery('', '1.0'), '?page=1&pageSize=500&version=1.0');
});

test('catalog version normalization rejects unknown values', () => {
  assert.equal(normalizeCatalogVersion('2.0'), '2.0');
  assert.throws(() => normalizeCatalogVersion('3.0'), /版本/);
});

test('catalog navigation carries the selected SOP version into chat', () => {
  let stored;
  global.wx = {
    setStorageSync(key, value) {
      stored = { key, value };
    },
    switchTab() {}
  };
  const { openChatPageWithQuery } = require('../../miniprogram/utils/chat-navigation');

  openChatPageWithQuery('[2.0]生椰拿铁标准杯冰', '2.0');

  assert.deepEqual(stored, {
    key: 'pendingProductQuery',
    value: { query: '[2.0]生椰拿铁标准杯冰', version: '2.0' }
  });
  delete global.wx;
});
