(function () {
  'use strict';

  const supabaseClient = window.navodixSupabase;
  const FUNCTION_URL = 'https://hgjtqpztgyrrkujqjmcj.supabase.co/functions/v1/create-careers-user';
  const state = { users: [], currentUser: null, currentAdmin: null, editingUser: null, currentPage: 1 };
  const PAGE_SIZE = 20;
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function showMessage(text, type = '') {
    const el = $('usersMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ` ${type}` : '');
  }

  function showAddFormMessage(text = '') {
    const el = $('addUserFormMessage');
    if (!el) return;
    el.textContent = text || '';
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHtml(busyText)}`;
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
    try { result = await response.json(); } catch (_) {
      throw new Error(`User management service returned HTTP ${response.status}.`);
    }
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || `User management service returned HTTP ${response.status}.`);
    }
    return result;
  }

  function roleLabel(role) { return role === 'hr' ? 'HR' : 'Admin'; }

  function statusInfo(user) {
    if (!user.is_active) return { label: 'Inactive', cls: 'status-closed', icon: 'fa-circle-minus' };
    if (!user.email_confirmed_at) return { label: 'Invitation Pending', cls: 'status-pending', icon: 'fa-envelope' };
    return { label: 'Active', cls: 'status-published', icon: 'fa-circle-check' };
  }

  function statusPill(user) {
    const info = statusInfo(user);
    return `<span class="status-pill ${info.cls}"><i class="fa-solid ${info.icon}" aria-hidden="true"></i> ${info.label}</span>`;
  }

  function formatDate(value, includeTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    if (includeTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
    return date.toLocaleDateString(undefined, options);
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
      $('usersPagination')?.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    const totalPages = Math.max(1, Math.ceil(state.users.length / PAGE_SIZE));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const start = (state.currentPage - 1) * PAGE_SIZE;
    const pageUsers = state.users.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageUsers.map((user) => {
      const isSelf = String(user.user_id) === String(state.currentUser?.id);
      const isAdmin = state.currentAdmin?.role === 'admin';
      const canDelete = !isSelf;
      const toggleLabel = user.is_active ? 'Deactivate' : 'Activate';
      const toggleIcon = user.is_active ? 'fa-user-slash' : 'fa-user-check';
      const info = statusInfo(user);
      const selfNote = isSelf ? '<span class="user-self-note">You</span>' : '';
      const resendAllowed = !user.email_confirmed_at && user.is_active;

      return `
        <tr>
          <td>
            <div class="user-name-cell"><strong>${escapeHtml(user.display_name || '—')}</strong>${selfNote}</div>
          </td>
          <td><span class="user-email-text">${escapeHtml(user.email || '—')}</span></td>
          <td><span class="role-pill role-${escapeHtml(user.role)}">${roleLabel(user.role)}</span></td>
          <td>${statusPill(user)}</td>
          <td><span class="user-date-main">${escapeHtml(formatDate(user.created_at))}</span>${user.last_sign_in_at ? `<small class="user-date-sub">Last login ${escapeHtml(formatDate(user.last_sign_in_at))}</small>` : ''}</td>
          <td class="actions-column">
            <div class="user-actions">
              <button class="icon-button user-edit-button" type="button" data-user-id="${escapeHtml(user.user_id)}" title="Edit user" aria-label="Edit ${escapeHtml(user.display_name || user.email || 'user')}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
              ${resendAllowed ? `<button class="icon-button user-resend-button" type="button" data-user-id="${escapeHtml(user.user_id)}" title="Resend invitation" aria-label="Resend invitation to ${escapeHtml(user.display_name || user.email || 'user')}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>` : ''}
              <button class="icon-button user-reset-button" type="button" data-user-id="${escapeHtml(user.user_id)}" title="Send password reset" aria-label="Send password reset to ${escapeHtml(user.display_name || user.email || 'user')}"><i class="fa-solid fa-key" aria-hidden="true"></i></button>
              <button class="icon-button user-toggle-button" type="button" data-user-id="${escapeHtml(user.user_id)}" data-active="${user.is_active ? 'true' : 'false'}" ${isSelf ? 'disabled' : ''} title="${isSelf ? 'You cannot change your own status' : toggleLabel + ' user'}" aria-label="${toggleLabel} ${escapeHtml(user.display_name || user.email || 'user')}"><i class="fa-solid ${toggleIcon}" aria-hidden="true"></i></button>
              ${canDelete ? `<button class="icon-button user-delete-button danger" type="button" data-user-id="${escapeHtml(user.user_id)}" title="Delete user" aria-label="Delete ${escapeHtml(user.display_name || user.email || 'user')}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
    updateUsersPagination(state.users.length, totalPages, start, pageUsers.length);
  }

  function updateUsersPagination(total, totalPages, start, count) {
    const wrap = $('usersPagination');
    if (!wrap) return;
    wrap.classList.toggle('hidden', total === 0);
    if (!total) return;
    $('usersPageInfo').textContent = `Showing ${start + 1}-${start + count} of ${total}`;
    $('usersPageNumber').textContent = `Page ${state.currentPage} of ${totalPages}`;
    $('usersFirst').disabled = state.currentPage <= 1;
    $('usersPrev').disabled = state.currentPage <= 1;
    $('usersNext').disabled = state.currentPage >= totalPages;
    $('usersLast').disabled = state.currentPage >= totalPages;
  }

  function goToUsersPage(page) {
    const totalPages = Math.max(1, Math.ceil(state.users.length / PAGE_SIZE));
    state.currentPage = Math.min(Math.max(1, page), totalPages);
    renderUsers();
  }

  function updateSummary() {
    const active = state.users.filter(u => u.is_active && u.email_confirmed_at).length;
    const admins = state.users.filter(u => u.role === 'admin' && u.is_active).length;
    const hr = state.users.filter(u => u.role === 'hr' && u.is_active).length;
    const pending = state.users.filter(u => u.is_active && !u.email_confirmed_at).length;
    if ($('usersTotal')) $('usersTotal').textContent = state.users.length;
    if ($('usersActive')) $('usersActive').textContent = active;
    if ($('usersAdmins')) $('usersAdmins').textContent = admins;
    if ($('usersHr')) $('usersHr').textContent = hr;
    if ($('usersPending')) $('usersPending').textContent = pending;
  }

  async function loadUsers() {
    showMessage('Loading users…', '');
    const button = $('refreshUsersButton');
    setBusy(button, true, 'Refreshing');
    try {
      const result = await callFunction({ action: 'list' });
      state.users = Array.isArray(result.users) ? result.users : [];
      state.currentPage = 1;
      state.currentAdmin = result.current_admin || null;
      renderUsers(); updateSummary(); applyCreateUserAccess();
      showMessage('', '');
    } catch (error) {
      console.error('Navodix User Management load failed:', error);
      state.users = []; renderUsers(); updateSummary();
      showMessage(error?.message || String(error), 'error');
    } finally { setBusy(button, false); }
  }

  function applyCreateUserAccess() {
    const allowed = state.currentAdmin?.role === 'admin';
    $('addUserButton')?.classList.toggle('hidden', !allowed);
    $('createUserRestriction')?.classList.toggle('hidden', allowed);
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('user-modal-open');
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.user-modal:not(.hidden)')) document.body.classList.remove('user-modal-open');
  }

  function resetAddForm() {
    $('addUserForm')?.reset();
    if ($('userRole')) $('userRole').value = 'hr';
    showAddFormMessage('');
  }

  function openAddUserModal() {
    if (state.currentAdmin?.role !== 'admin') return;
    resetAddForm(); openModal('addUserCard'); $('userDisplayName')?.focus();
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    const button = $('createUserSubmit');
    const displayName = $('userDisplayName')?.value.trim() || '';
    const email = $('userEmail')?.value.trim() || '';
    const role = $('userRole')?.value || '';
    if (!displayName || !email || !role) {
      showAddFormMessage('Please complete Display Name, Email Address and Role.');
      if (!displayName) $('userDisplayName')?.focus();
      else if (!email) $('userEmail')?.focus();
      else $('userRole')?.focus();
      return;
    }
    showAddFormMessage('');
    setBusy(button, true, 'Sending Invitation');
    showMessage('', '');
    try {
      const result = await callFunction({ action: 'create', display_name: displayName, email, role });
      closeModal('addUserCard'); resetAddForm();
      showMessage(result.message || 'User created and invitation email sent.', 'success');
      await loadUsers();
    } catch (error) {
      showAddFormMessage(error?.message || String(error));
    }
    finally { setBusy(button, false); }
  }

  function openEditUserModal(user) {
    state.editingUser = user;
    $('editUserId').value = user.user_id;
    $('editDisplayName').value = user.display_name || '';
    $('editEmail').value = user.email || '';
    $('editRole').value = user.role || 'hr';
    const roleAllowed = state.currentAdmin?.role === 'admin';
    $('editRole').disabled = !roleAllowed;
    $('editRoleHelp').textContent = roleAllowed ? 'Only Admin can change a user’s role.' : 'Only an Admin can change user roles.';
    openModal('editUserCard'); $('editDisplayName')?.focus();
  }

  async function handleEditUser(event) {
    event.preventDefault();
    const button = $('saveUserEditButton');
    const userId = $('editUserId').value;
    const displayName = $('editDisplayName').value.trim();
    const role = $('editRole').value;
    if (!displayName) { showMessage('Display Name is required.', 'error'); return; }
    setBusy(button, true, 'Saving Changes');
    try {
      const result = await callFunction({ action: 'edit', user_id: userId, display_name: displayName, role });
      closeModal('editUserCard'); state.editingUser = null;
      showMessage(result.message || 'User details updated successfully.', 'success');
      await loadUsers();
    } catch (error) { showMessage(error?.message || String(error), 'error'); }
    finally { setBusy(button, false); }
  }

  async function handleToggleUser(button) {
    const userId = button.dataset.userId;
    const active = button.dataset.active === 'true';
    const user = state.users.find(u => String(u.user_id) === String(userId));
    if (!user) return;
    const verb = active ? 'Deactivate' : 'Activate';
    if (!window.confirm(`${verb} ${user.display_name || user.email}?`)) return;
    setBusy(button, true, verb);
    try {
      const result = await callFunction({ action: 'set_active', user_id: userId, is_active: !active });
      showMessage(result.message || `User ${active ? 'deactivated' : 'activated'}.`, 'success');
      await loadUsers();
    } catch (error) { showMessage(error?.message || String(error), 'error'); setBusy(button, false); }
  }

  async function handleResend(user) {
    if (!user?.email) return;
    if (!window.confirm(`Resend the invitation/access email to ${user.email}?`)) return;
    showMessage(`Sending a new access email to ${user.email}…`, '');
    try {
      const result = await callFunction({ action: 'resend_invitation', user_id: user.user_id });
      showMessage(result.message || 'A new invitation/access email has been sent.', 'success');
      await loadUsers();
    } catch (error) { showMessage(error?.message || String(error), 'error'); }
  }

  async function handleReset(user) {
    if (!user?.email) return;
    if (!window.confirm(`Send a password reset email to ${user.email}?`)) return;
    showMessage(`Sending password reset email to ${user.email}…`, '');
    try {
      const result = await callFunction({ action: 'reset_password', user_id: user.user_id });
      showMessage(result.message || 'Password reset email sent.', 'success');
    } catch (error) { showMessage(error?.message || String(error), 'error'); }
  }

  async function handleDelete(user) {
    if (!user) return;
    if (String(user.user_id) === String(state.currentUser?.id)) { showMessage('You cannot delete your own account.', 'error'); return; }
    const confirmed = window.confirm(`Delete ${user.display_name || user.email}?\n\nThis permanently removes the user’s Careers Admin access and authentication account.`);
    if (!confirmed) return;
    showMessage(`Deleting ${user.display_name || user.email}…`, '');
    try {
      const result = await callFunction({ action: 'delete', user_id: user.user_id });
      showMessage(result.message || 'User deleted successfully.', 'success');
      await loadUsers();
    } catch (error) { showMessage(error?.message || String(error), 'error'); }
  }

  function findUser(id) { return state.users.find(u => String(u.user_id) === String(id)); }

  function setupEvents() {
    $('addUserButton')?.addEventListener('click', openAddUserModal);
    $('addUserForm')?.addEventListener('submit', handleCreateUser);
    $('saveUserEditForm')?.addEventListener('submit', handleEditUser);
    $('refreshUsersButton')?.addEventListener('click', () => { state.currentPage = 1; loadUsers(); });
    $('usersFirst')?.addEventListener('click', () => goToUsersPage(1));
    $('usersPrev')?.addEventListener('click', () => goToUsersPage(state.currentPage - 1));
    $('usersNext')?.addEventListener('click', () => goToUsersPage(state.currentPage + 1));
    $('usersLast')?.addEventListener('click', () => goToUsersPage(999999));

    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-close-user-modal]');
      if (close) {
        const modal = close.closest('.user-modal');
        if (modal) closeModal(modal.id);
        return;
      }
      const edit = event.target.closest('.user-edit-button');
      if (edit) { const user = findUser(edit.dataset.userId); if (user) openEditUserModal(user); return; }
      const resend = event.target.closest('.user-resend-button');
      if (resend) { const user = findUser(resend.dataset.userId); if (user) handleResend(user); return; }
      const reset = event.target.closest('.user-reset-button');
      if (reset) { const user = findUser(reset.dataset.userId); if (user) handleReset(user); return; }
      const del = event.target.closest('.user-delete-button');
      if (del) { const user = findUser(del.dataset.userId); if (user) handleDelete(user); return; }
      const toggle = event.target.closest('.user-toggle-button');
      if (toggle && !toggle.disabled) { handleToggleUser(toggle); }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.user-modal:not(.hidden)').forEach(modal => closeModal(modal.id));
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (!supabaseClient) return;
    await window.navodixAdminReady;
    setupEvents();
    await loadUsers();
  });
})();
