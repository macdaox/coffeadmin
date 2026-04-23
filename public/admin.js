const loginView = document.querySelector('#loginView');
const adminView = document.querySelector('#adminView');
const loginForm = document.querySelector('#loginForm');
const usernameInput = document.querySelector('#usernameInput');
const passwordInput = document.querySelector('#passwordInput');
const bodyEl = document.querySelector('#productBody');
const emptyEl = document.querySelector('#emptyState');
const userBodyEl = document.querySelector('#userBody');
const userEmptyEl = document.querySelector('#userEmptyState');
const keywordInput = document.querySelector('#keywordInput');
const searchBtn = document.querySelector('#searchBtn');
const newBtn = document.querySelector('#newBtn');
const newUserBtn = document.querySelector('#newUserBtn');
const logoutBtn = document.querySelector('#logoutBtn');
const dialog = document.querySelector('#editorDialog');
const form = document.querySelector('#productForm');
const closeBtn = document.querySelector('#closeBtn');
const userDialog = document.querySelector('#userDialog');
const userForm = document.querySelector('#userForm');
const userCloseBtn = document.querySelector('#userCloseBtn');
const settingsForm = document.querySelector('#settingsForm');
const logoUrlInput = document.querySelector('#logoUrlInput');
const toastEl = document.querySelector('#toast');

const fields = {
  id: document.querySelector('#idInput'),
  previousName: document.querySelector('#previousNameInput'),
  name: document.querySelector('#nameInput')
};

const variantKeys = ['standardCold', 'standardHot', 'bucketCold', 'bucketHot'];

let products = [];
let appUsers = [];

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
          <td>${escapeHtml(item.name)}</td>
          <td>${renderVariantBadges(item.variants)}</td>
          <td>${formatTime(item.updatedAt)}</td>
          <td>
            <button data-action="edit" data-name="${escapeHtml(item.name)}">编辑</button>
            <button data-action="delete" data-name="${escapeHtml(item.name)}">删除</button>
          </td>
        </tr>
      `
    )
    .join('');
  emptyEl.style.display = products.length ? 'none' : 'block';
}

function renderUsers() {
  userBodyEl.innerHTML = appUsers
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.username)}</td>
          <td>${escapeHtml(item.displayName || '-')}</td>
          <td><span class="status ${item.isActive ? 'active' : 'disabled'}">${item.isActive ? '启用' : '停用'}</span></td>
          <td>${formatTime(item.updatedAt)}</td>
          <td>
            <button data-action="edit-user" data-id="${escapeHtml(item.id)}">编辑</button>
            <button data-action="delete-user" data-id="${escapeHtml(item.id)}">删除</button>
          </td>
        </tr>
      `
    )
    .join('');
  userEmptyEl.style.display = appUsers.length ? 'none' : 'block';
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
      return `<span class="badge">${escapeHtml(labels[key])} · ${Number(variant.hotScore || 0)}</span>${recommend}`;
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

async function loadAppUsers() {
  const json = await request('/api/admin/app-user/list?page=1&pageSize=100');
  appUsers = json.data;
  renderUsers();
}

async function loadSettings() {
  const json = await request('/api/admin/app-settings');
  logoUrlInput.value = json.data.logoUrl || '';
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

function openUserEditor(user) {
  document.querySelector('#userDialogTitle').textContent = user ? '编辑用户' : '新增用户';
  document.querySelector('#userIdInput').value = user?.id || '';
  document.querySelector('#appUsernameInput').value = user?.username || '';
  document.querySelector('#displayNameInput').value = user?.displayName || '';
  document.querySelector('#appPasswordInput').value = '';
  document.querySelector('#appPasswordInput').required = !user;
  document.querySelector('#isActiveInput').checked = user ? Boolean(user.isActive) : true;
  userDialog.showModal();
}

function getUserPayload() {
  return {
    id: document.querySelector('#userIdInput').value,
    username: document.querySelector('#appUsernameInput').value.trim(),
    displayName: document.querySelector('#displayNameInput').value.trim(),
    password: document.querySelector('#appPasswordInput').value,
    isActive: document.querySelector('#isActiveInput').checked
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
newUserBtn.addEventListener('click', () => openUserEditor());
userCloseBtn.addEventListener('click', () => userDialog.close());

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
    await Promise.all([loadProducts(), loadAppUsers(), loadSettings()]);
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
  appUsers = [];
  render();
  renderUsers();
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

userBodyEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const user = appUsers.find((item) => item.id === button.dataset.id);
  if (button.dataset.action === 'edit-user') {
    openUserEditor(user);
  }
  if (button.dataset.action === 'delete-user') {
    if (!confirm(`确认删除账号「${user.username}」？`)) return;
    try {
      await request('/api/admin/app-user/delete', {
        method: 'DELETE',
        body: JSON.stringify({ id: user.id })
      });
      toast('已删除');
      await loadAppUsers();
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

userForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = getUserPayload();
  const isEdit = Boolean(payload.id);
  if (isEdit && !payload.password) delete payload.password;
  try {
    await request(isEdit ? '/api/admin/app-user/update' : '/api/admin/app-user/create', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    userDialog.close();
    toast('用户已保存');
    await loadAppUsers();
  } catch (error) {
    toast(error.message);
  }
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await request('/api/admin/app-settings', {
      method: 'PUT',
      body: JSON.stringify({
        logoUrl: logoUrlInput.value.trim()
      })
    });
    toast('设置已保存');
  } catch (error) {
    toast(error.message);
  }
});

async function bootstrap() {
  try {
    await request('/api/admin/session');
    showAdmin();
    await Promise.all([loadProducts(), loadAppUsers(), loadSettings()]);
  } catch (error) {
    showLogin();
  }
}

bootstrap();
