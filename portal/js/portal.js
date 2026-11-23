(function () {
  'use strict';

  const db = window.navodixSupabase;
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const accountsButton = document.getElementById('accountsButton');
  const adminButton = document.getElementById('adminButton');
  const errorBox = document.getElementById('loginError');

  const destinations = {
    accounts: '../accounts/',
    admin: '../admin/recruitment.html'
  };

  function showError(message) {
    errorBox.textContent = message || '';
    errorBox.classList.toggle('show', Boolean(message));
  }

  function setBusy(isBusy, target) {
    accountsButton.disabled = isBusy;
    adminButton.disabled = isBusy;
    accountsButton.textContent = isBusy && target === 'accounts' ? 'Checking Accounts access…' : 'Sign in to Accounts';
    adminButton.textContent = isBusy && target === 'admin' ? 'Checking Admin access…' : 'Sign in to Admin';
  }

  async function hasAccountsAccess(user) {
    const result = await db
      .from('acc_user_profiles')
      .select('id,full_name,user_type,is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (result.error) throw result.error;
    return Boolean(result.data && result.data.is_active === true);
  }

  async function hasAdminAccess() {
    const result = await db.rpc('is_careers_admin');
    if (result.error) throw result.error;
    return result.data === true;
  }

  async function authenticateFor(target) {
    if (!db) throw new Error('Supabase client could not be initialized. Please refresh and try again.');

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) throw new Error('Please enter both your email address and password.');

    const authResult = await db.auth.signInWithPassword({ email, password });
    if (authResult.error) throw authResult.error;
    if (!authResult.data || !authResult.data.user) throw new Error('Sign-in could not be completed. Please try again.');

    let authorised = false;
    if (target === 'accounts') {
      authorised = await hasAccountsAccess(authResult.data.user);
      if (!authorised) throw new Error('This account does not have access to Navodix Accounts Management.');
    } else if (target === 'admin') {
      authorised = await hasAdminAccess();
      if (!authorised) throw new Error('This account does not have access to the Navodix Admin Portal.');
    } else {
      throw new Error('Please select a valid portal.');
    }

    window.location.replace(destinations[target]);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const target = event.submitter && event.submitter.dataset.target;
    if (!target) {
      showError('Please choose Sign in to Accounts or Sign in to Admin.');
      return;
    }

    showError('');
    setBusy(true, target);
    try {
      await authenticateFor(target);
    } catch (error) {
      showError(error && error.message ? error.message : 'Unable to sign in. Please try again.');
      setBusy(false);
    }
  });

  if (!db) showError('Supabase client could not be initialized. Please refresh and try again.');
})();
