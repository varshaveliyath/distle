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
  Link
} from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(API_URL);

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth'); // auth, pairing, dashboard
  const [activeTab, setActiveTab] = useState('distance'); // distance, profile
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inputCode, setInputCode] = useState('');

  // Real-time states
  const [distance, setDistance] = useState(null);
  const [midpoint, setMidpoint] = useState(null);
  const [isTogether, setIsTogether] = useState(false);

  // Daily states
  const [myNote, setMyNote] = useState('');
  const [partnerStatus, setPartnerStatus] = useState({ note: '', photo_url: '', streak_count: 0 });

  // Archival states (Phase 3)
  const [showHistory, setShowHistory] = useState(null); // { date, note, photo_url } or null
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setMyNote(parsedUser.note || '');
      socket.emit('join', parsedUser.id);
      fetchPartnerStatus(parsedUser.id);
      if (parsedUser.pair_id) setView('dashboard');
      else setView('pairing');
    }
  }, []);

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

  useEffect(() => {
    if (user) {
      socket.on('distance-update', ({ distance, midpoint }) => {
        setDistance(distance.toFixed(2));
        setMidpoint(midpoint);
        setIsTogether(distance < 0.05);
      });

      socket.on('partner-note-update', ({ note, streak }) => {
        setPartnerStatus(prev => ({ ...prev, note, streak_count: streak !== undefined ? streak : prev.streak_count }));
      });

      socket.on('partner-photo-update', ({ photoUrl, streak }) => {
        setPartnerStatus(prev => ({ ...prev, photo_url: photoUrl, streak_count: streak !== undefined ? streak : prev.streak_count }));
      });

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          socket.emit('update-location', {
            userId: user.id,
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
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
      alert("Registration requires both a unique Access ID and a Passcode.");
      return;
    }
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
      if (data.pair_id) setView('dashboard');
      else setView('pairing');
    } else {
      alert(data.error || 'Identity verification failed. Please try again.');
    }
  };

  const updateMyNote = async () => {
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
      setView('dashboard');
    } else {
      alert(data.message);
    }
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setView('auth');
  };

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
              <button style={{ flex: 1, padding: '0.75rem', border: 'none', background: authMode === 'login' ? '#ffffff' : 'transparent', color: authMode === 'login' ? '#000000' : 'white', fontWeight: 700, borderRadius: '14px', cursor: 'pointer', transition: 'var(--transition-premium)' }} onClick={() => setAuthMode('login')}>Sign In</button>
              <button style={{ flex: 1, padding: '0.75rem', border: 'none', background: authMode === 'register' ? '#ffffff' : 'transparent', color: authMode === 'register' ? '#000000' : 'white', fontWeight: 700, borderRadius: '14px', cursor: 'pointer', transition: 'var(--transition-premium)' }} onClick={() => setAuthMode('register')}>Join</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <input className="input-field" type="text" placeholder="Access ID (Compulsory)" value={username} onChange={e => setUsername(e.target.value)} />
              <input className="input-field" type="password" placeholder="Passcode (Compulsory)" value={password} onChange={e => setPassword(e.target.value)} />
              <button className="btn-primary" onClick={handleAuth}>
                {authMode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />}
                {authMode === 'login' ? 'Sync Profile' : 'Forge Link'}
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
        <div className="scroll-area">
          <div style={{ textAlign: 'center', margin: '4rem 0' }}>
            <Link2 size={56} color="var(--accent-violet)" style={{ marginBottom: '1.5rem', filter: 'drop-shadow(0 0 10px var(--accent-violet-glow))' }} />
            <h1>Link Origins</h1>
            <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Establish a dedicated channel with your partner.</p>
          </div>
          <div className="glass-panel" style={{ textAlign: 'center' }}>
            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 800, color: 'var(--text-muted)' }}>Shared Protocol Code</label>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, margin: '1.5rem 0', letterSpacing: '0.3em', color: '#ffffff' }}>{user.pairing_code}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2.5rem' }}>
              <input className="input-field" style={{ textAlign: 'center', letterSpacing: '0.5em', fontWeight: 800, fontSize: '1.2rem' }} type="text" maxLength="6" value={inputCode} onChange={e => setInputCode(e.target.value)} placeholder="000000" />
              <button className="btn-primary" onClick={handlePairing}>
                <Navigation size={20} />
                Initialize Link
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
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-violet)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '1rem' }}>Your Sync</span>
              <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1rem', fontStyle: showHistory.mine?.note ? 'normal' : 'italic' }}>
                {showHistory.mine?.note || "Silence in your sync cycle..."}
              </p>
              {showHistory.mine?.photo_url && (
                <div className="media-card" style={{ width: '100%', aspectRatio: '16/9' }}>
                  <img src={showHistory.mine.photo_url} alt="My Archive" />
                </div>
              )}
            </div>

            {/* Partner's Memory */}
            <div className="glass-panel" style={{ background: 'rgba(244, 114, 182, 0.05)', border: '1px solid rgba(244, 114, 182, 0.1)' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-magenta)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '1rem' }}>Partner's Sync</span>
              <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1rem', fontStyle: showHistory.partner?.note ? 'normal' : 'italic' }}>
                {showHistory.partner?.note || "Awaiting partner's transmission..."}
              </p>
              {showHistory.partner?.photo_url && (
                <div className="media-card" style={{ width: '100%', aspectRatio: '16/9' }}>
                  <img src={showHistory.partner.photo_url} alt="Partner Archive" />
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
                <div className="dist-value">{distance !== null ? distance : '-'}</div>
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
                  {user.photo_url ? <img src={user.photo_url} alt="You" /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>Awaiting capture...</div>}
                  <div className="media-label">You</div>
                </div>
                <div className="media-card">
                  {partnerStatus.photo_url ? <img src={partnerStatus.photo_url} alt="Partner" /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>Waiting for partner...</div>}
                  <div className="media-label">Partner</div>
                </div>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*" />
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ marginTop: '1.5rem', width: '100%' }}>
                {uploading ? <Sparkles className="animate-spin" size={18} /> : <Upload size={18} />}
                {uploading ? 'Syncing...' : 'Upload Daily Sync'}
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

              <div className="note-input-container">
                <input className="note-input" value={myNote} onChange={e => setMyNote(e.target.value)} placeholder="Share a thought..." onKeyPress={e => e.key === 'Enter' && updateMyNote()} />
                <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.5rem' }} onClick={updateMyNote}>
                  <Send size={20} />
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
