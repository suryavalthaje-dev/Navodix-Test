(function () {
  'use strict';

  const supabaseClient = window.navodixSupabase;
  const FUNCTION_URL = 'https://hgjtqpztgyrrkujqjmcj.supabase.co/functions/v1/create-careers-user';
  const state = { users: [], currentUser: null, currentAdmin: null };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showMessage(text, type = '') {
    const el = $('usersMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ` ${type}` : '');
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${busyText}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
    }
  }

  async function getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data?.session) throw new Error('Your session has expired. Please sign in again.');
    state.currentUser = data.session.user;
    return data.session;
  }

  async function callFunction(payload) {
    const session = await getSession();
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': window.NAVODIX_SUPABASE_PUBLISHABLE_KEY || ''
      },
      body: JSON.stringify(payload)
    });

    let result = null;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error(`User management service returned HTTP ${response.status}.`);
    }

    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || `User management service returned HTTP ${response.status}.`);
    }

    return result;
  }

  function roleLabel(role) {
    return role === 'hr' ? 'HR' : 'Admin';
  }

  function statusPill(active) {
    return active
      ? '<span class="status-pill status-published">Active</span>'
      : '<span class="status-pill status-closed">Inactive</span>';
  }

  function renderUsers() {
    const tbody = $('usersTableBody');
    const empty = $('usersEmpty');
    const tableWrap = $('usersTableWrap');
    if (!tbody || !empty || !tableWrap) return;

    if (!state.users.length) {
      tbody.innerHTML = '';
      tableWrap.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    tableWrap.classList.remove('hidden');

    tbody.innerHTML = state.users.map((user) => {
      const isSelf = String(user.user_id) === String(state.currentUser?.id);
      const toggleLabel = user.is_active ? 'Deactivate' : 'Activate';
      const toggleIcon = user.is_active ? 'fa-user-slash' : 'fa-user-check';
      const selfNote = isSelf ? '<span class="user-self-note">You</span>' : '';

      return `
        <tr>
          <td>
            <div class="user-name-cell">
              <strong>${escapeHtml(user.display_name || '—')}</strong>
              ${selfNote}
            </div>
          </td>
          <td>${escapeHtml(user.email || '—')}</td>
          <td><span class="role-pill role-${escapeHtml(user.role)}">${roleLabel(user.role)}</span></td>
          <td>${statusPill(user.is_active)}</td>
          <td>${escapeHtml(formatDate(user.created_at))}</td>
          <td class="actions-column">
            <button class="icon-button user-toggle-button${isSelf ? ' disabled' : ''}"
              type="button"
              data-user-id="${escapeHtml(user.user_id)}"
              data-active="${user.is_active ? 'true' : 'false'}"
              ${isSelf ? 'disabled title="You cannot deactivate your own account"' : `title="${toggleLabel} user"`}
              aria-label="${toggleLabel} ${escapeHtml(user.display_name || user.email || 'user')}">
              <i class="fa-solid ${toggleIcon}" aria-hidden="true"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function updateSummary() {
    const active = state.users.filter((user) => user.is_active).length;
    const admins = state.users.filter((user) => user.role === 'admin' && user.is_active).length;
    const hr = state.users.filter((user) => user.role === 'hr' && user.is_active).length;
    if ($('usersTotal')) $('usersTotal').textContent = state.users.length;
    if ($('usersActive')) $('usersActive').textContent = active;
    if ($('usersAdmins')) $('usersAdmins').textContent = admins;
    if ($('usersHr')) $('usersHr').textContent = hr;
  }

  async function loadUsers() {
    showMessage('Loading users…', '');
    const button = $('refreshUsersButton');
    setBusy(button, true, 'Refreshing');

    try {
      const result = await callFunction({ action: 'list' });
      state.users = Array.isArray(result.users) ? result.users : [];
      state.currentAdmin = result.current_admin || null;
      renderUsers();
      updateSummary();
      applyCreateUserAccess();
      showMessage('', '');
    } catch (error) {
      console.error('Navodix User Management load failed:', error);
      state.users = [];
      renderUsers();
      updateSummary();
      showMessage(error?.message || String(error), 'error');
    } finally {
      setBusy(button, false);
    }
  }

  function applyCreateUserAccess() {
    const allowed = state.currentAdmin?.role === 'admin';
    const addButton = $('addUserButton');
    const restriction = $('createUserRestriction');

    if (addButton) addButton.classList.toggle('hidden', !allowed);
    if (restriction) restriction.classList.toggle('hidden', allowed);
  }

  function openUserModal() {
    const modal = $('addUserCard');
    if (!modal || state.currentAdmin?.role !== 'admin') return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('user-modal-open');
    $('userDisplayName')?.focus();
  }

  function closeUserModal() {
    const modal = $('addUserCard');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('user-modal-open');
  }

  function resetForm() {
    const form = $('addUserForm');
    if (form) form.reset();
    if ($('userRole')) $('userRole').value = 'hr';
    showMessage('', '');
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('createUserSubmit');
    const displayName = $('userDisplayName')?.value.trim() || '';
    const email = $('userEmail')?.value.trim() || '';
    const role = $('userRole')?.value || '';

    if (!displayName || !email || !role) {
      showMessage('Please complete Display Name, Email Address and Role.', 'error');
      return;
    }

    setBusy(button, true, 'Creating User');
    showMessage('Creating user and sending invitation…', '');

    try {
      const result = await callFunction({
        action: 'create',
        display_name: displayName,
        email,
        role
      });

      form.reset();
      if ($('userRole')) $('userRole').value = 'hr';
      closeUserModal();
      showMessage(result.message || 'User created and invitation email sent.', 'success');
      await loadUsers();
    } catch (error) {
      console.error('Navodix User Management create failed:', error);
      showMessage(error?.message || String(error), 'error');
    } finally {
      setBusy(button, false);
    }
  }

  async function handleToggleUser(button) {
    const userId = button.dataset.userId;
    const currentlyActive = button.dataset.active === 'true';
    const user = state.users.find((item) => String(item.user_id) === String(userId));
    if (!user) return;

    const action = currentlyActive ? 'deactivate' : 'activate';
    const confirmation = currentlyActive
      ? `Deactivate ${user.display_name || user.email}? They will no longer be able to access Careers Admin.`
      : `Activate ${user.display_name || user.email}?`;

    if (!window.confirm(confirmation)) return;

    setBusy(button, true, currentlyActive ? 'Deactivating' : 'Activating');
    showMessage(`${currentlyActive ? 'Deactivating' : 'Activating'} user…`, '');

    try {
      const result = await callFunction({
        action: 'set_active',
        user_id: userId,
        is_active: !currentlyActive
      });

      showMessage(result.message || `User ${action}d successfully.`, 'success');
      await loadUsers();
    } catch (error) {
      console.error('Navodix User Management status change failed:', error);
      showMessage(error?.message || String(error), 'error');
      setBusy(button, false);
    }
  }

  function setupEvents() {
    $('addUserButton')?.addEventListener('click', openUserModal);
    $('cancelAddUserButton')?.addEventListener('click', () => { resetForm(); closeUserModal(); });
    $('cancelAddUserButtonBottom')?.addEventListener('click', () => { resetForm(); closeUserModal(); });
    document.querySelector('[data-close-user-modal]')?.addEventListener('click', () => { resetForm(); closeUserModal(); });
    $('addUserForm')?.addEventListener('submit', handleCreateUser);
    $('refreshUsersButton')?.addEventListener('click', loadUsers);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('addUserCard')?.classList.contains('hidden')) {
        resetForm();
        closeUserModal();
      }
    });

    $('usersTableBody')?.addEventListener('click', (event) => {
      const button = event.target.closest('.user-toggle-button');
      if (button && !button.disabled) handleToggleUser(button);
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (!supabaseClient) return;
    await window.navodixAdminReady;
    setupEvents();
    await loadUsers();
  });
})();
