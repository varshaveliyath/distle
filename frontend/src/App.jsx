import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Heart,
  MapPin,
  User,
  Link2,
  LogOut,
  UserPlus,
  LogIn,
  Sparkles,
  Navigation,
  CheckCircle2,
  Quote,
  Compass,
  Map as MapIcon,
  Send,
  Image as ImageIcon,
  Calendar as CalendarIcon,
  Flame,
  Upload,
  ChevronLeft,
  X,
  ShieldCheck,
  Link,
  Download,
  Database as DatabaseIcon,
  Table,
  Eye,
  EyeOff,
  Key,
  Trash2
} from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(API_URL);

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth'); // auth, pairing, dashboard, admin_login, admin_dashboard
  const [activeTab, setActiveTab] = useState('distance'); // distance, profile
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken'));
  const [adminPassword, setAdminPassword] = useState('');
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inputCode, setInputCode] = useState('');

  // Real-time states
  const [distance, setDistance] = useState(null);
  const [midpoint, setMidpoint] = useState(null);
  const [isTogether, setIsTogether] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [myNote, setMyNote] = useState('');
  const [partnerStatus, setPartnerStatus] = useState({ note: '', photo_url: '', streak_count: 0 });

  // Archival states (Phase 3)
  const [showHistory, setShowHistory] = useState(null); // { date, note, photo_url } or null
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (window.location.pathname === '/admin') {
      if (adminToken) setView('admin_dashboard');
      else setView('admin_login');
    } else if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setMyNote(parsedUser.note || '');
      socket.emit('join', parsedUser.id);
      fetchPartnerStatus(parsedUser.id);

      // Sync latest profile from backend
      fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: parsedUser.username, password: parsedUser.password })
      }).then(res => res.json()).then(data => {
        if (data.id) {
          setUser(data);
          localStorage.setItem('user', JSON.stringify(data));
        }
      });

      if (parsedUser.pair_id) setView('dashboard');
      else setView('pairing');

      // Sync user with SW for widgets
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_USER',
          user: parsedUser
        });
      }
    }

    // Handle back button
    const handlePopState = (e) => {
      if (e.state && e.state.view) {
        setView(e.state.view);
        if (e.state.view !== 'dashboard') setShowHistory(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newView) => {
    setView(newView);
    window.history.pushState({ view: newView }, '', '');
  };

  const fetchPartnerStatus = async (uid) => {
    try {
      const res = await fetch(`${API_URL}/api/partner-status/${uid}`);
      const data = await res.json();
      if (data) setPartnerStatus(data);
    } catch (e) {
      console.error("Failed to sync partner status");
    }
  };

  const fetchHistory = async (dayOffset) => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().split('T')[0];

    // Check if this date is within streak (simplified demo logic)
    if (dayOffset >= (partnerStatus.streak_count || 1)) {
      alert("This memory is beyond your current streak!");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/history/${user.id}/${dateStr}`);
      const data = await res.json();
      setShowHistory({ date: dateStr, ...data });
    } catch (e) {
      console.error("Failed to fetch history");
    }
  };

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${API_URL}${cleanUrl}`;
  };

  const downloadImage = async (url, filename) => {
    try {
      const response = await fetch(getImageUrl(url));
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'distle-moment.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  useEffect(() => {
    if (user) {
      socket.on('distance-update', ({ distance, midpoint, accuracy }) => {
        setDistance(distance.toFixed(2));
        setMidpoint(midpoint);
        setIsTogether(distance < 0.05);
        if (accuracy) setAccuracy(accuracy);
      });

      socket.on('partner-note-update', ({ note, streak }) => {
        setPartnerStatus(prev => ({ ...prev, note, streak, streak_count: streak !== undefined ? streak : prev.streak_count }));
      });

      socket.on('partner-photo-update', ({ photoUrl, streak }) => {
        setPartnerStatus(prev => ({ ...prev, photo_url: photoUrl, streak_count: streak !== undefined ? streak : prev.streak_count }));
      });

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          socket.emit('update-location', {
            userId: user.id,
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (err) => console.error(err),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );

      const interval = setInterval(() => fetchPartnerStatus(user.id), 15000);

      return () => {
        navigator.geolocation.clearWatch(watchId);
        socket.off('distance-update');
        socket.off('partner-note-update');
        socket.off('partner-photo-update');
        clearInterval(interval);
      };
    }
  }, [user]);

  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      alert("Registration requires both a unique User ID and a Password.");
      return;
    }
    setLoading(true);
    try {
      const url = authMode === 'login' ? '/api/login' : '/api/register';
      const res = await fetch(`${API_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.id) {
        setUser(data);
        setMyNote(data.note || '');
        localStorage.setItem('user', JSON.stringify(data));
        socket.emit('join', data.id);
        fetchPartnerStatus(data.id);
        if (data.pair_id) navigateTo('dashboard');
        else navigateTo('pairing');
      } else {
        alert(data.error || 'Login failed. Please try again.');
      }
    } catch (e) {
      alert("Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  const updateMyNote = async () => {
    if (!myNote.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, note: myNote })
      });
      const data = await res.json();
      const updatedUser = { ...user, note: myNote, streak_count: data.streak };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setPartnerStatus(p => ({ ...p, streak_count: data.streak }));
      setMyNote(''); // Reset input area to empty
    } catch (e) {
      console.error("Failed to send thought");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('userId', user.id);

    try {
      const res = await fetch(`${API_URL}/api/photo`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        const updatedUser = { ...user, photo_url: data.photoUrl, streak_count: data.streak };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setPartnerStatus(p => ({ ...p, streak_count: data.streak }));
      }
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const handlePairing = async () => {
    if (!inputCode.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, partnerCode: inputCode })
      });
      const data = await res.json();
      if (data.success) {
        const updatedUser = { ...user, pair_id: data.partnerId };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        navigateTo('dashboard');
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert("Pairing failed.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setAdminToken(null);
    setUsername('');
    setPassword('');
    setInputCode('');
    setDistance(null);
    setAccuracy(null);
    setPartnerStatus({ note: '', photo_url: '', streak_count: 0 });
    navigateTo('auth');
  };

  const handleAdminLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });
      const data = await res.json();
      if (data.success) {
        setAdminToken(data.token);
        localStorage.setItem('adminToken', data.token);
        setView('admin_dashboard');
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Admin login failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabases = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/databases`);
      const data = await res.json();
      setDatabases(data);
    } catch (e) { console.error("Failed to fetch databases"); }
  };

  const fetchTables = async (dbName) => {
    setSelectedDb(dbName);
    setSelectedTable(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/tables?db=${dbName}`);
      const data = await res.json();
      setTables(data);
    } catch (e) { console.error("Failed to fetch tables"); }
  };

  const fetchTableData = async (dbName, tableName) => {
    setSelectedTable(tableName);
    try {
      const res = await fetch(`${API_URL}/api/admin/data?db=${dbName}&table=${tableName}`);
      const data = await res.json();
      setTableData(data);
    } catch (e) { console.error("Failed to fetch table data"); }
  };

  const handleDeleteRow = async (rowIndex) => {
    const row = tableData[rowIndex];
    // Find a suitable ID column (id, username, user_id, or just the first key)
    const idKey = Object.keys(row).find(k => ['id', 'username', 'user_id'].includes(k.toLowerCase())) || Object.keys(row)[0];
    const idValue = row[idKey];

    if (!window.confirm(`Are you sure you want to delete this row where ${idKey}='${idValue}'?`)) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/row`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db: selectedDb,
          table: selectedTable,
          column: idKey,
          value: idValue
        })
      });
      const data = await res.json();
      if (data.success) {
        setTableData(prev => prev.filter((_, i) => i !== rowIndex));
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Delete failed");
    }
  };

  useEffect(() => {
    if (view === 'admin_dashboard') {
      fetchDatabases();
    }
  }, [view]);

  if (view === 'admin_login') {
    return (
      <div className="app-shell">
        <div className="scroll-area" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <Key size={64} color="var(--accent-violet)" style={{ marginBottom: '1.5rem', filter: 'drop-shadow(0 0 15px var(--accent-violet-glow))' }} />
            <h1>Admin</h1>
            <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>System Access Protocol</p>
          </div>
          <div className="glass-panel">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ position: 'relative' }}>
                <input
                  className="input-field"
                  type={showAdminPassword ? "text" : "password"}
                  placeholder="Admin Password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                  type="button"
                >
                  {showAdminPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
              <button className={`btn-primary ${loading ? 'btn-loading' : ''}`} onClick={handleAdminLogin}>
                {loading ? <div className="loading-spinner"></div> : <ShieldCheck size={20} />}
                {loading ? 'Verifying...' : 'Access Terminal'}
              </button>
              <button className="btn-secondary" onClick={() => (window.location.href = '/')}>Back to App</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'admin_dashboard') {
    return (
      <div className="app-shell" style={{ maxWidth: '800px', maxHeight: 'none' }}>
        <header style={{ padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', background: 'rgba(3,3,3,0.3)', backdropFilter: 'blur(10px)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 800 }}>
            <DatabaseIcon size={24} color="var(--accent-violet)" />
            Admin Dashboard
          </h2>
          <button className="btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={logout}>Logout</button>
        </header>

        <div className="scroll-area">
          <div style={{ display: 'grid', gridTemplateColumns: selectedDb ? '200px 1fr' : '1fr', gap: '1.5rem', height: '100%' }}>
            {/* Sidebar / DB List */}
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>Databases</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {databases.map(db => (
                  <button
                    key={db}
                    onClick={() => fetchTables(db)}
                    style={{
                      padding: '0.75rem',
                      background: selectedDb === db ? 'var(--accent-violet)' : 'rgba(255,255,255,0.03)',
                      color: selectedDb === db ? 'black' : 'white',
                      border: 'none',
                      borderRadius: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {db}
                  </button>
                ))}
              </div>

              {selectedDb && (
                <>
                  <h3 style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '1.5rem 0 1rem', textTransform: 'uppercase' }}>Tables</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {tables.map(table => (
                      <button
                        key={table}
                        onClick={() => fetchTableData(selectedDb, table)}
                        style={{
                          padding: '0.75rem',
                          background: selectedTable === table ? 'var(--accent-magenta)' : 'rgba(255,255,255,0.03)',
                          color: selectedTable === table ? 'black' : 'white',
                          border: 'none',
                          borderRadius: '12px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem'
                        }}
                      >
                        <Table size={14} style={{ marginRight: '0.5rem' }} /> {table}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Main Content / Table Data */}
            {selectedTable ? (
              <div className="glass-panel" style={{ padding: '1rem', overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{selectedTable} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>in {selectedDb}</span></h3>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Showing {tableData.length} records</span>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      {tableData.length > 0 && Object.keys(tableData[0]).map(key => (
                        <th key={key}>{key}</th>
                      ))}
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => (
                      <tr key={idx}>
                        {Object.values(row).map((val, i) => (
                          <td key={i}>{val !== null ? val.toString() : 'NULL'}</td>
                        ))}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteRow(idx)}
                            style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.5rem' }}
                            title="Delete Row"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Eye size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                <p>Select a database and table to explore data.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="app-shell">
        <div className="scroll-area" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <Sparkles size={64} color="var(--accent-violet)" style={{ marginBottom: '1.5rem', filter: 'drop-shadow(0 0 15px var(--accent-violet-glow))' }} />
            <h1>distle</h1>
            <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>The definitive bridge for distant souls.</p>
          </div>
          <div className="glass-panel">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '18px' }}>
              <button style={{ flex: 1, padding: '0.75rem', border: 'none', background: authMode === 'login' ? '#ffffff' : 'transparent', color: authMode === 'login' ? '#000000' : 'white', fontWeight: 700, borderRadius: '14px', cursor: 'pointer', transition: 'var(--transition-premium)' }} onClick={() => setAuthMode('login')}>Login</button>
              <button style={{ flex: 1, padding: '0.75rem', border: 'none', background: authMode === 'register' ? '#ffffff' : 'transparent', color: authMode === 'register' ? '#000000' : 'white', fontWeight: 700, borderRadius: '14px', cursor: 'pointer', transition: 'var(--transition-premium)' }} onClick={() => setAuthMode('register')}>Register</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <input className="input-field" type="text" placeholder="User ID" value={username} onChange={e => setUsername(e.target.value)} />
              <div style={{ position: 'relative' }}>
                <input
                  className="input-field"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                  type="button"
                >
                  {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
              <button className={`btn-primary ${loading ? 'btn-loading' : ''}`} onClick={handleAuth}>
                {loading ? <div className="loading-spinner"></div> : (authMode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />)}
                {loading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Register')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'pairing') {
    return (
      <div className="app-shell">
        <header style={{ padding: '1rem', display: 'flex', alignItems: 'center', background: 'transparent', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <button onClick={logout} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={24} />
          </button>
        </header>
        <div className="scroll-area">
          <div style={{ textAlign: 'center', margin: '4rem 0' }}>
            <Link2 size={56} color="var(--accent-violet)" style={{ marginBottom: '1.5rem', filter: 'drop-shadow(0 0 10px var(--accent-violet-glow))' }} />
            <h1>Pair With Partner</h1>
            <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Connect with your partner.</p>
          </div>
          <div className="glass-panel" style={{ textAlign: 'center' }}>
            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 800, color: 'var(--text-muted)' }}>Your Code</label>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, margin: '1.5rem 0', letterSpacing: '0.3em', color: '#ffffff' }}>{user.pairing_code}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2.5rem' }}>
              <input className="input-field" style={{ textAlign: 'center', letterSpacing: '0.5em', fontWeight: 800, fontSize: '1.2rem' }} type="text" maxLength="6" value={inputCode} onChange={e => setInputCode(e.target.value)} placeholder="000000" />
              <button className={`btn-primary ${loading ? 'btn-loading' : ''}`} onClick={handlePairing}>
                {loading ? <div className="loading-spinner"></div> : <Navigation size={20} />}
                {loading ? 'Linking...' : 'Register Partner'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Interaction History Modal (Phase 3) */}
      {showHistory && (
        <div className="history-overlay" style={{ position: 'absolute', inset: 0, background: 'var(--app-bg)', zIndex: 200, padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.5s ease-out', overflowY: 'auto' }}>
          <button onClick={() => setShowHistory(null)} style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'white', marginBottom: '2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <ChevronLeft size={24} /> Back to Live
          </button>

          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-violet)', fontWeight: 800, letterSpacing: '0.3em' }}>PROTOCOL ARCHIVE</span>
            <h2 style={{ marginTop: '0.5rem', fontSize: '2rem' }}>{showHistory.date}</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* My Memory */}
            <div className="glass-panel" style={{ background: 'rgba(167, 139, 250, 0.05)', border: '1px solid rgba(167, 139, 250, 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-violet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Your Sync</span>
                {showHistory.mine?.photo_url && (
                  <button onClick={() => downloadImage(showHistory.mine.photo_url, `my-memory-${showHistory.date}.jpg`)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-violet)', cursor: 'pointer' }}><Download size={16} /></button>
                )}
              </div>
              <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1rem', fontStyle: showHistory.mine?.note ? 'normal' : 'italic' }}>
                {showHistory.mine?.note || "Silence in your sync cycle..."}
              </p>
              {showHistory.mine?.photo_url && (
                <div className="media-card" style={{ width: '100%', aspectRatio: '16/9' }}>
                  <img src={getImageUrl(showHistory.mine.photo_url)} alt="My Archive" />
                </div>
              )}
            </div>

            {/* Partner's Memory */}
            <div className="glass-panel" style={{ background: 'rgba(244, 114, 182, 0.05)', border: '1px solid rgba(244, 114, 182, 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-magenta)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Partner's Sync</span>
                {showHistory.partner?.photo_url && (
                  <button onClick={() => downloadImage(showHistory.partner.photo_url, `partner-memory-${showHistory.date}.jpg`)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-magenta)', cursor: 'pointer' }}><Download size={16} /></button>
                )}
              </div>
              <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1rem', fontStyle: showHistory.partner?.note ? 'normal' : 'italic' }}>
                {showHistory.partner?.note || "Awaiting partner's transmission..."}
              </p>
              {showHistory.partner?.photo_url && (
                <div className="media-card" style={{ width: '100%', aspectRatio: '16/9' }}>
                  <img src={getImageUrl(showHistory.partner.photo_url)} alt="Partner Archive" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <header style={{ padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', background: 'rgba(3,3,3,0.3)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 800 }}>
          <Heart size={24} fill="var(--accent-violet)" color="var(--accent-violet)" />
          distle
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-magenta)', fontWeight: 800, fontSize: '1rem' }}>
            <Flame size={20} fill="var(--accent-magenta)" />
            {partnerStatus.streak_count || "-"}
          </div>
          <div className="user-badge" style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, border: '1px solid var(--panel-border)' }}>
            @{user.username}
          </div>
        </div>
      </header>

      <div className="scroll-area">
        {activeTab === 'distance' ? (
          <>
            <div className="distance-hero">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <div className="telemetry-pulse"></div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10B981', letterSpacing: '0.2em' }}>ACTIVE TELEMETRY</span>
              </div>
              <div className="distance-display">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-violet-400">{distance !== null ? distance : '-'} km</span>
                  {accuracy && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${accuracy < 50 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`} title="GPS Accuracy">
                      {accuracy < 50 ? 'High Precision' : 'Low Precision'}
                    </span>
                  )}
                </div>
                <div className="dist-label">Kilometers Apart</div>
              </div>
              {isTogether && (<div style={{ color: '#10B981', fontSize: '0.9rem', fontWeight: 800, marginTop: '1rem' }}>PROXIMITY SYNCED ❤️</div>)}
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <ImageIcon size={20} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>SHARED MOMENTS</span>
              </div>
              <div className="shared-grid">
                <div className="media-card">
                  {user.photo_url ? (
                    <>
                      <img src={getImageUrl(user.photo_url)} alt="You" />
                      <button onClick={() => downloadImage(user.photo_url, 'my-moment.jpg')} className="download-btn-overlay"><Download size={14} /></button>
                    </>
                  ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>Awaiting capture...</div>}
                  <div className="media-label">You</div>
                </div>
                <div className="media-card">
                  {partnerStatus.photo_url ? (
                    <>
                      <img src={getImageUrl(partnerStatus.photo_url)} alt="Partner" />
                      <button onClick={() => downloadImage(partnerStatus.photo_url, 'partner-moment.jpg')} className="download-btn-overlay"><Download size={14} /></button>
                    </>
                  ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>Waiting for partner...</div>}
                  <div className="media-label">{partnerStatus.username || 'Partner'}</div>
                </div>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*" />
              <button className={`btn-secondary ${uploading ? 'btn-loading' : ''}`} onClick={() => fileInputRef.current?.click()} style={{ marginTop: '1.5rem', width: '100%' }}>
                {uploading ? <div className="loading-spinner" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'var(--accent-violet)' }}></div> : <Upload size={18} />}
                {uploading ? 'Uploading...' : 'Upload Image'}
              </button>
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <Quote size={20} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>SHARED THOUGHTS</span>
              </div>

              <div className="thought-bubble mine">
                <span className="bubble-tag">Your Sync</span>
                {user.note || "Silence is connecting..."}
              </div>

              <div className="thought-bubble partner">
                <span className="bubble-tag">Partner's Sync</span>
                {partnerStatus.note || "Waiting for partner..."}
              </div>

              <div className="note-input-section">
                <textarea
                  className="note-area"
                  value={myNote}
                  onChange={e => setMyNote(e.target.value)}
                  placeholder="Share a thought..."
                />
                <button className={`btn-send-center ${loading ? 'btn-loading' : ''}`} onClick={updateMyNote}>
                  {loading ? <div className="loading-spinner"></div> : <Send size={18} />}
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <CalendarIcon size={20} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>SYNC STREAK</span>
              </div>
              <div className="streak-grid">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className={`streak-day ${(partnerStatus.streak_count || 0) > i ? 'active' : ''}`}
                    onClick={() => fetchHistory(i)}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <p style={{ marginTop: '1.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>
                Tap a sync point to retrieve archived memories.
              </p>
            </div>

            {midpoint && (
              <div className="glass-panel" style={{ textAlign: 'center', border: '1px solid var(--accent-magenta)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
                  <Compass size={24} color="var(--accent-magenta)" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>CONVERGENCE POINT</span>
                </div>
                <p style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 600 }}>Celestial Midpoint Located</p>
                <a href={`https://www.google.com/maps?q=${midpoint.lat},${midpoint.lon}`} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: 'none', color: 'white' }} > <MapIcon size={18} /> Plot Trajectory </a>
              </div>
            )}
          </>
        ) : (
          <div className="profile-wrapper">
            <div className="profile-header">
              <div className="avatar-large">{user.username?.charAt(0).toUpperCase()}</div>
              <h1 style={{ marginBottom: '0.5rem' }}>{user.username}</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sync Established: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
            </div>

            <div className="profile-grid">
              <div className="glass-panel profile-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <ShieldCheck size={20} color="var(--accent-violet)" />
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em' }}>SECURITY PROTOCOL</span>
                </div>
                <div style={{ opacity: 0.8 }}>
                  <p style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>Access ID: <strong>{user.username}</strong></p>
                  <p style={{ fontSize: '0.75rem' }}>Passcode: <strong>••••••••</strong></p>
                </div>
              </div>

              <div className="glass-panel profile-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <Link size={20} color="var(--accent-magenta)" />
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em' }}>LINK PARTNER</span>
                </div>
                {partnerStatus.username ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="avatar-small">{partnerStatus.username.charAt(0).toUpperCase()}</div>
                    <div>
                      <p style={{ fontWeight: 700 }}>{partnerStatus.username}</p>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Connected Channel</p>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No partner linked yet.</p>
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ marginTop: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '1rem', letterSpacing: '0.2em' }}>CONNECTION CODE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.3em', marginBottom: '1.5rem' }}>{user.pairing_code}</div>
              <button className="btn-secondary" onClick={logout} style={{ border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444' }}>
                <LogOut size={18} /> Terminate Sync Session
              </button>
            </div>
          </div>
        )}
      </div>
      <nav className="app-nav">
        <div className={`nav-item ${activeTab === 'distance' ? 'active' : ''}`} onClick={() => setActiveTab('distance')}> <Navigation size={28} /> <span className="nav-text">LIVE</span> </div>
        <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}> <User size={28} /> <span className="nav-text">CONFIG</span> </div>
      </nav>
    </div>
  );
}

export default App;
