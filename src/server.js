const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { createStore } = require('./store');
const { recognizeSentence } = require('./asr');

const app = express();
const store = createStore();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'local-dev-session-secret';
const sessionMaxAgeSeconds = Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 24);

function ok(res, data, extra = {}) {
  res.json({ success: true, data, ...extra });
}

function fail(res, status, message) {
  res.status(status).json({ success: false, message });
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function createSessionToken(user) {
  const payload = base64url(
    JSON.stringify({
      id: user.id,
      username: user.username,
      kind: 'admin',
      exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
    })
  );
  return `${payload}.${sign(payload)}`;
}

function createAppToken(user) {
  const payload = base64url(
    JSON.stringify({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      wechatBound: Boolean(user.wechatBound),
      kind: 'app',
      exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
    })
  );
  return `${payload}.${sign(payload)}`;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      id: data.id,
      username: data.username,
      displayName: data.displayName,
      wechatBound: Boolean(data.wechatBound),
      kind: data.kind || 'admin'
    };
  } catch (error) {
    return null;
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function requestWechatSession(code) {
  const appId = String(process.env.WECHAT_APP_ID || process.env.MINIAPP_APP_ID || '').trim();
  const appSecret = String(process.env.WECHAT_APP_SECRET || process.env.MINIAPP_APP_SECRET || '').trim();
  if (!appId || !appSecret) {
    const error = new Error('服务端未配置 WECHAT_APP_ID / WECHAT_APP_SECRET');
    error.status = 500;
    throw error;
  }
  const query = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: String(code || '').trim(),
    grant_type: 'authorization_code'
  });

  return new Promise((resolve, reject) => {
    https
      .get(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`, (response) => {
        let raw = '';
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          try {
            const data = JSON.parse(raw || '{}');
            if (data.errcode) {
              const error = new Error(data.errmsg || '微信登录失败');
              error.status = 400;
              reject(error);
              return;
            }
            resolve(data);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const user = verifySessionToken(cookies.admin_session);
  return user?.kind === 'admin' ? user : null;
}

function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return fail(res, 401, '请先登录');
  req.adminUser = user;
  return next();
}

function getBearerUser(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const user = verifySessionToken(match[1]);
  return user?.kind === 'app' ? user : null;
}

function requireAppUser(req, res, next) {
  const user = getBearerUser(req);
  if (!user) return fail(res, 401, '请先登录后再查询');
  req.appUser = user;
  return next();
}

app.get('/healthz', (req, res) => {
  ok(res, { status: 'ok' });
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) return fail(res, 400, '请输入用户名和密码');
    const user = await store.verifyAdminLogin(username, password);
    if (!user) return fail(res, 401, '用户名或密码错误');
    setSessionCookie(res, createSessionToken(user));
    ok(res, user);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/logout', (req, res) => {
  clearSessionCookie(res);
  ok(res, true);
});

app.get('/api/admin/session', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return fail(res, 401, '未登录');
  ok(res, user);
});

app.post('/api/user/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) return fail(res, 400, '请输入账号和密码');
    const user = await store.verifyAppUserLogin(username, password);
    if (!user) return fail(res, 401, '账号或密码错误，或账号已被停用');
    ok(res, { token: createAppToken(user), user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/user/wechat-login', async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim();
    if (!code) return fail(res, 400, '缺少微信登录凭证');
    const session = await requestWechatSession(code);
    const user = await store.verifyAppUserWechatLogin(session.openid);
    if (!user) return fail(res, 404, '当前微信号未绑定账号，请先使用账号密码登录后在个人中心绑定');
    ok(res, { token: createAppToken(user), user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/user/session', (req, res) => {
  const user = getBearerUser(req);
  if (!user) return fail(res, 401, '未登录');
  ok(res, {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    wechatBound: Boolean(user.wechatBound)
  });
});

app.get('/api/user/profile', requireAppUser, async (req, res, next) => {
  try {
    const user = await store.getAppUserById(req.appUser.id);
    if (!user) return fail(res, 404, '用户不存在');
    ok(res, user);
  } catch (error) {
    next(error);
  }
});

app.get('/api/app/settings', async (req, res, next) => {
  try {
    ok(res, await store.getAppSettings());
  } catch (error) {
    next(error);
  }
});

app.put('/api/user/profile', requireAppUser, async (req, res, next) => {
  try {
    const user = await store.updateOwnAppUser(req.appUser.id, req.body || {});
    ok(res, { user, token: createAppToken(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/user/wechat-bind', requireAppUser, async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim();
    if (!code) return fail(res, 400, '缺少微信绑定凭证');
    const session = await requestWechatSession(code);
    const user = await store.bindWechatToAppUser(req.appUser.id, session.openid);
    ok(res, { user, token: createAppToken(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/product/search', requireAppUser, async (req, res, next) => {
  try {
    const keyword = String(req.body.keyword || '').trim();
    if (!keyword) return fail(res, 400, '请输入产品名称');
    const product = await store.search(keyword);
    if (!product) return fail(res, 404, '未找到对应产品，请检查名称');
    ok(res, {
      id: product.id,
      name: product.name,
      cupType: product.cupType,
      temperature: product.temperature,
      method: product.method
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/product/recommend', requireAppUser, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 8), 20);
    ok(res, await store.recommend(limit));
  } catch (error) {
    next(error);
  }
});

app.get('/api/product/hot', requireAppUser, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 8), 20);
    ok(res, await store.hot(limit));
  } catch (error) {
    next(error);
  }
});

app.get('/api/product/catalog', requireAppUser, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 200), 1), 500);
    const result = await store.listGroups({
      keyword: req.query.keyword || '',
      page,
      pageSize
    });
    ok(res, result.items, { total: result.total, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.post('/api/glossary/learned', requireAppUser, async (req, res, next) => {
  try {
    ok(
      res,
      await store.recordGlossaryLearn({
        term: req.body.term,
        desc: req.body.desc,
        source: req.body.source,
        userId: req.appUser.id,
        username: req.appUser.username
      })
    );
  } catch (error) {
    next(error);
  }
});

app.post('/api/asr/recognize', requireAppUser, async (req, res, next) => {
  try {
    const audioBase64 = String(req.body.audio || '').trim();
    const voiceFormat = String(req.body.format || 'mp3').trim().toLowerCase();
    const audioByteLength = Number(req.body.byteLength || 0);

    if (!audioBase64) return fail(res, 400, '缺少语音数据');
    if (!audioByteLength || audioByteLength <= 0) return fail(res, 400, '缺少语音长度');

    const result = await recognizeSentence({
      audioBase64,
      audioByteLength,
      voiceFormat
    });

    if (!result.text) return fail(res, 422, '未识别到清晰语音，请重试');
    ok(res, { text: result.text });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/product/list', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const result = await store.listGroups({
      keyword: req.query.keyword || '',
      category: req.query.category || '',
      page,
      pageSize
    });
    ok(res, result.items, { total: result.total, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/category/list', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.listCategories());
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/category/create', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.createCategory(req.body.name));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/category/delete', requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || req.query.name || '').trim();
    if (!name) return fail(res, 400, '缺少分类名称');
    await store.deleteCategory(name);
    ok(res, true);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/product/create', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.saveGroup(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/product/update', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.saveGroup(req.body));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/product/delete', requireAdmin, async (req, res, next) => {
  try {
    const name = req.body.name || req.query.name;
    if (!name) return fail(res, 400, '缺少产品名称');
    await store.deleteGroup(String(name));
    ok(res, true);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/app-user/list', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 100);
    const result = await store.listAppUsers({
      keyword: req.query.keyword || '',
      page,
      pageSize
    });
    ok(res, result.items, { total: result.total, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/app-user/create', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.createAppUser(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/app-user/update', requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.body.id || '').trim();
    if (!id) return fail(res, 400, '缺少用户 ID');
    ok(res, await store.updateAppUser(id, req.body));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/app-user/delete', requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.body.id || req.query.id || '').trim();
    if (!id) return fail(res, 400, '缺少用户 ID');
    await store.deleteAppUser(id);
    ok(res, true);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/app-settings', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.getAppSettings());
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/app-settings', requireAdmin, async (req, res, next) => {
  try {
    ok(res, await store.updateAppSettings(req.body || {}));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/glossary/learn-stats', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    ok(res, await store.listGlossaryLearnStats(limit));
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  fail(res, 404, '接口不存在');
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const message = status >= 500 ? '服务器错误' : error.message;
  if (status >= 500) console.error(error);
  fail(res, status, message);
});

async function bootstrap() {
  await store.init();
  const port = Number(process.env.PORT || 80);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Coffee SOP backend listening on ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
