(function () {
  'use strict';

  const supabase = window.navodixSupabase;
  let locations = [];
  let editingId = null;
  let deleteTarget = null;
  let dirty = false;
  let saving = false;
  let currentPage = 1;
  const PAGE_SIZE = 20;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function message(text, type = '') {
    const el = $('locationMessage');
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ` ${type}` : '');
  }

  function formMessage(text, type = '') {
    const el = $('locationFormMessage');
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ` ${type}` : '');
  }

  function statusPill(active) {
    return `<span class="status-pill ${active ? 'status-published' : 'status-closed'}">${active ? 'Active' : 'Inactive'}</span>`;
  }

  async function load() {
    message('Loading locations…');
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('display_order')
        .order('location_name');

      if (error) throw error;
      locations = data || [];
      render();
      message('');
    } catch (error) {
      console.error(error);
      message(`Could not load locations: ${error.message || error}`, 'error');
    }
  }

  function render() {
    const query = $('locationSearch').value.trim().toLowerCase();
    const filter = $('locationStatusFilter').value;

    const rows = locations.filter(location => {
      const matchesSearch = !query || String(location.location_name || '').toLowerCase().includes(query);
      const matchesStatus = !filter || (filter === 'active' ? location.is_active : !location.is_active);
      return matchesSearch && matchesStatus;
    });
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    $('locationsTableBody').innerHTML = pageRows.map(location => `
      <tr>
        <td><strong>${escapeHtml(location.location_name)}</strong></td>
        <td>${statusPill(location.is_active)}</td>
        <td>${escapeHtml(location.display_order)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(location.id)}" title="Edit" aria-label="Edit location">
              <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
            </button>
            <button class="icon-button danger-icon" type="button" data-action="delete" data-id="${escapeHtml(location.id)}" title="Delete" aria-label="Delete location">
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    const hasRows = pageRows.length > 0;
    $('emptyLocations').classList.toggle('hidden', !hasRows);
    $('locationsTableBody').closest('.table-wrap').classList.toggle('hidden', !hasRows);
    updatePagination(rows.length, totalPages, start, pageRows.length);
  }

  function updatePagination(total, totalPages, start, count) {
    const wrap = $('locationsPagination');
    if (!wrap) return;
    wrap.classList.toggle('hidden', total === 0);
    if (!total) return;
    $('locationsPageInfo').textContent = `Showing ${start + 1}-${start + count} of ${total}`;
    $('locationsPageNumber').textContent = `Page ${currentPage} of ${totalPages}`;
    $('locationsFirst').disabled = currentPage <= 1;
    $('locationsPrev').disabled = currentPage <= 1;
    $('locationsNext').disabled = currentPage >= totalPages;
    $('locationsLast').disabled = currentPage >= totalPages;
  }
  function goToPage(page) {
    const query = $('locationSearch').value.trim().toLowerCase();
    const filter = $('locationStatusFilter').value;
    const total = locations.filter(location => (!query || String(location.location_name || '').toLowerCase().includes(query)) && (!filter || (filter === 'active' ? location.is_active : !location.is_active))).length;
    currentPage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
    render();
  }

  function openForm(location = null) {
    editingId = location?.id || null;
    dirty = false;
    $('locationForm').reset();
    $('locationId').value = editingId || '';
    $('locationModalTitle').textContent = location ? 'Edit Location' : 'Add Location';
    $('locationStatus').value = location ? String(location.is_active) : 'true';
    $('locationDisplayOrder').value = location?.display_order ?? 0;
    $('locationName').value = location?.location_name || '';
    formMessage('');
    $('locationModal').classList.remove('hidden');
    $('locationModal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    $('locationName').focus();
  }

  function closeForm(force = false) {
    if (!force && dirty && !window.confirm('You have entered information. Are you sure you want to close without saving?')) {
      return false;
    }
    dirty = false;
    $('locationModal').classList.add('hidden');
    $('locationModal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    return true;
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;

    const name = $('locationName').value.trim();
    const isActive = $('locationStatus').value === 'true';
    const displayOrder = Math.max(0, parseInt($('locationDisplayOrder').value || '0', 10));

    if (!name) {
      formMessage('Location Name is required.', 'error');
      return;
    }

    saving = true;
    const button = $('saveLocationButton');
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    formMessage('Saving location…');

    try {
      const payload = {
        location_name: name,
        is_active: isActive,
        display_order: displayOrder,
        updated_at: new Date().toISOString()
      };

      const query = editingId
        ? supabase.from('locations').update(payload).eq('id', editingId)
        : supabase.from('locations').insert(payload);

      const { error } = await query;
      if (error) throw error;

      dirty = false;
      closeForm(true);
      message(editingId ? 'Location updated successfully.' : 'Location added successfully.', 'success');
      await load();
    } catch (error) {
      console.error(error);
      const duplicate = error && (error.code === '23505' || String(error.message || '').toLowerCase().includes('location_name'));
      formMessage(duplicate ? 'A location with this name already exists.' : `Could not save location: ${error.message || error}`, 'error');
    } finally {
      saving = false;
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save';
    }
  }

  function askDelete(id) {
    const location = locations.find(item => item.id === id);
    if (!location) return;
    deleteTarget = id;
    $('deleteLocationText').textContent = `“${location.location_name}” will be permanently removed if it has not been used by a job. If it is already used, make it Inactive instead.`;
    $('deleteLocationModal').classList.remove('hidden');
    $('deleteLocationModal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeDeleteModal() {
    deleteTarget = null;
    $('deleteLocationModal').classList.add('hidden');
    $('deleteLocationModal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function deleteLocation() {
    if (!deleteTarget) return;

    const button = $('confirmDeleteLocationButton');
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';

    try {
      const { error } = await supabase.from('locations').delete().eq('id', deleteTarget);
      if (error) throw error;
      closeDeleteModal();
      message('Location deleted successfully.', 'success');
      await load();
    } catch (error) {
      console.error(error);
      closeDeleteModal();
      const used = error && error.code === '23503';
      message(
        used
          ? 'This location is already used by a job. Make it Inactive instead of deleting it.'
          : `Could not delete location: ${error.message || error}`,
        'error'
      );
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
    }
  }

  function bind() {
    $('addLocationButton').addEventListener('click', () => openForm());
    $('closeLocationModal').addEventListener('click', () => closeForm());
    $('cancelLocationButton').addEventListener('click', () => closeForm());
    $('locationForm').addEventListener('submit', save);
    $('locationForm').addEventListener('input', () => { dirty = true; });
    $('locationForm').addEventListener('change', () => { dirty = true; });
    $('locationSearch').addEventListener('input', () => { currentPage = 1; render(); });
    $('locationStatusFilter').addEventListener('change', () => { currentPage = 1; render(); });
    $('refreshLocationsButton').addEventListener('click', () => { currentPage = 1; load(); });
    $('locationsFirst').addEventListener('click', () => goToPage(1));
    $('locationsPrev').addEventListener('click', () => goToPage(currentPage - 1));
    $('locationsNext').addEventListener('click', () => goToPage(currentPage + 1));
    $('locationsLast').addEventListener('click', () => goToPage(999999));

    $('locationsTableBody').addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const location = locations.find(item => item.id === button.dataset.id);
      if (!location) return;
      if (button.dataset.action === 'edit') openForm(location);
      if (button.dataset.action === 'delete') askDelete(location.id);
    });

    $('cancelDeleteLocationButton').addEventListener('click', closeDeleteModal);
    $('confirmDeleteLocationButton').addEventListener('click', deleteLocation);

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!$('locationModal').classList.contains('hidden')) closeForm();
      else if (!$('deleteLocationModal').classList.contains('hidden')) closeDeleteModal();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bind();
    const allowed = await window.navodixAdminReady;
    if (allowed === false) return;
    await load();
  });
})();
