const sampleProducts = [
  {
    id: 'p001',
    name: '冰拿铁',
    category: '拿铁',
    cupType: '标准杯',
    temperature: '冷',
    method: '1. 加冰\n2. 加牛奶 30ml\n3. 点击意式精粹\n4. 完成出杯',
    isRecommended: true,
    hotScore: 98
  },
  {
    id: 'p002',
    name: '生椰拿铁',
    category: '椰乳',
    cupType: '标准杯',
    temperature: '冷',
    method: '1. 加冰\n2. 加厚椰乳至杯线\n3. 点击意式精粹\n4. 轻搅后出杯',
    isRecommended: true,
    hotScore: 92
  },
  {
    id: 'p003',
    name: '热美式',
    category: '美式',
    cupType: '标准杯',
    temperature: '热',
    method: '1. 加热水至杯线\n2. 点击意式精粹\n3. 盖杯出杯',
    isRecommended: true,
    hotScore: 88
  },
  {
    id: 'p004',
    name: '卡布奇诺',
    category: '奶咖',
    cupType: '标准杯',
    temperature: '热',
    method: '1. 蒸打牛奶至细腻奶泡\n2. 点击意式精粹\n3. 倒入牛奶并保留绵密奶泡\n4. 出杯',
    isRecommended: false,
    hotScore: 76
  }
];

module.exports = { sampleProducts };
