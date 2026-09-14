(function () {
  'use strict';

  const supabaseClient = window.navodixSupabase;
  const isLoginPage = Boolean(document.getElementById('loginForm'));
  const isDashboardPage = Boolean(document.getElementById('logoutButton'));

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

  function populateAdminUser(user) {
    const el = document.getElementById('adminUser');
    if (!el || !user) return;
    el.textContent = user.email || 'Admin';
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
      if (isLoginPage) window.location.replace('manage-jobs.html');
      if (isDashboardPage) populateAdminUser(data.session.user);
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
      populateAdminUser(data.session.user);
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

      window.location.replace('manage-jobs.html');
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
          window.location.replace('manage-jobs.html');
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          setMessage(`Sign-in failed: ${message}`, 'error');
          setLoading(false);
        }
      }
    });
  });
})();
