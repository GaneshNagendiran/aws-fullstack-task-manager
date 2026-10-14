require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool, initDb } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Requests without Origin include curl/health checks. Browser origins must be allowed.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

function makeToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check database error:', err.message);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be 8 to 72 characters long.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({ token: makeToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(err);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({ token: makeToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

app.get('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, title, completed, created_at FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [Number(req.user.sub)]
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    next(err);
  }
});

app.post('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'Task title must be between 1 and 200 characters.' });
    }
    const result = await pool.query(
      'INSERT INTO tasks (user_id, title) VALUES ($1, $2) RETURNING id, title, completed, created_at',
      [Number(req.user.sub), title]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || typeof req.body.completed !== 'boolean') {
      return res.status(400).json({ error: 'Provide a valid task ID and completed boolean.' });
    }
    const result = await pool.query(
      'UPDATE tasks SET completed = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, completed, created_at',
      [req.body.completed, id, Number(req.user.sub)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Task not found.' });
    res.json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid task ID.' });
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, Number(req.user.sub)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Task not found.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

app.use((err, _req, res, _next) => {
  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: 'This website origin is not allowed.' });
  }
  console.error('Request error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Task Manager API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start API:', err.message);
  process.exit(1);
});
