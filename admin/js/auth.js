(function () {
  'use strict';

  const supabaseClient = window.navodixSupabase;
  const isLoginPage = Boolean(document.getElementById('loginForm'));
  const isDashboardPage = Boolean(document.getElementById('logoutButton'));
  let sessionTimeoutTimer = null;
  let sessionDeadlineKey = null;
  let sessionDeadline = 0;
  let lastDeadlineWrite = 0;
  let loggingOutForTimeout = false;
  let presenceHeartbeatTimer = null;

  async function sendPresenceHeartbeat(userId) {
    if (!supabaseClient || !userId || document.visibilityState === 'hidden') return;
    try {
      const { error } = await supabaseClient.from('navodix_user_presence').upsert(
        { user_id: userId, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
    } catch (error) {
      console.warn('Unable to update user presence. Ensure navodix_user_presence is deployed.', error);
    }
  }

  function startPresenceHeartbeat(userId) {
    if (presenceHeartbeatTimer) window.clearInterval(presenceHeartbeatTimer);
    void sendPresenceHeartbeat(userId);
    presenceHeartbeatTimer = window.setInterval(() => void sendPresenceHeartbeat(userId), 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') void sendPresenceHeartbeat(userId);
    });
    window.addEventListener('focus', () => void sendPresenceHeartbeat(userId));
  }

  function setMessage(message, type) {
    const el = document.getElementById('loginMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'login-message' + (type ? ' ' + type : '');
  }

  function setLoading(isLoading) {
    const button = document.getElementById('loginButton');
    const text = document.getElementById('loginButtonText');
    if (!button || !text) return;
    button.disabled = isLoading;
    text.textContent = isLoading ? 'Signing In…' : 'Sign In';
  }

  async function populateAdminUser(user) {
    const el = document.getElementById('adminUser');
    if (!el || !user) return;

    const fallback = user.user_metadata?.display_name || user.email || 'Admin';
    el.textContent = fallback;

    try {
      const { data, error } = await supabaseClient
        .from('careers_admins')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data?.display_name) el.textContent = data.display_name;
    } catch (error) {
      console.warn('Unable to load Careers Admin display name:', error);
    }
  }

  async function getConfiguredSessionTimeout(userId) {
    // Read the per-user timeout saved by User Management. Fall back only if the
    // setting is unavailable; valid configured values are enforced as minutes.
    try {
      const { data, error } = await supabaseClient
        .from('careers_admins')
        .select('session_timeout_minutes')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      const minutes = Number(data?.session_timeout_minutes);
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
    } catch (error) {
      console.error('Unable to read per-user session timeout; using 30-minute fallback:', error);
      return 30;
    }
  }

  async function endTimedOutSession() {
    if (loggingOutForTimeout) return;
    loggingOutForTimeout = true;
    if (sessionTimeoutTimer) window.clearTimeout(sessionTimeoutTimer);
    try {
      if (supabaseClient) await supabaseClient.auth.signOut();
    } catch (error) {
      console.warn('Sign-out after session timeout failed:', error);
    } finally {
      if (sessionDeadlineKey) localStorage.removeItem(sessionDeadlineKey);
      window.location.replace('index.html?reason=session-timeout');
    }
  }

  function scheduleSessionExpiry() {
    if (sessionTimeoutTimer) window.clearTimeout(sessionTimeoutTimer);
    const remaining = sessionDeadline - Date.now();
    if (remaining <= 0) {
      void endTimedOutSession();
      return;
    }
    sessionTimeoutTimer = window.setTimeout(scheduleSessionExpiry, Math.min(remaining, 15000));
  }

  function recordSessionActivity(force) {
    if (!sessionDeadlineKey || loggingOutForTimeout) return;
    const now = Date.now();
    // Avoid writing to storage on every mousemove, while still sharing a fresh
    // deadline across tabs at least every 10 seconds.
    if (!force && now - lastDeadlineWrite < 10000) return;
    lastDeadlineWrite = now;
    sessionDeadline = now + (window.navodixSessionTimeoutMinutes || 30) * 60 * 1000;
    try { localStorage.setItem(sessionDeadlineKey, String(sessionDeadline)); } catch (_) {}
    scheduleSessionExpiry();
  }

  async function startSessionTimeout(user) {
    if (!user || !isDashboardPage) return;
    window.navodixSessionTimeoutMinutes = await getConfiguredSessionTimeout(user.id);
    sessionDeadlineKey = 'navodix-session-deadline:' + user.id;

    let storedDeadline = 0;
    try { storedDeadline = Number(localStorage.getItem(sessionDeadlineKey) || 0); } catch (_) {}
    if (storedDeadline && storedDeadline <= Date.now()) {
      await endTimedOutSession();
      return;
    }

    // Page navigation counts as activity. If another tab is active, its updates
    // keep the shared deadline current; an abandoned browser expires regardless
    // of Supabase's token auto-refresh behavior.
    sessionDeadline = storedDeadline || 0;
    recordSessionActivity(true);
    startPresenceHeartbeat(user.id);

    ['pointerdown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (eventName) {
      document.addEventListener(eventName, function () { recordSessionActivity(false); }, { passive: true });
    });
    document.addEventListener('mousemove', function () { recordSessionActivity(false); }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        const remaining = sessionDeadline - Date.now();
        if (remaining <= 0) void endTimedOutSession();
        else scheduleSessionExpiry();
      }
    });
    window.addEventListener('focus', function () {
      const remaining = sessionDeadline - Date.now();
      if (remaining <= 0) void endTimedOutSession();
      else scheduleSessionExpiry();
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== sessionDeadlineKey || !event.newValue) return;
      const newDeadline = Number(event.newValue);
      if (!Number.isFinite(newDeadline)) return;
      sessionDeadline = newDeadline;
      if (sessionDeadline <= Date.now()) void endTimedOutSession();
      else scheduleSessionExpiry();
    });
    scheduleSessionExpiry();
  }

  async function verifyCareersAdmin() {
    if (!supabaseClient) {
      throw new Error('Supabase client is not available.');
    }

    const { data, error } = await supabaseClient.rpc('is_careers_admin');
    if (error) throw error;

    if (data !== true) {
      await supabaseClient.auth.signOut();
      throw new Error('This account is not authorized as a Careers Admin.');
    }

    return true;
  }

  async function redirectIfAuthenticated() {
    if (!supabaseClient) return;

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data || !data.session) return;

      await verifyCareersAdmin();
      if (isLoginPage) window.location.replace('recruitment.html');
      if (isDashboardPage) await populateAdminUser(data.session.user);
    } catch (error) {
      console.error('Navodix Careers Admin session check failed:', error);
      if (isLoginPage) {
        const message = error && error.message ? error.message : String(error);
        setMessage(`Session check failed: ${message}`, 'error');
      } else if (isDashboardPage) {
        window.location.replace('index.html');
      }
    }
  }

  async function requireAuthenticatedAdmin() {
    if (!supabaseClient) {
      window.location.replace('index.html');
      return false;
    }

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data || !data.session) {
        window.location.replace('index.html');
        return false;
      }

      await verifyCareersAdmin();
      await populateAdminUser(data.session.user);
      return true;
    } catch (error) {
      console.error('Navodix Careers Admin authorization failed:', error);
      window.location.replace('index.html');
      return false;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('', '');

    if (!supabaseClient) {
      setMessage('Supabase client could not be initialized. Please check the Supabase client configuration.', 'error');
      return;
    }

    const form = event.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) {
      setMessage('Please enter your email address and password.', 'error');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await verifyCareersAdmin();
      console.log(
        'Navodix Careers Admin sign-in succeeded:',
        data && data.user ? data.user.email : email
      );

      window.location.replace('recruitment.html');
    } catch (error) {
      console.error('Navodix Careers Admin sign-in error:', error);
      const details = [
        error && error.message ? error.message : String(error),
        error && error.code ? `Code: ${error.code}` : '',
        error && error.status ? `HTTP ${error.status}` : ''
      ].filter(Boolean).join(' | ');
      setMessage(`Sign-in failed: ${details}`, 'error');
      setLoading(false);
    }
  }

  function setupPasswordToggle() {
    const toggle = document.getElementById('passwordToggle');
    const input = document.getElementById('password');
    if (!toggle || !input) return;

    toggle.addEventListener('click', function () {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.setAttribute('aria-pressed', String(!showing));
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      const icon = toggle.querySelector('i');
      if (icon) {
        icon.className = showing ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
      }
    });
  }

  async function handleLogout() {
    if (!supabaseClient) return;
    try {
      if (sessionTimeoutTimer) window.clearTimeout(sessionTimeoutTimer);
      if (sessionDeadlineKey) localStorage.removeItem(sessionDeadlineKey);
      if (presenceHeartbeatTimer) window.clearInterval(presenceHeartbeatTimer);
      await supabaseClient.auth.signOut();
    } finally {
      window.location.replace('index.html');
    }
  }

  let adminReadyResolve;
  window.navodixAdminReady = new Promise(function(resolve) {
    adminReadyResolve = resolve;
  });

  document.addEventListener('DOMContentLoaded', async function () {
    if (!supabaseClient) {
      if (isLoginPage) {
        setMessage('Supabase client could not be initialized.', 'error');
      } else if (isDashboardPage) {
        window.location.replace('index.html');
      }
      return;
    }

    if (isLoginPage) {
      setupPasswordToggle();
      const form = document.getElementById('loginForm');
      if (form) form.addEventListener('submit', handleLogin);
      await redirectIfAuthenticated();
    }

    if (isDashboardPage) {
      const allowed = await requireAuthenticatedAdmin();
      if (adminReadyResolve) adminReadyResolve(allowed);
      if (!allowed) return;

      const { data: activeSessionData, error: activeSessionError } = await supabaseClient.auth.getSession();
      if (activeSessionError) throw activeSessionError;
      if (activeSessionData?.session?.user) await startSessionTimeout(activeSessionData.session.user);

      const logout = document.getElementById('logoutButton');
      if (logout) logout.addEventListener('click', handleLogout);
    }

    supabaseClient.auth.onAuthStateChange(async function (event, session) {
      if (event === 'SIGNED_OUT' || !session) {
        if (isDashboardPage) window.location.replace('index.html');
        return;
      }

      if (event === 'SIGNED_IN' && isLoginPage) {
        try {
          await verifyCareersAdmin();
          window.location.replace('recruitment.html');
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          setMessage(`Sign-in failed: ${message}`, 'error');
          setLoading(false);
        }
      }
    });
  });
})();
