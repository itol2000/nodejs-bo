// 生产日报看板 —— 实时同步后端（零依赖，仅用 Node 内置模块）
// 功能：
//   GET  /            返回看板页面 (public/index.html)
//   GET  /api/data    公开读取当前全部数据（查看员/任何人可读）
//   POST /api/data     写入数据，需管理员密码（请求头 x-admin-password）
// 数据持久化在 data.json（首次自动从 seed.json 初始化）

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const SEED_FILE = path.join(ROOT, 'seed.json');
const INDEX_FILE = path.join(ROOT, 'public', 'index.html');

function normalize(d) {
  if (!d.adminUser) d.adminUser = 'admin';
  if (!d.adminPass) d.adminPass = 'admin123';
  if (!d.viewerPass) d.viewerPass = '112233';
  if (!d.materials) d.materials = [];
  if (!d.products) d.products = [];
  if (!d.records) d.records = [];
  return d;
}

function loadData() {
  try {
    return normalize(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (e) {
    let seed = null;
    try { seed = normalize(JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))); } catch (_) {}
    if (!seed) {
      seed = normalize({ materials: [], products: [], records: [], inventory: {}, initSet: {} });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}

let data = loadData();
function persist(d) {
  data = d;
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // 读取数据（公开）—— 不返回任何密码字段，避免密码泄露
  if (req.method === 'GET' && url === '/api/data') {
    const safe = Object.assign({}, data);
    delete safe.adminPass; delete safe.adminUser; delete safe.viewerPass;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(safe));
    return;
  }

  // 登录校验（不返回密码，仅告知角色）
  if (req.method === 'POST' && url === '/api/login') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { pass } = JSON.parse(body);
        if (pass === data.adminPass) sendJSON(res, 200, { ok: true, role: 'admin' });
        else if (pass === data.viewerPass) sendJSON(res, 200, { ok: true, role: 'viewer' });
        else sendJSON(res, 401, { ok: false, error: 'unauthorized' });
      } catch (e) { sendJSON(res, 400, { ok: false, error: 'parse' }); }
    });
    return;
  }

  // 写入数据（管理员密码校验）
  if (req.method === 'POST' && url === '/api/data') {
    const pw = req.headers['x-admin-password'] || '';
    if (pw !== data.adminPass) { sendJSON(res, 401, { ok: false, error: 'unauthorized' }); return; }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (!d || !Array.isArray(d.materials) || !Array.isArray(d.records)) {
          sendJSON(res, 400, { ok: false, error: 'bad data' }); return;
        }
        // 防误清空：原料为空且当前已有数据则拒绝
        if (d.materials.length === 0 && data.materials.length > 0) {
          sendJSON(res, 400, { ok: false, error: 'empty not allowed' }); return;
        }
        persist(d);
        sendJSON(res, 200, { ok: true, ts: Date.now() });
      } catch (e) {
        sendJSON(res, 400, { ok: false, error: 'parse error' });
      }
    });
    return;
  }

  // 健康检查
  if (req.method === 'GET' && url === '/api/health') {
    sendJSON(res, 200, { ok: true, records: data.records.length });
    return;
  }

  // 首页
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    fs.readFile(INDEX_FILE, (err, html) => {
      if (err) { res.writeHead(404); res.end('index.html not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log('生产日报看板后端已启动: http://localhost:' + PORT);
});
