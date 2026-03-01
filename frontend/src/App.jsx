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
  Smile,
  Frown,
  Meh,
  Compass,
  Map as MapIcon,
  Send,
  Image as ImageIcon,
  Calendar as CalendarIcon,
  Flame,
  Upload,
  ChevronLeft,
  X
} from 'lucide-react';
import './index.css';

const socket = io(window.location.origin);

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
  const [myMood, setMyMood] = useState('neutral');
  const [partnerStatus, setPartnerStatus] = useState({ note: '', mood: 'neutral', photo_url: '', streak_count: 0 });

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
      setMyMood(parsedUser.mood || 'neutral');
      socket.emit('join', parsedUser.id);
      fetchPartnerStatus(parsedUser.id);
      if (parsedUser.pair_id) setView('dashboard');
      else setView('pairing');
    }
  }, []);

  const fetchPartnerStatus = async (uid) => {
    try {
      const res = await fetch(`/api/partner-status/${uid}`);
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
      const res = await fetch(`/api/history/${user.id}/${dateStr}`);
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

      socket.on('partner-mood-update', ({ mood }) => {
        setPartnerStatus(prev => ({ ...prev, mood }));
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
        socket.off('partner-mood-update');
        socket.off('partner-photo-update');
        clearInterval(interval);
      };
    }
  }, [user]);

  const handleAuth = async () => {
    const url = authMode === 'login' ? '/api/login' : '/api/register';
    const res = await fetch(`${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.id) {
      setUser(data);
      setMyNote(data.note || '');
      setMyMood(data.mood || 'neutral');
      localStorage.setItem('user', JSON.stringify(data));
      socket.emit('join', data.id);
      if (data.pair_id) setView('dashboard');
      else setView('pairing');
    } else {
      alert(data.error || 'Something went wrong');
    }
  };

  const updateMyNote = async () => {
    const res = await fetch('/api/note', {
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
      const res = await fetch('/api/photo', {
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

  const updateMyMood = async (mood) => {
    setMyMood(mood);
    await fetch('/api/mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, mood })
    });
  };

  const handlePairing = async () => {
    const res = await fetch('/api/pair', {
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
            <Sparkles size={48} color="var(--accent-violet)" style={{ marginBottom: '1rem' }} />
            <h1>Distle</h1>
            <p style={{ color: 'var(--text-muted)' }}>The definitive companion for long-distance love.</p>
          </div>
          <div className="glass-panel">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '14px' }}>
              <button style={{ flex: 1, padding: '0.75rem', border: 'none', background: authMode === 'login' ? 'rgba(255,255,255,0.05)' : 'transparent', color: 'white', fontWeight: 600, borderRadius: '12px', cursor: 'pointer' }} onClick={() => setAuthMode('login')}>Sign In</button>
              <button style={{ flex: 1, padding: '0.75rem', border: 'none', background: authMode === 'register' ? 'rgba(255,255,255,0.05)' : 'transparent', color: 'white', fontWeight: 600, borderRadius: '12px', cursor: 'pointer' }} onClick={() => setAuthMode('register')}>Join</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <input className="input-field" type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
              <input className="input-field" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
              <button className="btn-primary" onClick={handleAuth}>
                {authMode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />}
                {authMode === 'login' ? 'Access Account' : 'Create Space'}
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
          <div style={{ textAlign: 'center', margin: '3rem 0' }}>
            <Link2 size={42} color="var(--accent-violet)" style={{ marginBottom: '1rem' }} />
            <h1>Start Your Link</h1>
            <p style={{ color: 'var(--text-muted)' }}>Connect with your partner to start the experience.</p>
          </div>
          <div className="glass-panel" style={{ textAlign: 'center' }}>
            <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text-muted)' }}>Your Link Code</label>
            <div style={{ fontSize: '3rem', fontWeight: 800, margin: '1.5rem 0', letterSpacing: '0.3em', color: 'var(--accent-violet)' }}>{user.pairing_code}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '2rem' }}>
              <input className="input-field" type="text" maxLength="6" value={inputCode} onChange={e => setInputCode(e.target.value)} placeholder="Enter Partner Code" />
              <button className="btn-primary" onClick={handlePairing}>
                <Sparkles size={20} />
                Connect Worlds
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
        <div className="history-overlay" style={{ position: 'absolute', inset: 0, background: 'var(--app-bg)', zIndex: 200, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
          <button onClick={() => setShowHistory(null)} style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'white', marginBottom: '2rem', cursor: 'pointer' }}>
            <ChevronLeft size={24} /> Back to Live
          </button>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-violet)', fontWeight: 800, letterSpacing: '0.2em' }}>ARCHIVED MEMORY</span>
            <h2 style={{ marginTop: '0.5rem' }}>{showHistory.date}</h2>
          </div>
          <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <Quote size={20} color="var(--accent-violet)" style={{ marginBottom: '1rem' }} />
            <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>{showHistory.note || "No thought shared this day."}</p>
          </div>
          {showHistory.photo_url && (
            <div className="glass-panel" style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)' }}>
              <img src={showHistory.photo_url} className="image-preview" alt="Archive" style={{ margin: 0 }} />
            </div>
          )}
        </div>
      )}

      <header style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', background: 'rgba(9,9,11,0.5)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Heart size={20} fill="var(--accent-violet)" color="var(--accent-violet)" />
          Distle
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-magenta)', fontWeight: 800, fontSize: '0.9rem' }}>
            <Flame size={18} fill="var(--accent-magenta)" />
            {partnerStatus.streak_count || 0}
          </div>
          <div className="user-badge" style={{ background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.8rem', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700 }}>
            @{user.username}
          </div>
        </div>
      </header>
      <div className="scroll-area">
        {activeTab === 'distance' ? (
          <>
            <div className="distance-hero">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div className="telemetry-pulse"></div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10B981', letterSpacing: '0.1em' }}>LIVE CONNECTION</span>
              </div>
              <div className="distance-display">
                <div className="dist-value">{distance !== null ? distance : '--'}</div>
                <div className="dist-label">KM TO YOUR HEART</div>
              </div>
              {isTogether && (<div style={{ color: '#10B981', fontSize: '0.85rem', fontWeight: 800, marginTop: '0.5rem' }}>TOGETHER NOW ❤️</div>)}
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <CalendarIcon size={18} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>STREAK PROGRESS</span>
              </div>
              <div className="streak-grid">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className={`streak-day ${(partnerStatus.streak_count || 0) > i ? 'active' : ''}`}
                    onClick={() => fetchHistory(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Click a day to recall your shared memories!
              </p>
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <ImageIcon size={18} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>PHOTO FOR THE DAY</span>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*" />
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', marginBottom: partnerStatus.photo_url ? '1rem' : '0' }}>
                {uploading ? <Sparkles className="animate-spin" size={18} /> : <Upload size={18} />}
                {uploading ? 'Capturing Moment...' : 'Upload Daily Memory'}
              </button>
              {partnerStatus.photo_url && (<img src={partnerStatus.photo_url} className="image-preview" alt="Partner's Moment" />)}
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <Quote size={18} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>THOUGHT FOR THE DAY</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input className="note-input" value={myNote} onChange={e => setMyNote(e.target.value)} placeholder="Type a message..." />
                <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-violet)', cursor: 'pointer' }} onClick={updateMyNote}>
                  <Send size={20} />
                </button>
              </div>
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--panel-border)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  Partner says: <span style={{ color: 'var(--text-pure)', fontWeight: 700 }}>"{partnerStatus.note || "Nothing yet..."}"</span>
                </p>
              </div>
            </div>

            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <Smile size={18} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>CURRENT MOOD</span>
              </div>
              <div className="mood-selector">
                {['happy', 'neutral', 'sad', 'loved'].map(m => (
                  <button key={m} className={`mood-btn ${myMood === m ? 'active' : ''}`} onClick={() => updateMyMood(m)}>
                    {m === 'happy' ? <Smile size={20} /> : m === 'neutral' ? <Meh size={20} /> : m === 'sad' ? <Frown size={20} /> : <Heart size={20} />}
                  </button>
                ))}
              </div>
            </div>

            {midpoint && (
              <div className="glass-panel" style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', justifyContent: 'center' }}>
                  <Compass size={20} color="var(--accent-magenta)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>MEET IN THE MIDDLE</span>
                </div>
                <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Midpoint: ({midpoint.lat.toFixed(4)}, {midpoint.lon.toFixed(4)})</p>
                <a href={`https://www.google.com/maps?q=${midpoint.lat},${midpoint.lon}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-violet)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} > <MapIcon size={16} /> Get Directions </a>
              </div>
            )}
          </>
        ) : (
          <div className="profile-view">
            <div className="glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                <User size={22} color="var(--accent-violet)" />
                <h3 style={{ fontSize: '1.1rem' }}>Account Details</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.25rem' }}>IDENTIFIER</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{user.username}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.25rem' }}>LINK CODE</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-violet)' }}>{user.pairing_code}</span>
                </div>
              </div>
              <button className="logout-btn" onClick={logout} style={{ marginTop: '3rem', width: '100%', padding: '1rem', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#EF4444', borderRadius: '16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}> <LogOut size={20} /> Terminate Session </button>
            </div>
          </div>
        )}
      </div>
      <nav className="app-nav">
        <div className={`nav-item ${activeTab === 'distance' ? 'active' : ''}`} onClick={() => setActiveTab('distance')}> <Navigation size={24} /> <span className="nav-text">DISTLE</span> </div>
        <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}> <User size={24} /> <span className="nav-text">ACCOUNT</span> </div>
      </nav>
    </div>
  );
}

export default App;
