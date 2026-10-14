import { useEffect, useState } from 'react';

const API = '/api';

async function request(path, options = {}, token = '') {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('task_token') || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('task_user') || 'null'); } catch { return null; }
  });
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function saveSession(data) {
    setToken(data.token);
    setUser(data.user);
    sessionStorage.setItem('task_token', data.token);
    sessionStorage.setItem('task_user', JSON.stringify(data.user));
  }

  function logout() {
    setToken('');
    setUser(null);
    setTasks([]);
    sessionStorage.removeItem('task_token');
    sessionStorage.removeItem('task_user');
    setNotice('You have been logged out.');
    setError('');
  }

  async function loadTasks(currentToken = token) {
    const data = await request('/tasks', {}, currentToken);
    setTasks(data.tasks);
  }

  useEffect(() => {
    if (!token) return;
    loadTasks().catch((err) => {
      setError(err.message);
      if (err.message.toLowerCase().includes('session') || err.message.toLowerCase().includes('log in')) logout();
    });
    // Re-run only when the session token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAuth(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await request(`/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      saveSession(data);
      setPassword('');
      setNotice(mode === 'register' ? 'Account created successfully.' : 'Welcome back.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addTask(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/tasks', { method: 'POST', body: JSON.stringify({ title }) }, token);
      setTitle('');
      await loadTasks();
      setNotice('Task added.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function toggleTask(task) {
    setError(''); setNotice('');
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH', body: JSON.stringify({ completed: !task.completed })
      }, token);
      await loadTasks();
    } catch (err) { setError(err.message); }
  }

  async function deleteTask(task) {
    setError(''); setNotice('');
    try {
      await request(`/tasks/${task.id}`, { method: 'DELETE' }, token);
      await loadTasks();
      setNotice('Task deleted.');
    } catch (err) { setError(err.message); }
  }

  const completedCount = tasks.filter((task) => task.completed).length;

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Task Manager home">
          <span className="brand-mark">✓</span><span>Task<span className="brand-light">Flow</span></span>
        </a>
        {user && <div className="user-area"><span className="user-email">{user.email}</span><button className="button button-quiet" onClick={logout}>Log out</button></div>}
      </header>

      {!token ? (
        <section className="auth-layout">
          <div className="intro">
            <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
            <h1>Make space for<br /><span>what matters.</span></h1>
            <p>Keep your day organized. Capture tasks, track progress, and celebrate the small wins.</p>
            <div className="mini-stats"><div><strong>01</strong><span>Capture</span></div><div><strong>02</strong><span>Complete</span></div><div><strong>03</strong><span>Move forward</span></div></div>
          </div>
          <form className="auth-card" onSubmit={handleAuth}>
            <div className="card-icon">✦</div>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="muted">{mode === 'login' ? 'Sign in to continue to your workspace.' : 'Start organizing your tasks today.'}</p>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} />
            {mode === 'register' && <small className="muted">Use at least 8 characters.</small>}
            {error && <p className="message error" role="alert">{error}</p>}
            {notice && <p className="message success" role="status">{notice}</p>}
            <button className="button button-primary full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>
            <p className="switch-mode">{mode === 'login' ? 'New here?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }}> {mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
          </form>
        </section>
      ) : (
        <section className="dashboard">
          <div className="dashboard-heading">
            <div><span className="eyebrow">YOUR WORKSPACE</span><h1>Today's focus<span className="period">.</span></h1><p className="muted">One step at a time. You've got this.</p></div>
            <div className="progress-card"><span>COMPLETED</span><strong>{completedCount}<small> / {tasks.length}</small></strong><div className="progress-track"><span style={{ width: `${tasks.length ? completedCount / tasks.length * 100 : 0}%` }} /></div></div>
          </div>
          <form className="add-task" onSubmit={addTask}><span className="plus">＋</span><input aria-label="New task title" placeholder="What needs to get done?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required /><button className="button button-primary" disabled={busy || !title.trim()}>Add task <span>→</span></button></form>
          {error && <p className="message error" role="alert">{error}</p>}
          {notice && <p className="message success" role="status">{notice}</p>}
          <div className="list-heading"><h2>Your tasks</h2><span className="count-pill">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span></div>
          <div className="task-list">
            {tasks.map((task) => <article className={`task-row ${task.completed ? 'is-complete' : ''}`} key={task.id}>
              <button className={`check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'} onClick={() => toggleTask(task)}>{task.completed ? '✓' : ''}</button>
              <div className="task-copy"><span>{task.title}</span><small>{task.completed ? 'Completed' : 'In progress'}</small></div>
              <button className="delete-button" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task)}>Delete</button>
            </article>)}
            {tasks.length === 0 && <div className="empty-state"><div>✦</div><h3>Your list is a blank canvas.</h3><p>Add your first task above and build a little momentum.</p></div>}
          </div>
          <p className="footnote">Your tasks are saved to the application database.</p>
        </section>
      )}
      <footer>TaskFlow <span>·</span> A full-stack cloud learning project</footer>
    </main>
  );
}
