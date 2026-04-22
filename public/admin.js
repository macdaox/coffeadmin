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
  name: document.querySelector('#nameInput'),
  cupType: document.querySelector('#cupTypeInput'),
  temperature: document.querySelector('#temperatureInput'),
  method: document.querySelector('#methodInput'),
  isRecommended: document.querySelector('#isRecommendedInput'),
  hotScore: document.querySelector('#hotScoreInput')
};

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
          <td>${item.cupType}</td>
          <td>${item.temperature}</td>
          <td>${item.isRecommended ? '是' : '否'}</td>
          <td>${item.hotScore}</td>
          <td>${formatTime(item.updatedAt)}</td>
          <td>
            <button data-action="edit" data-id="${item.id}">编辑</button>
            <button data-action="delete" data-id="${item.id}">删除</button>
          </td>
        </tr>
      `
    )
    .join('');
  emptyEl.style.display = products.length ? 'none' : 'block';
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
  fields.name.value = product?.name || '';
  fields.cupType.value = product?.cupType || '标准杯';
  fields.temperature.value = product?.temperature || '冷';
  fields.method.value = product?.method || '';
  fields.isRecommended.checked = Boolean(product?.isRecommended);
  fields.hotScore.value = product?.hotScore ?? 0;
  dialog.showModal();
}

function getPayload() {
  return {
    id: fields.id.value,
    name: fields.name.value,
    cupType: fields.cupType.value,
    temperature: fields.temperature.value,
    method: fields.method.value,
    isRecommended: fields.isRecommended.checked,
    hotScore: Number(fields.hotScore.value || 0)
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
  const product = products.find((item) => item.id === button.dataset.id);
  if (button.dataset.action === 'edit') {
    openEditor(product);
  }
  if (button.dataset.action === 'delete') {
    if (!confirm(`确认删除「${product.name}」？`)) return;
    try {
      await request('/api/admin/product/delete', {
        method: 'DELETE',
        body: JSON.stringify({ id: product.id })
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
  const isEdit = Boolean(payload.id);
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
