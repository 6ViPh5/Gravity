import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from '@tauri-apps/api/window'; 
import "./App.css";

function App() {
  const [currentView, setCurrentView] = useState("selection");
  const [profiles, setProfiles] = useState([]);
  const [username, setUsername] = useState("Steve");
  const [userType, setUserType] = useState("offline");
  const [activeProfileId, setActiveProfileId] = useState(null); 
  const [statusText, setStatusText] = useState("");
  const [msCode, setMsCode] = useState("");
  const [msUrl, setMsUrl] = useState("");
  const [viewMode, setViewMode] = useState("sidebar"); 
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [closeAfterPlay, setCloseAfterPlay] = useState(true);
  const [ramAmount, setRamAmount] = useState(2); 
  const [gameLogs, setGameLogs] = useState([]); 
  const [settingsTab, setSettingsTab] = useState("general"); 
  const logsEndRef = useRef(null);
  const [isGameReady, setIsGameReady] = useState(false);
  const [crashMessage, setCrashMessage] = useState(null); 
  const [isMaximized, setIsMaximized] = useState(false);
  
  // --- NUEVO ESTADO PARA LA ANIMACIÓN DE CIERRE ---
  const [isClosingSettings, setIsClosingSettings] = useState(false);

  const appWindow = getCurrentWindow();

  // --- CARGA INICIAL ---
  useEffect(() => {
    const savedUser = localStorage.getItem("gravity_username");
    const savedType = localStorage.getItem("gravity_user_type");
    if (savedUser) { 
        setUsername(savedUser); 
        if (savedType) setUserType(savedType);
        setCurrentView("dashboard"); 
    }
    const savedMode = localStorage.getItem("gravity_ui_mode");
    if (savedMode === "carousel") { setViewMode("grid"); } else if (savedMode) { setViewMode(savedMode); }
    const savedCloseSetting = localStorage.getItem("gravity_close_after_play");
    if (savedCloseSetting !== null) { setCloseAfterPlay(savedCloseSetting === 'true'); }
    const savedRam = localStorage.getItem("gravity_ram_amount");
    if (savedRam) { setRamAmount(parseInt(savedRam)); }
    invoke("get_profiles").then((data) => {
        setProfiles(data);
        if (data.length > 0) setSelectedProfile(data[0]);
        data.forEach((profile) => { const img = new Image(); img.src = profile.visuals.background; });
      }).catch((error) => console.error(error));
  }, []);

  // --- LISTENERS ---
  useEffect(() => {
    const unlisten = listen("game-console", (event) => {
      setGameLogs((prevLogs) => {
        const newLogs = [...prevLogs, event.payload];
        if (newLogs.length > 500) return newLogs.slice(newLogs.length - 500);
        return newLogs;
      });
    });
    return () => { unlisten.then(f => f()); };
  }, []);
  useEffect(() => {
    const unlisten = listen("game-crashed", (event) => {
        setCrashMessage(event.payload); setActiveProfileId(null); setStatusText("");
    });
    return () => { unlisten.then(f => f()); };
  }, []);
  useEffect(() => { if (settingsTab === "console") { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); } }, [gameLogs, showSettings, settingsTab]);
  useEffect(() => {
    if (selectedProfile) {
      setIsGameReady(false);
      invoke("check_is_installed", { version: selectedProfile.version }).then((exists) => setIsGameReady(exists)).catch(console.error);
    }
  }, [selectedProfile, activeProfileId]);
  useEffect(() => { const unlisten = listen("game-status", (event) => setStatusText(event.payload)); return () => { unlisten.then(f => f()); }; }, []);

  // --- FUNCIONES ---
  const toggleViewMode = () => { const newMode = viewMode === "grid" ? "sidebar" : "grid"; setViewMode(newMode); localStorage.setItem("gravity_ui_mode", newMode); };
  const handleLogout = () => {
    localStorage.removeItem("gravity_username"); localStorage.removeItem("gravity_uuid");
    localStorage.removeItem("gravity_access_token"); localStorage.removeItem("gravity_user_type");
    setActiveProfileId(null); setStatusText(""); setCurrentView("selection"); setUsername("Steve");
  };
  const handleCancel = () => { setActiveProfileId(null); setStatusText(""); };
  const handleMaximize = async () => { await appWindow.toggleMaximize(); const max = await appWindow.isMaximized(); setIsMaximized(max); };

  // --- NUEVA FUNCIÓN PARA CERRAR AJUSTES SUAVEMENTE ---
  const handleCloseSettings = () => {
      setIsClosingSettings(true); // Activa la animación fade-out
      setTimeout(() => {
          setShowSettings(false); // Cierra el modal realmente
          setIsClosingSettings(false); // Resetea el estado
      }, 300); // Espera 300ms (duración de la animación)
  };

  const handleMicrosoftLogin = async () => {
    try {
        setCurrentView("microsoft-loading");
        const response = await invoke("start_microsoft_login");
        setMsCode(response.user_code);
        setMsUrl(response.verification_uri);
        setCurrentView("microsoft-code");
        await navigator.clipboard.writeText(response.user_code);
        await invoke("open_url", { url: response.verification_uri });
        const [uuid, name, mcToken] = await invoke("finish_microsoft_login", { deviceCode: response.device_code });
        localStorage.setItem("gravity_username", name);
        localStorage.setItem("gravity_uuid", uuid);
        localStorage.setItem("gravity_access_token", mcToken);
        localStorage.setItem("gravity_user_type", "microsoft");
        setUsername(name);
        setUserType("microsoft");
        setCurrentView("dashboard");
    } catch (e) { console.error(e); alert("Error Login: " + e); setCurrentView("selection"); }
  };
  const cancelMicrosoftLogin = () => { setCurrentView("selection"); };
  const handleOfflineLogin = async () => {
    if (!username.trim()) return;
    try {
        const isBlocked = await invoke("check_blacklist", { username });
        if (isBlocked) { alert(`⛔ El nombre "${username}" está bloqueado.\nPor favor elige otro.`); return; }
    } catch (e) { console.warn("Skip blacklist check", e); }
    try { const isPremium = await invoke("check_premium_name", { username }); if (isPremium) {} } catch (e) {}
    localStorage.setItem("gravity_username", username);
    localStorage.setItem("gravity_user_type", "offline");
    setUserType("offline");
    setCurrentView("dashboard");
  };

  const getLoaderName = (l) => l ? (l === "vanilla" ? "Vanilla" : l.charAt(0).toUpperCase() + l.slice(1)) : "Vanilla";
  const getLoaderStyle = (l) => {
      const type = l ? l.toLowerCase() : "vanilla";
      if (type === "fabric") return { backgroundColor: 'rgba(255, 235, 59, 0.2)', color: '#fff9c4', border: '1px solid rgba(255, 235, 59, 0.5)' };
      if (type === "forge" || type === "neoforge") return { backgroundColor: 'rgba(255, 87, 34, 0.2)', color: '#ffccbc', border: '1px solid rgba(255, 87, 34, 0.5)' };
      return { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#ccc', border: '1px solid rgba(255, 255, 255, 0.2)' };
  };
  const getJavaRequirement = (v) => {
      if (!v) return "Java ?";
      const parts = v.split('.'); if (parts.length < 2) return "Java ?";
      const minor = parseInt(parts[1]); const patch = parts.length > 2 ? parseInt(parts[2]) : 0;
      if (minor >= 21) return "Java 21"; if (minor === 20 && patch >= 5) return "Java 21"; if (minor >= 18) return "Java 17"; if (minor === 17) return "Java 16"; return "Java 8";
  };
  const getJavaStyle = (j) => {
      if (j === "Java 8") return { backgroundColor: 'rgba(255, 152, 0, 0.15)', color: '#ffcc80', border: '1px solid rgba(255, 152, 0, 0.4)' };
      return { backgroundColor: 'rgba(33, 150, 243, 0.15)', color: '#90caf9', border: '1px solid rgba(33, 150, 243, 0.4)' };
  };
  async function handlePlay(profile) {
    if (activeProfileId) return;
    setGameLogs([]);
    if (!isGameReady) {
        setActiveProfileId(profile.id); setStatusText("Iniciando instalación...");
        try { await invoke("install_game", { profileId: profile.id, version: profile.version }); setIsGameReady(true); setStatusText("¡Instalación completada!"); setTimeout(() => setStatusText(""), 3000); } catch (error) { alert("Error al instalar: " + error); } finally { setActiveProfileId(null); }
    } else {
        setActiveProfileId(profile.id); setStatusText("Lanzando juego...");
        try { await invoke("launch_game", { profileId: profile.id, username, version: profile.version, closeLauncher: closeAfterPlay, ram: ramAmount }); setActiveProfileId(null); setStatusText(""); } catch (error) { alert("Error al lanzar: " + error); setActiveProfileId(null); setStatusText(""); }
    }
  }
  const createRipple = (event) => {
    const button = event.currentTarget; const circle = document.createElement("span"); const diameter = Math.max(button.clientWidth, button.clientHeight); const radius = diameter / 2; const rect = button.getBoundingClientRect(); circle.style.width = circle.style.height = `${diameter}px`; circle.style.left = `${event.clientX - rect.left - radius}px`; circle.style.top = `${event.clientY - rect.top - radius}px`; circle.classList.add("ripple"); const ripple = button.getElementsByClassName("ripple")[0]; if (ripple) { ripple.remove(); } button.appendChild(circle);
  };

  // --- VISTAS ---
  if (currentView === "microsoft-loading") { return (<div className="app-container fade-in center-content"><div className="titlebar"><div className="titlebar-drag-region" data-tauri-drag-region /><div className="titlebar-actions"><div className="titlebar-button close" onClick={() => setCurrentView("selection")}>✕</div></div></div><div className="login-box" style={{textAlign: 'center', height: 'auto', padding: '40px'}}><h1 className="login-title" style={{marginBottom: '30px'}}>GRAVITY</h1><div className="loader-bar" style={{margin: '30px auto', width: '50%'}}><div className="loader-progress"></div></div><p style={{color: '#888'}}>Conectando con servidores...</p></div></div>); }
  if (currentView === "microsoft-code") { return (<div className="app-container fade-in center-content"><div className="titlebar"><div className="titlebar-drag-region" data-tauri-drag-region /><div className="titlebar-actions"><div className="titlebar-button close" onClick={cancelMicrosoftLogin}>✕</div></div></div><div className="login-box microsoft-box"><h1 className="login-title" style={{fontSize: '2rem', marginBottom: '10px'}}>GRAVITY</h1><h2 style={{color: '#fff', fontSize: '1.2rem', margin: '20px 0 10px'}}>AUTORIZACIÓN</h2><p style={{color: '#aaa', fontSize: '0.9rem', marginBottom: '20px'}}>Ingresa este código en la web de Microsoft:</p><div className="code-display" onClick={() => navigator.clipboard.writeText(msCode)}>{msCode}</div><div style={{fontSize: '0.8rem', color: '#4CAF50', marginBottom: '30px'}}>(Copiado al portapapeles)</div><div className="loader-bar" style={{width: '60%', margin: '0 auto 15px auto'}}><div className="loader-progress"></div></div><p className="blinking-text">Esperando confirmación...</p><div className="button-group-row" style={{marginTop: '30px'}}><button className="btn-back" onClick={(e) => { createRipple(e); cancelMicrosoftLogin(); }}>CANCELAR</button><button className="btn-enter" onClick={(e) => { createRipple(e); invoke("open_url", { url: msUrl }); }}>ABRIR NAVEGADOR</button></div></div></div>); }
  if (currentView === "selection" || currentView === "offline-input") { return (<div className="app-container fade-in center-content"><div className="titlebar"><div className="titlebar-drag-region" data-tauri-drag-region /><div className="titlebar-actions"><div className="titlebar-button" onClick={() => appWindow.minimize()}><svg width="10" height="10" viewBox="0 0 10.2 1"><rect width="10.2" height="1" x="0" y="0" ry="0"></rect></svg></div><div className="titlebar-button" onClick={handleMaximize}>{isMaximized ? <svg width="10" height="10" viewBox="0 0 10.2 10.1"><path d="M2.1,0v2H0v8.1h8.2v-2h2.1V0H2.1z M7.2,9.2H1.1V3h6.1V9.2z M9.2,7.1h-1V2H3.1V1h6.1V7.1z"></path></svg> : <svg width="10" height="10" viewBox="0 0 10.2 10.1"><path d="M0,0v10.1h10.2V0H0z M9.2,9.2H1.1V1h8.1V9.2z"></path></svg>}</div><div className="titlebar-button close" onClick={() => appWindow.close()}><svg width="10" height="10" viewBox="0 0 10.2 10.1"><path d="M10.2,0.7L9.5,0L5.1,4.4L0.7,0L0,0.7l4.4,4.4L0,9.5l0.7,0.7l4.4-4.4l4.4,4.4l0.7-0.7L5.8,5.1L10.2,0.7z"></path></svg></div></div></div><div className="login-box"><h1 className="login-title">GRAVITY</h1>{currentView === "selection" ? (<div className="button-group fade-in-up"><button className="btn-microsoft" onClick={(e) => { createRipple(e); handleMicrosoftLogin(); }}>Microsoft</button><button className="btn-offline" onClick={(e) => { createRipple(e); setCurrentView("offline-input"); }}>Offline</button></div>) : (<div className="offline-form fade-in-up"><p className="input-label" style={{textAlign: 'center'}}>Usuario</p><input type="text" className="login-input centered-input" autoFocus placeholder="Steve" value={username === "Steve" ? "" : username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleOfflineLogin()} /><div className="button-group-row"><button className="btn-back" onClick={(e) => { createRipple(e); setCurrentView("selection"); }}>Atrás</button><button className="btn-enter" onClick={(e) => { createRipple(e); handleOfflineLogin(); }}>Entrar</button></div></div>)}</div></div>); }

  // --- DASHBOARD ---
  const isAnyDownloading = activeProfileId !== null;
  if (profiles.length === 0) return <div className="app-container center-msg"><h1>Cargando perfiles...</h1></div>;

  return (
    <div className="app-container fade-in">
      <div className="titlebar">
          <div className="titlebar-drag-region" data-tauri-drag-region />
          <div className="titlebar-actions">
            <div className="titlebar-button" onClick={() => appWindow.minimize()}><svg width="10" height="10" viewBox="0 0 10.2 1"><rect width="10.2" height="1" x="0" y="0" ry="0"></rect></svg></div>
            <div className="titlebar-button" onClick={handleMaximize}>{isMaximized ? <svg width="10" height="10" viewBox="0 0 10.2 10.1"><path d="M2.1,0v2H0v8.1h8.2v-2h2.1V0H2.1z M7.2,9.2H1.1V3h6.1V9.2z M9.2,7.1h-1V2H3.1V1h6.1V7.1z"></path></svg> : <svg width="10" height="10" viewBox="0 0 10.2 10.1"><path d="M0,0v10.1h10.2V0H0z M9.2,9.2H1.1V1h8.1V9.2z"></path></svg>}</div>
            <div className="titlebar-button close" onClick={() => appWindow.close()}><svg width="10" height="10" viewBox="0 0 10.2 10.1"><path d="M10.2,0.7L9.5,0L5.1,4.4L0.7,0L0,0.7l4.4,4.4L0,9.5l0.7,0.7l4.4-4.4l4.4,4.4l0.7-0.7L5.8,5.1L10.2,0.7z"></path></svg></div>
          </div>
      </div>

      {viewMode === "grid" && (
        <>
          <header className="dashboard-header">
            <h2 className="mini-title">GRAVITY</h2>
            <div className="user-info">
              <span>Hola, <strong style={{ color: userType === 'microsoft' ? '#D4AF37' : '#C0C0C0' }}>{username}</strong></span>
              <button className="settings-btn-header" onClick={() => setShowSettings(true)}>⚙️</button>
              <button className="logout-btn" onClick={handleLogout} disabled={isAnyDownloading}>Salir</button>
            </div>
          </header>
          <div className="grid-container fade-in-up">
             <div className="profiles-grid-view">
                {profiles.map((profile) => (
                    <div key={profile.id} className="profile-card-grid" style={{ backgroundImage: `url(${profile.visuals.background})` }} onClick={(e) => { handlePlay(profile); }}>
                        <div className="card-overlay">
                            <div style={{ display: 'flex', gap: '6px', marginBottom: 'auto', marginTop: '10px', flexWrap: 'wrap' }}>
                                <span className="version-badge">{profile.version}</span>
                                <span className="version-badge" style={getLoaderStyle(profile.loader)}>{getLoaderName(profile.loader)}</span>
                                <span className="version-badge" style={getJavaStyle(getJavaRequirement(profile.version))}>{getJavaRequirement(profile.version)}</span>
                            </div>
                            <h3>{profile.name}</h3>
                            <button className="play-hint-btn" onClick={(e) => { e.stopPropagation(); createRipple(e); handlePlay(profile); }}>JUGAR</button>
                        </div>
                    </div>
                ))}
             </div>
          </div>
        </>
      )}

      {viewMode === "sidebar" && selectedProfile && (
        <div className="sidebar-layout">
          <aside className="sidebar">
            <h1 className="sidebar-title">GRAVITY</h1>
            <div className="sidebar-label">PERFILES</div>
            <div className="sidebar-list">
              {profiles.map((p) => (
                <button key={p.id} className={`sidebar-item ${selectedProfile.id === p.id ? 'selected' : ''}`} onClick={() => setSelectedProfile(p)}>
                  <span className="cube-icon">▪</span> {p.name}
                </button>
              ))}
            </div>
            <div className="sidebar-footer">
               <button className="sidebar-settings-big-btn" onClick={(e) => { createRipple(e); setShowSettings(true); }}>AJUSTES</button>
            </div>
          </aside>

          <main className="main-preview">
            <div key={selectedProfile.id} className="bg-layer" style={{ backgroundImage: `url(${selectedProfile.visuals.background})` }} />

            <div className="sidebar-header-user">
              <div className="user-details"><span className="user-label">Usuario</span><span className="user-name" style={{ color: userType === 'microsoft' ? '#D4AF37' : '#C0C0C0' }}>{username}</span></div>
              <button className="logout-btn-mini" onClick={handleLogout}>⏻</button>
            </div>

            <div className="preview-overlay">
                <div key={selectedProfile.id} className="preview-content animate-enter">
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                      <span className="preview-version-pill">{selectedProfile.version}</span>
                      <span className="preview-version-pill" style={getLoaderStyle(selectedProfile.loader)}>{getLoaderName(selectedProfile.loader)}</span>
                      <span className="preview-version-pill" style={getJavaStyle(getJavaRequirement(selectedProfile.version))}>{getJavaRequirement(selectedProfile.version)}</span>
                  </div>
                  <h1 className="preview-title-large">{selectedProfile.name}</h1>
                  <div className="play-container">
                    {activeProfileId === selectedProfile.id ? (
                      <button className="play-btn-hero cancel-btn" onClick={(e) => { createRipple(e); handleCancel(); }}>CANCELAR</button>
                    ) : (
                      <button className={`play-btn-hero ${isGameReady ? 'btn-green' : 'btn-red'}`} onClick={(e) => { createRipple(e); handlePlay(selectedProfile); }} disabled={isAnyDownloading && activeProfileId !== selectedProfile.id}>
                        {isAnyDownloading && activeProfileId !== selectedProfile.id ? "OCUPADO" : (isGameReady ? "JUGAR" : "DESCARGAR")} 
                      </button>
                    )}
                    <div className="play-info"><span>Estado: {isGameReady ? "Listo para jugar" : "No instalado"}</span></div>
                  </div>
                </div>
            </div>
          </main>
        </div>
      )}

      {/* --- MODALES --- */}
      {isAnyDownloading && (<div className={`status-bar-container fade-in-up ${viewMode === "sidebar" ? "with-sidebar" : ""}`}><div className="status-bar-content"><span className="spinner">⚡</span><span className="status-text">{statusText}</span></div><div className="progress-track"><div className="progress-fill"></div></div></div>)}
      
      {showSettings && (
        <div className={`settings-overlay ${isClosingSettings ? 'fade-out' : 'fade-in'}`} onClick={handleCloseSettings}>
          <div className="settings-box" onClick={(e) => e.stopPropagation()} style={{ width: '600px', maxWidth: '90vw' }}> 
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h2 className="settings-title" style={{ margin: 0, cursor: 'pointer', color: settingsTab === 'general' ? '#fff' : '#666' }} onClick={() => setSettingsTab("general")}>Configuración</h2>
                <h2 className="settings-title" style={{ margin: 0, cursor: 'pointer', color: settingsTab === 'console' ? '#4CAF50' : '#666' }} onClick={() => setSettingsTab("console")}>Consola</h2>
                <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: 'auto', alignSelf: 'center' }}>v3.5.0</span>
            </div>
            
            {settingsTab === "general" && (
                <>
                    <div className="setting-option">
                        <span>Diseño de Interfaz</span>
                        <button className="toggle-btn" onClick={(e) => { createRipple(e); toggleViewMode(); }}>{viewMode === "grid" ? "Clásico" : "Cuadrícula"}</button>
                    </div>
                    <div className="setting-option" style={{ marginTop: '15px' }}>
                        <span>Cerrar al Jugar</span>
                        <input type="checkbox" checked={closeAfterPlay} style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4CAF50' }} onChange={(e) => {setCloseAfterPlay(e.target.checked); localStorage.setItem("gravity_close_after_play", e.target.checked.toString());}} />
                    </div>
                    <div className="setting-option" style={{ display: 'block', marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>Memoria RAM (Java)</span><span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{ramAmount} GB</span></div>
                        <input type="range" min="1" max="16" step="1" value={ramAmount} style={{ width: '100%', accentColor: '#4CAF50', cursor: 'pointer' }} onChange={(e) => {const val = parseInt(e.target.value); setRamAmount(val); localStorage.setItem("gravity_ram_amount", val.toString());}} />
                    </div>
                    <div className="setting-option" style={{ display: 'flex', marginTop: '25px', borderTop: '1px solid #333', paddingTop: '15px', alignItems: 'center' }}>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                            <span style={{ color: '#ff5555', fontWeight: 'bold' }}>Zona de Peligro</span>
                            <div style={{ fontSize: '0.7rem', color: '#888' }}>Si el juego falla, borra caché para reparar.</div>
                        </div>
                        <button className="toggle-btn" style={{ background: '#3a0000', color: '#ff5555', border: '1px solid #ff5555', fontWeight: 'bold' }} onClick={async (e) => { createRipple(e); if(confirm("¿Estás seguro?")) { try { await invoke("delete_cache"); alert("Caché borrada. Reinicia."); window.location.reload(); } catch(e) { alert("Error: " + e); } } }}>BORRAR CACHÉ</button>
                    </div>
                </>
            )}

            {settingsTab === "console" && (
                <div style={{ backgroundColor: '#000', color: '#0f0', fontFamily: 'monospace', fontSize: '0.85rem', padding: '15px', borderRadius: '8px', height: '300px', overflowY: 'auto', textAlign: 'left' }}>
                    {gameLogs.length === 0 && <span style={{color: '#555'}}>Esperando logs del juego...</span>}
                    {gameLogs.map((log, index) => <div key={index} style={{ marginBottom: '2px', wordBreak: 'break-all' }}>{log.startsWith("[ERR]") ? <span style={{color: '#ff5555'}}>{log}</span> : log}</div>)}
                    <div ref={logsEndRef} />
                </div>
            )}
            <button className="close-settings-btn" style={{ marginTop: '30px'}} onClick={(e) => { createRipple(e); handleCloseSettings(); }}>Cerrar</button>
          </div>
        </div>
      )}

      {crashMessage && (
        <div className="settings-overlay fade-in" style={{ zIndex: 2000 }}>
          <div className="settings-box" style={{ borderColor: '#ff5555', background: '#1a0505' }}>
            <h2 style={{ color: '#ff5555', marginTop: 0 }}>⚠️ JUEGO INTERRUMPIDO</h2>
            <p style={{ color: '#ddd', margin: '20px 0', lineHeight: '1.5' }}>{crashMessage}</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button className="close-settings-btn" style={{ background: '#ff5555', color: 'white', border: 'none', fontWeight: 'bold' }} onClick={(e) => { createRipple(e); setCrashMessage(null); setSettingsTab("console"); setShowSettings(true); }}>VER CONSOLA</button>
                <button className="close-settings-btn" onClick={(e) => { createRipple(e); setCrashMessage(null); }}>CERRAR</button>
            </div>
          </div>
        </div>
      )}

      {currentView === "dashboard" && (
          <div className="creator-credit fade-in">
              <span>Hecho por <strong>6ViPh5</strong></span>
              <img src="/milogo.png" alt="Logo Creador" className="creator-logo" />
          </div>
      )}

    </div>
  );
}

export default App;