const loginView = document.querySelector('#loginView');
const adminView = document.querySelector('#adminView');
const loginForm = document.querySelector('#loginForm');
const usernameInput = document.querySelector('#usernameInput');
const passwordInput = document.querySelector('#passwordInput');
const bodyEl = document.querySelector('#productBody');
const emptyEl = document.querySelector('#emptyState');
const keywordInput = document.querySelector('#keywordInput');
const searchBtn = document.querySelector('#searchBtn');
const newBtn = document.querySelector('#newBtn');
const logoutBtn = document.querySelector('#logoutBtn');
const dialog = document.querySelector('#editorDialog');
const form = document.querySelector('#productForm');
const closeBtn = document.querySelector('#closeBtn');
const toastEl = document.querySelector('#toast');

const fields = {
  id: document.querySelector('#idInput'),
  previousName: document.querySelector('#previousNameInput'),
  name: document.querySelector('#nameInput')
};

const variantKeys = ['standardCold', 'standardHot', 'bucketCold', 'bucketHot'];

let products = [];

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || '请求失败');
  return json;
}

function showLogin() {
  loginView.classList.remove('hidden');
  adminView.classList.add('hidden');
  usernameInput.focus();
}

function showAdmin() {
  loginView.classList.add('hidden');
  adminView.classList.remove('hidden');
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function render() {
  bodyEl.innerHTML = products
    .map(
      (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${renderVariantBadges(item.variants)}</td>
          <td>${formatTime(item.updatedAt)}</td>
          <td>
            <button data-action="edit" data-name="${item.name}">编辑</button>
            <button data-action="delete" data-name="${item.name}">删除</button>
          </td>
        </tr>
      `
    )
    .join('');
  emptyEl.style.display = products.length ? 'none' : 'block';
}

function renderVariantBadges(variants = {}) {
  const labels = {
    standardCold: '标准杯冷',
    standardHot: '标准杯热',
    bucketCold: '吨吨桶冷',
    bucketHot: '吨吨桶热'
  };
  const enabled = variantKeys.filter((key) => variants[key]?.enabled);
  if (!enabled.length) return '<span class="muted">未配置</span>';
  return enabled
    .map((key) => {
      const variant = variants[key];
      const recommend = variant.isRecommended ? '<span class="badge recommend">荐</span>' : '';
      return `<span class="badge">${labels[key]} · ${variant.hotScore || 0}</span>${recommend}`;
    })
    .join('');
}

async function loadProducts() {
  const params = new URLSearchParams({
    keyword: keywordInput.value.trim(),
    page: '1',
    pageSize: '100'
  });
  const json = await request(`/api/admin/product/list?${params.toString()}`);
  products = json.data;
  render();
}

function openEditor(product) {
  document.querySelector('#dialogTitle').textContent = product ? '编辑产品' : '新增产品';
  fields.id.value = product?.id || '';
  fields.previousName.value = product?.name || '';
  fields.name.value = product?.name || '';
  fillVariants(product?.variants);
  dialog.showModal();
}

function fillVariants(variants = {}) {
  for (const key of variantKeys) {
    const card = document.querySelector(`[data-variant="${key}"]`);
    const enabledInput = card.querySelector('[data-field="enabled"]');
    const recommendInput = card.querySelector('[data-field="isRecommended"]');
    const hotScoreInput = card.querySelector('[data-field="hotScore"]');
    const methodInput = card.querySelector('[data-field="method"]');
    enabledInput.checked = Boolean(variants[key]?.enabled);
    recommendInput.checked = Boolean(variants[key]?.isRecommended);
    hotScoreInput.value = variants[key]?.hotScore ?? 0;
    methodInput.value = variants[key]?.method || '';
  }
}

function readVariants() {
  const variants = {};
  for (const key of variantKeys) {
    const card = document.querySelector(`[data-variant="${key}"]`);
    variants[key] = {
      enabled: card.querySelector('[data-field="enabled"]').checked,
      isRecommended: card.querySelector('[data-field="isRecommended"]').checked,
      hotScore: Number(card.querySelector('[data-field="hotScore"]').value || 0),
      method: card.querySelector('[data-field="method"]').value
    };
  }
  return variants;
}

function getPayload() {
  return {
    id: fields.id.value,
    previousName: fields.previousName.value,
    name: fields.name.value,
    variants: readVariants()
  };
}

searchBtn.addEventListener('click', () => {
  loadProducts().catch((error) => toast(error.message));
});

keywordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadProducts().catch((error) => toast(error.message));
});

newBtn.addEventListener('click', () => openEditor());
closeBtn.addEventListener('click', () => dialog.close());

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value
      })
    });
    passwordInput.value = '';
    showAdmin();
    await loadProducts();
  } catch (error) {
    toast(error.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await request('/api/admin/logout', { method: 'POST', body: '{}' });
  } catch (error) {
    // Ignore logout network errors; the local page should still return to login.
  }
  products = [];
  render();
  showLogin();
});

bodyEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const product = products.find((item) => item.name === button.dataset.name);
  if (button.dataset.action === 'edit') {
    openEditor(product);
  }
  if (button.dataset.action === 'delete') {
    if (!confirm(`确认删除「${product.name}」？`)) return;
    try {
      await request('/api/admin/product/delete', {
        method: 'DELETE',
        body: JSON.stringify({ name: product.name })
      });
      toast('已删除');
      await loadProducts();
    } catch (error) {
      toast(error.message);
    }
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = getPayload();
  const isEdit = Boolean(payload.previousName);
  try {
    await request(isEdit ? '/api/admin/product/update' : '/api/admin/product/create', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    dialog.close();
    toast('已保存');
    await loadProducts();
  } catch (error) {
    toast(error.message);
  }
});

async function bootstrap() {
  try {
    await request('/api/admin/session');
    showAdmin();
    await loadProducts();
  } catch (error) {
    showLogin();
  }
}

bootstrap();
