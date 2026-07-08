import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const PORT = Number(process.env.PORT || 4173);
const BASE_PATH = process.env.BASE_PATH ? ('/' + process.env.BASE_PATH.replace(/^\/+|\/+$/g, '')) : '';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'app.json');

// Load data from file or initialize defaults
function loadData() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }

  return {
    settings: {
      appName: "Bal Lekarza",
      eventName: "Bal Lekarza 2028",
      subtitle: "",
      eventDate: "",
      venueName: "",
      venueAddress: "",
      mapUrl: "",
      organizedTransportInfo: "",
      ownTransportInfo: "",
      siteMode: "open",
      comingSoonTitle: "Zapisy wkrótce",
      comingSoonMessage: "Bądź cierpliwy!",
      maintenanceTitle: "Przerwa techniczna",
      maintenanceMessage: "Wrócimy niedługo.",
      seatingVisible: false,
      seatingLockedMessage: "Plan stołów pojawi się po zatwierdzeniu.",
      logoText: "BL",
      logoSubtext: "Bal Lekarza",
      authEyebrow: "Zaloguj się",
      heroTagline: "Bal Lekarza 2028",
      heroCopy: "Witaj na balu!",
      adminWelcomeMessage: "Dobry wieczór, panel administratora czeka.",
      theme: {
        primary: "#c8a85c",
        background: "#fff8eb",
        gold: "#c8a85c",
        coral: "#ff6b6b",
        sage: "#6b8e71",
        cream: "#fff8eb",
        paper: "#fefbf5",
        mist: "#f0ebe2",
        ink: "#172036",
        muted: "#999999",
      }
    },
    infopack: {
      intro: "Witaj na balu!",
      schedule: [],
      sections: []
    },
    admin: {
      users: [
        {
          id: crypto.randomBytes(8).toString('hex'),
          email: 'admin@example.com',
          passwordHash: hashPassword('Admin2028!A1'),
          role: 'admin',
          name: 'Administrator'
        }
      ]
    },
    participants: [],
    layouts: {
      "sala-dolna": [],
      "sala-gorna": [],
      namiot: []
    },
    assets: [],
    notifications: [],
    paymentImports: [],
    limits: {
      readOnly: false,
      requestsToday: 0,
      dailyRequestLimit: 1000,
      requestPercent: 0,
      readOnlyAtPercent: 90,
      writesToday: 0,
      dailyWriteLimit: 500,
      writePercent: 0,
    }
  };
}

// Save data to file
function saveData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving data:', e);
    return false;
  }
}

// Hash password (simple - use bcrypt in production)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Load app data
let appData = loadData();

// Token sessions
const sessions = {};

function contentType(ext) {
  switch (ext.toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    case '.woff': return 'font/woff';
    case '.ttf': return 'font/ttf';
    default: return 'application/octet-stream';
  }
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': contentType(ext), 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

function verifyToken(token) {
  return sessions[token] || null;
}

function generateToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { userId, createdAt: Date.now() };
  return token;
}

const server = http.createServer((req, res) => {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `http://${host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
      pathname = pathname.slice(BASE_PATH.length) || '/';
    }

    // ===== API ENDPOINTS =====
    
    // Public: Get public settings
    if (pathname === '/api/public-settings' && req.method === 'GET') {
      jsonResponse(res, { settings: appData.settings, limits: appData.limits });
      return;
    }

    // Auth: Login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      parseBody(req).then(body => {
        const { email, password } = body;
        
        if (!email || !password) {
          return jsonResponse(res, { error: 'Email and password required' }, 400);
        }
        
        // Find user
        const user = appData.admin.users.find(u => u.email === email);
        if (!user || user.passwordHash !== hashPassword(password)) {
          return jsonResponse(res, { error: 'Invalid email or password' }, 401);
        }
        
        const token = generateToken(user.id);
        
        jsonResponse(res, {
          token,
          user: { id: user.id, email: user.email, role: user.role, displayName: user.name || email.split('@')[0] },
          app: appData,
          settings: appData.settings,
          participant: null
        });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Auth: Register
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      parseBody(req).then(body => {
        const participant = {
          id: crypto.randomBytes(8).toString('hex'),
          ...body,
          registrationStatus: 'pending',
          createdAt: new Date().toISOString(),
          paidDeposit: false,
          paidInstallment1: false,
          paidInstallment2: false,
          paidTransport: false,
          manualVerified: false
        };
        appData.participants.push(participant);
        saveData(appData);
        jsonResponse(res, { success: true, participant });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Get app data
    if (pathname === '/api/app' && req.method === 'GET') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      const user = appData.admin.users.find(u => u.id === session.userId);
      const userParticipant = appData.participants.find(p => p.email === user?.email);
      
      jsonResponse(res, {
        ...appData,
        user: { id: user?.id, email: user?.email, role: user?.role, displayName: user?.name },
        participant: userParticipant
      });
      return;
    }

    // Protected: Update profile
    if (pathname === '/api/me' && req.method === 'PATCH') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        const user = appData.admin.users.find(u => u.id === session.userId);
        const participant = appData.participants.find(p => p.email === user?.email);
        
        if (participant) {
          Object.assign(participant, body);
          saveData(appData);
          jsonResponse(res, { participant });
        } else {
          jsonResponse(res, { error: 'Participant not found' }, 404);
        }
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - update participant
    if (pathname.startsWith('/api/admin/participants/') && req.method === 'PATCH') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      const participantId = pathname.split('/').pop();
      parseBody(req).then(body => {
        const participant = appData.participants.find(p => p.id === participantId);
        if (participant) {
          Object.assign(participant, body);
          saveData(appData);
        }
        jsonResponse(res, { participant: participant || {} });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - settings
    if (pathname === '/api/admin/settings' && req.method === 'PATCH') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        if (body.settings) {
          Object.assign(appData.settings, body.settings);
        }
        if (body.infopack) {
          Object.assign(appData.infopack, body.infopack);
        }
        saveData(appData);
        jsonResponse(res, { settings: appData.settings, infopack: appData.infopack });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - export
    if (pathname === '/api/admin/export.xlsx' && req.method === 'GET') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      // Send dummy xlsx - in production generate real file
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end('PK...');
      return;
    }

    // Protected: Admin - backup
    if (pathname === '/api/admin/backup' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      const filename = `backup-${new Date().toISOString()}.json`;
      jsonResponse(res, { filename });
      return;
    }

    // Protected: Admin - backups list
    if (pathname === '/api/admin/backups' && req.method === 'GET') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      jsonResponse(res, { backups: [] });
      return;
    }

    // Protected: Admin - auto-seat
    if (pathname === '/api/admin/auto-seat' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      jsonResponse(res, { participants: appData.participants, assigned: 0 });
      return;
    }

    // Protected: Admin - import CSV
    if (pathname === '/api/admin/import-csv' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      jsonResponse(res, { updated: 0 });
      return;
    }

    // Protected: Admin - create account
    if (pathname === '/api/admin/create-account' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        const newParticipant = { 
          id: crypto.randomBytes(8).toString('hex'), 
          ...body,
          createdAt: new Date().toISOString(),
          paidDeposit: false,
          paidInstallment1: false,
          paidInstallment2: false,
          paidTransport: false,
          manualVerified: false
        };
        appData.participants.push(newParticipant);
        saveData(appData);
        jsonResponse(res, { participant: newParticipant });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - create admin
    if (pathname === '/api/admin/create-admin' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        const newAdmin = {
          id: crypto.randomBytes(8).toString('hex'),
          email: body.email,
          passwordHash: hashPassword(body.password || 'Admin2028!A1'),
          role: 'admin',
          name: body.name || body.email
        };
        appData.admin.users.push(newAdmin);
        saveData(appData);
        jsonResponse(res, { users: appData.admin.users });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - message
    if (pathname === '/api/admin/message' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        const notification = {
          id: crypto.randomBytes(8).toString('hex'),
          ...body,
          createdAt: new Date().toISOString()
        };
        appData.notifications.push(notification);
        saveData(appData);
        jsonResponse(res, { scheduled: false, count: appData.participants.length });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - tables
    if (pathname === '/api/admin/tables' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        saveData(appData);
        jsonResponse(res, { layouts: appData.layouts, table: body });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - table updates
    if (pathname.startsWith('/api/admin/tables/') && req.method === 'PATCH') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        saveData(appData);
        jsonResponse(res, { layouts: appData.layouts, table: body, updatedParticipants: 0 });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - assets
    if (pathname === '/api/admin/assets' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        const asset = { 
          id: crypto.randomBytes(8).toString('hex'), 
          ...body, 
          createdAt: new Date().toISOString() 
        };
        appData.assets.push(asset);
        saveData(appData);
        jsonResponse(res, { assets: appData.assets });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // Protected: Admin - delete asset
    if (pathname.startsWith('/api/admin/assets/') && req.method === 'DELETE') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      const assetId = pathname.split('/').pop();
      appData.assets = appData.assets.filter(a => a.id !== assetId);
      saveData(appData);
      jsonResponse(res, { assets: appData.assets });
      return;
    }

    // Protected: Admin - seating export
    if (pathname === '/api/admin/seating.csv' && req.method === 'GET') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      // Generate CSV
      let csv = 'Name,Room,Table,Seat,Diet\n';
      appData.participants.forEach(p => {
        csv += `"${p.name}","${p.roomName || ''}","${p.tableId || ''}","${p.seatNo || ''}","${p.diet || ''}"\n`;
      });
      
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      res.end(csv);
      return;
    }

    // Protected: Admin - import bank CSV
    if (pathname === '/api/admin/import-bank-csv' && req.method === 'POST') {
      const token = getToken(req);
      const session = verifyToken(token);
      
      if (!session) {
        return jsonResponse(res, { error: 'Unauthorized' }, 401);
      }
      
      parseBody(req).then(body => {
        saveData(appData);
        jsonResponse(res, { 
          matched: 0, 
          changedFields: 0,
          applied: [],
          ambiguous: [],
          unmatched: [],
          participants: appData.participants,
          paymentImports: appData.paymentImports
        });
      }).catch(e => {
        console.error(e);
        jsonResponse(res, { error: 'Invalid request' }, 400);
      });
      return;
    }

    // ===== STATIC FILES =====
    let filePath = path.join(PUBLIC_DIR, pathname);
    if (pathname === '/' || pathname === '') filePath = path.join(PUBLIC_DIR, 'index.html');

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Server error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexData);
        });
        return;
      }

      sendFile(res, filePath);
    });
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}, basePath=${BASE_PATH || '/'} `);
  console.log(`Database: ${DB_FILE}`);
});
