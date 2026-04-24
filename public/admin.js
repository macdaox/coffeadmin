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
const categoryFilterSelect = document.querySelector('#categoryFilterSelect');
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
const categoryForm = document.querySelector('#categoryForm');
const categoryNameInput = document.querySelector('#categoryNameInput');
const categoryListEl = document.querySelector('#categoryList');
const refreshGlossaryBtn = document.querySelector('#refreshGlossaryBtn');
const glossaryTotalEl = document.querySelector('#glossaryTotal');
const glossaryTopListEl = document.querySelector('#glossaryTopList');
const glossaryRecentListEl = document.querySelector('#glossaryRecentList');
const navLinks = [...document.querySelectorAll('.nav-link')];
const toastEl = document.querySelector('#toast');

const fields = {
  id: document.querySelector('#idInput'),
  previousName: document.querySelector('#previousNameInput'),
  name: document.querySelector('#nameInput'),
  category: document.querySelector('#categoryInput')
};

const variantKeys = ['standardCold', 'standardHot', 'bucketCold', 'bucketHot'];

let products = [];
let appUsers = [];
let categories = [];

function renderGlossaryStats(stats) {
  glossaryTotalEl.textContent = String(stats.total || 0);

  const topTerms = stats.topTerms || [];
  glossaryTopListEl.classList.toggle('empty-inline', topTerms.length === 0);
  glossaryTopListEl.innerHTML = topTerms.length
    ? topTerms
        .map(
          (item, index) => `
            <div class="glossary-item">
              <div class="glossary-rank">${index + 1}</div>
              <div class="glossary-main">
                <div class="glossary-term">${escapeHtml(item.term)}</div>
                <div class="glossary-desc">${escapeHtml(item.desc || '')}</div>
              </div>
              <div class="glossary-side">
                <strong>${Number(item.count || 0)}</strong>
                <span>${formatTime(item.lastLearnedAt)}</span>
              </div>
            </div>
          `
        )
        .join('')
    : '暂无数据';

  const recentLogs = stats.recentLogs || [];
  glossaryRecentListEl.classList.toggle('empty-inline', recentLogs.length === 0);
  glossaryRecentListEl.innerHTML = recentLogs.length
    ? recentLogs
        .map(
          (item) => `
            <div class="glossary-item">
              <div class="glossary-main">
                <div class="glossary-term">${escapeHtml(item.term)}</div>
                <div class="glossary-desc">${escapeHtml(item.username || '-')} · ${formatTime(item.createdAt)}</div>
              </div>
            </div>
          `
        )
        .join('')
    : '暂无数据';
}

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
          <td>
            <div class="product-name">
              <span>${escapeHtml(item.name)}</span>
              ${item.category ? `<span class="category-badge">${escapeHtml(item.category)}</span>` : ''}
            </div>
          </td>
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

function renderCategories() {
  const options = categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  const selectedFilter = categoryFilterSelect.dataset.value || '';
  const selectedCategory = fields.category.dataset.value || '';

  categoryFilterSelect.innerHTML = `<option value="">全部分类</option>${options}`;
  fields.category.innerHTML = `<option value="">未分类</option>${options}`;
  categoryFilterSelect.value = selectedFilter;
  fields.category.value = selectedCategory;
  fields.category.dataset.value = fields.category.value;

  categoryListEl.classList.toggle('empty-inline', categories.length === 0);
  categoryListEl.innerHTML = categories.length
    ? categories
        .map(
          (item) => `
            <div class="category-chip">
              <span>${escapeHtml(item)}</span>
              <button type="button" data-action="delete-category" data-name="${escapeHtml(item)}">删除</button>
            </div>
          `
        )
        .join('')
    : '暂无分类';
}

function renderVariantBadges(variants = {}) {
  const labels = {
    standardCold: '标准杯冰',
    standardHot: '标准杯热',
    bucketCold: '吨吨桶冰',
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
    category: categoryFilterSelect.value,
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

async function loadCategories() {
  const json = await request('/api/admin/category/list');
  categories = json.data || [];
  renderCategories();
}

async function loadGlossaryStats() {
  const json = await request('/api/admin/glossary/learn-stats?limit=10');
  renderGlossaryStats(json.data || { total: 0, topTerms: [], recentLogs: [] });
}

function openEditor(product) {
  document.querySelector('#dialogTitle').textContent = product ? '编辑产品' : '新增产品';
  fields.id.value = product?.id || '';
  fields.previousName.value = product?.name || '';
  fields.name.value = product?.name || '';
  fields.category.dataset.value = product?.category || '';
  fields.category.value = product?.category || '';
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
    category: fields.category.value.trim(),
    variants: readVariants()
  };
}

function setActiveSection(sectionId) {
  navLinks.forEach((button) => {
    const active = button.dataset.section === sectionId;
    button.classList.toggle('active', active);
  });
  document.querySelectorAll('.content-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== sectionId);
  });
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

categoryFilterSelect.addEventListener('change', () => {
  categoryFilterSelect.dataset.value = categoryFilterSelect.value;
  loadProducts().catch((error) => toast(error.message));
});

newBtn.addEventListener('click', () => openEditor());
closeBtn.addEventListener('click', () => dialog.close());
newUserBtn.addEventListener('click', () => openUserEditor());
userCloseBtn.addEventListener('click', () => userDialog.close());
navLinks.forEach((button) => {
  button.addEventListener('click', () => setActiveSection(button.dataset.section));
});
refreshGlossaryBtn.addEventListener('click', () => {
  loadGlossaryStats().catch((error) => toast(error.message));
});

categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await request('/api/admin/category/create', {
      method: 'POST',
      body: JSON.stringify({ name: categoryNameInput.value.trim() })
    });
    categoryNameInput.value = '';
    toast('分类已新增');
    await loadCategories();
    fields.category.dataset.value = '';
  } catch (error) {
    toast(error.message);
  }
});

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
    setActiveSection('productsSection');
    await Promise.all([loadCategories(), loadProducts(), loadAppUsers(), loadSettings(), loadGlossaryStats()]);
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
  categories = [];
  render();
  renderUsers();
  renderCategories();
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

categoryListEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.dataset.action !== 'delete-category') return;
  const name = button.dataset.name;
  if (!confirm(`确认删除分类「${name}」？`)) return;
  try {
    await request('/api/admin/category/delete', {
      method: 'DELETE',
      body: JSON.stringify({ name })
    });
    toast('分类已删除');
    if (categoryFilterSelect.value === name) {
      categoryFilterSelect.dataset.value = '';
    }
    await Promise.all([loadCategories(), loadProducts()]);
  } catch (error) {
    toast(error.message);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = getPayload();
  const isEdit = Boolean(payload.previousName);
  try {
    fields.category.dataset.value = payload.category;
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
    setActiveSection('productsSection');
    const results = await Promise.allSettled([loadCategories(), loadProducts(), loadAppUsers(), loadSettings(), loadGlossaryStats()]);
    const failed = results.find((item) => item.status === 'rejected');
    if (failed) {
      toast(failed.reason?.message || '部分数据加载失败');
    }
  } catch (error) {
    if (String(error.message || '').includes('请先登录') || String(error.message || '').includes('未登录')) {
      showLogin();
      return;
    }
    showAdmin();
    setActiveSection('productsSection');
    toast(error.message || '后台初始化失败');
  }
}

bootstrap();
