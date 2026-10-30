(function () {
  'use strict';

  const supabase = window.navodixSupabase;
  let jobs = [];
  let deleteJobId = null;
  let saving = false;
  let viewMode = false;
  let clients = [];
  let jobCategories = [];
  let locations = [];
  let selectedRequirementId = '';
  let multiCandidateSelectedIds = new Set();
  let currentJD = null;
  let jdRemovalRequested = false;

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  function renderJDState(job = null) {
    currentJD = job && job.jd_object_path ? {
      file_name: job.jd_file_name || 'Job Description',
      file_size: job.jd_file_size || 0,
      uploaded_at: job.jd_uploaded_at || null
    } : null;
    jdRemovalRequested = false;
    const current = $('jdCurrentDocument');
    const status = $('jdDocumentStatus');
    const fileName = $('jdCurrentFileName');
    const fileSize = $('jdCurrentFileSize');
    const fileInput = $('jdFileInput');
    const selectedName = $('jdSelectedFileName');
    const clearButton = $('clearJDSelectionButton');
    if (fileInput) fileInput.value = '';
    if (selectedName) selectedName.textContent = 'No file selected';
    if (clearButton) clearButton.classList.add('hidden');
    if (currentJD) {
      current.classList.remove('hidden');
      fileName.textContent = currentJD.file_name;
      fileSize.textContent = formatFileSize(currentJD.file_size);
      status.textContent = 'JD attached';
      status.classList.add('has-document');
    } else {
      current.classList.add('hidden');
      fileName.textContent = '';
      fileSize.textContent = '';
      status.textContent = 'No JD attached';
      status.classList.remove('has-document');
    }
    $('jdUploadControls').classList.toggle('hidden', viewMode);
    $('removeJDButton').classList.toggle('hidden', viewMode || !currentJD);
    $('viewJDButton').disabled = !currentJD;
    $('downloadJDButton').disabled = !currentJD;
    if (!currentJD) closeJDViewer();
  }

  async function requirementDocumentAction(action, file = null) {
    const jobId = $('jobId').value;
    if (!jobId) throw new Error('Save the requirement before managing its JD document.');
    const body = new FormData();
    body.append('action', action);
    body.append('job_id', jobId);
    if (file) body.append('file', file, file.name);
    const { data, error } = await supabase.functions.invoke('requirement-documents', { body });
    if (error) {
      let message = error.message || 'The JD document request failed.';
      try { if (error.context && typeof error.context.json === 'function') { const detail = await error.context.json(); if (detail && detail.error) message = detail.error; } } catch (_) {}
      throw new Error(message);
    }
    if (!data || data.success === false) throw new Error(data?.error || 'The JD document request failed.');
    return data;
  }

  async function refreshRequirementJD() {
    const jobId = $('jobId').value;
    if (!jobId) { renderJDState(null); return; }
    const { data, error } = await supabase.from('jobs')
      .select('jd_file_name,jd_object_path,jd_file_type,jd_file_size,jd_uploaded_at')
      .eq('id', jobId).single();
    if (error) throw error;
    renderJDState(data);
  }

  function closeJDViewer() {
    const viewer = $('jdInlineViewer');
    const frame = $('jdViewerFrame');
    const docxViewer = $('jdDocxViewer');
    const loading = $('jdViewerLoading');
    const fallback = $('jdViewerFallback');
    if (frame) { frame.onload = null; frame.src = 'about:blank'; frame.classList.add('hidden'); }
    if (docxViewer) { docxViewer.innerHTML = ''; docxViewer.classList.add('hidden'); }
    if (viewer) viewer.classList.add('hidden');
    if (loading) { loading.textContent = 'Preparing JD document…'; loading.classList.remove('hidden'); }
    if (fallback) fallback.classList.add('hidden');
    $('openJDNewTabButton')?.classList.add('hidden');
    $('closeJDButton')?.classList.add('hidden');
  }

  async function viewRequirementJD() {
    const viewer = $('jdInlineViewer');
    const frame = $('jdViewerFrame');
    const docxViewer = $('jdDocxViewer');
    const loading = $('jdViewerLoading');
    const fallback = $('jdViewerFallback');
    try {
      if (!currentJD) throw new Error('No JD document is attached to this requirement.');
      viewer.classList.remove('hidden');
      frame.classList.add('hidden');
      docxViewer.classList.add('hidden');
      docxViewer.innerHTML = '';
      fallback.classList.add('hidden');
      loading.classList.remove('hidden');
      loading.textContent = 'Preparing JD document…';
      const data = await requirementDocumentAction('view-url');
      if (!data.signed_url) throw new Error('The document link was not returned.');
      const url = data.signed_url;
      const fileName = String(currentJD.file_name || '');
      const isPdf = /\.pdf$/i.test(fileName);
      const isDocx = /\.docx$/i.test(fileName);
      $('openJDNewTabButton').onclick = () => window.open(url, '_blank', 'noopener,noreferrer');
      $('openJDNewTabButton').classList.remove('hidden');
      if (isDocx) {
        if (typeof window.docx === 'undefined' || typeof window.docx.renderAsync !== 'function') throw new Error('DOCX preview support is not available. Please refresh the page and try again.');
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`JD request failed (HTTP ${response.status})`);
        const blob = await response.blob();
        await window.docx.renderAsync(blob, docxViewer, null, { breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true });
        docxViewer.classList.remove('hidden');
        loading.classList.add('hidden');
        $('closeJDButton').classList.remove('hidden');
      } else if (isPdf) {
        frame.onload = () => { loading.classList.add('hidden'); frame.classList.remove('hidden'); $('closeJDButton').classList.remove('hidden'); };
        frame.src = url + '#toolbar=1&navpanes=0&view=FitH';
      } else {
        loading.classList.add('hidden');
        fallback.classList.remove('hidden');
      }
    } catch (error) {
      closeJDViewer();
      showFormMessage(`Could not open the JD: ${error.message || error}`, 'error');
    }
  }

  async function downloadRequirementJD() {
    try {
      const data = await requirementDocumentAction('download-url');
      if (!data.signed_url) throw new Error('The document link was not returned.');
      const link = document.createElement('a');
      link.href = data.signed_url;
      link.download = currentJD?.file_name || 'Job-Description';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showFormMessage(`Could not download the JD: ${error.message || error}`, 'error');
    }
  }

  async function removeRequirementJD() {
    if (!currentJD || !window.confirm('Remove the attached JD document from this requirement?')) return;
    const button = $('removeJDButton');
    button.disabled = true;
    try {
      await requirementDocumentAction('delete');
      await refreshRequirementJD();
      jobFormDirty = false;
      showFormMessage('JD document removed.', 'success');
    } catch (error) {
      showFormMessage(`Could not remove JD: ${error.message || error}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function showMessage(text, type = '') {
    const el = $('jobsMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function showFormMessage(text, type = '') {
    const el = $('jobFormMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function formatType(type) {
    return ({
      full_time: 'Full Time',
      part_time: 'Part Time',
      contract: 'Contract',
      internship: 'Internship'
    })[type] || type || '';
  }

  function formatDate(value) {
    if (!value) return '—';
    const parts = String(value).split('-');
    if (parts.length !== 3) return value;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  function statusLabel(status) {
    return String(status || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function statusClass(status) {
    return 'status-' + String(status || 'draft').replace(/[^a-z_]/g, '');
  }

  function updateSummary() {
    // Normalize status values so dashboard counts remain correct if the API returns mixed casing or whitespace.
    const countByStatus = (status) => jobs.filter(job =>
      String(job.status || '').trim().toLowerCase() === status
    ).length;

    $('totalJobs').textContent = jobs.length;
    $('draftJobs').textContent = countByStatus('draft');
    $('activeJobs').textContent = countByStatus('active');
    $('publishedJobs').textContent = countByStatus('published');
    $('pausedJobs').textContent = countByStatus('paused');
    $('closedJobs').textContent = countByStatus('closed');
  }

  function filteredJobs() {
    const search = $('jobSearch').value.trim().toLowerCase();
    const status = $('statusFilter').value;
    const location = $('locationFilter')?.value || '';
    const client = $('clientFilter')?.value || '';
    return jobs.filter(job => {
      const matchesSearch = !search || [
        job.job_code, job.title, job.location, job.experience, job.client_name
      ].some(v => String(v || '').toLowerCase().includes(search));
      const matchesLocation = !location || job.location_id === location;
      const matchesClient = !client || job.client_id === client;
      return matchesSearch && (!status || job.status === status) && matchesLocation && matchesClient;
    });
  }

  function renderJobs() {
    const body = $('jobsTableBody');
    const empty = $('emptyJobs');
    const rows = filteredJobs();

    body.innerHTML = rows.length ? rows.map(job => {
      const selected = String(selectedRequirementId) === String(job.id) ? ' requirement-row-selected' : '';
      return `
      <tr class="requirement-row${selected}" data-requirement-row-id="${escapeHtml(job.id)}">
        <td>
          <div class="job-title-cell">
            <strong>${escapeHtml(job.title)}</strong>
          </div>
        </td>
        <td>${escapeHtml(job.job_category_name || '—')}</td>
        <td>${escapeHtml(job.client_name || '—')}</td>
        <td>${escapeHtml(job.location || '—')}</td>
        <td>${escapeHtml(job.skill_level || '—')}</td>
        <td>${escapeHtml(job.salary_budget || '—')}</td>
        <td>${escapeHtml(job.experience || '—')}</td>
        <td>${escapeHtml(formatDate(job.job_open_date))}</td>
        <td>${escapeHtml(job.number_of_positions == null || job.number_of_positions === '' ? '—' : String(job.number_of_positions))}</td>
        <td><span class="status-pill ${statusClass(job.status)}">${escapeHtml(statusLabel(job.status))}</span></td>
      </tr>
    `;
    }).join('') : `
      <tr class="empty-row">
        <td colspan="10">
          <span class="empty-row-title">No requirements found</span>
          <span class="empty-row-text">Use “Add Requirement” to create the first career opportunity.</span>
        </td>
      </tr>`;

    empty.classList.add('hidden');
    body.parentElement.classList.remove('hidden');
    updateSummary();
  }

  function selectRequirementRow(requirementId) {
    selectedRequirementId = requirementId || '';
    document.querySelectorAll('.jobs-table tbody tr.requirement-row').forEach(row => {
      row.classList.toggle('requirement-row-selected', String(row.dataset.requirementRowId) === String(selectedRequirementId));
    });
  }

  function hideRequirementRowContextMenu() {
    const menu = $('requirementRowContextMenu');
    if (!menu) return;
    menu.classList.add('hidden');
  }

  function openRequirementRowContextMenu(requirementId, x, y) {
    const menu = $('requirementRowContextMenu');
    const job = jobs.find(item => String(item.id) === String(requirementId));
    if (!menu || !job) return;
    selectRequirementRow(requirementId);
    const title = $('requirementRowContextMenuTitle');
    if (title) title.textContent = job.title ? `Requirement Actions — ${job.title}` : 'Requirement Actions';
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  async function handleRequirementContextAction(action) {
    const id = selectedRequirementId;
    if (!id) return;
    hideRequirementRowContextMenu();
    try {
      if (action === 'candidates-multiple') { openMultiRequirementCandidatesModal(id); return; }
      if (action === 'candidates') {
        window.location.href = `profiles.html?requirement=${encodeURIComponent(id)}`;
        return;
      }
      if (action === 'view') {
        const job = await loadJobDetails(id);
        openModal(job, 'view');
        return;
      }
      if (action === 'edit') {
        const job = await loadJobDetails(id);
        openModal(job);
        return;
      }
      if (action === 'delete') {
        const job = jobs.find(item => String(item.id) === String(id));
        openDeleteModal(id, job?.title || 'this requirement');
      }
    } catch (error) {
      showMessage(`Could not complete the selected action: ${error.message || error}`, 'error');
    }
  }

  function closeMultiRequirementCandidatesModal() {
    const modal = $('multiRequirementCandidatesModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function getMultiCandidateSelectedStatuses() {
    const menu = $('multiCandidatesStatusMenu');
    if (!menu) return [];
    const all = menu.querySelector('[data-multi-status-all]');
    if (all?.checked) return [];
    return [...menu.querySelectorAll('[data-multi-status]:checked')].map(input => input.value);
  }

  function syncMultiCandidateStatusFilter() {
    const menu = $('multiCandidatesStatusMenu');
    const caption = $('multiCandidatesStatusCaption');
    if (!menu || !caption) return;
    const all = menu.querySelector('[data-multi-status-all]');
    const options = [...menu.querySelectorAll('[data-multi-status]')];
    const checked = options.filter(input => input.checked);
    if (!checked.length || checked.length === options.length) {
      if (all) all.checked = true;
      options.forEach(input => { input.checked = false; });
      caption.textContent = 'All Statuses';
    } else {
      if (all) all.checked = false;
      caption.textContent = checked.length === 1 ? checked[0].parentElement.textContent.trim() : `${checked.length} statuses selected`;
    }
  }

  function renderMultiRequirementCandidatesList() {
    const clientId = $('multiCandidatesClientSelect')?.value || '';
    const list = $('multiCandidatesRequirementList');
    const message = $('multiCandidatesMessage');
    const statuses = getMultiCandidateSelectedStatuses();
    if (!list) return;
    const rows = jobs.filter(job => String(job.client_id || '') === String(clientId) && (!statuses.length || statuses.includes(String(job.status || '').toLowerCase())));
    // A filter change invalidates selections for requirements that are no longer visible.
    // Prune first, then render from the updated selection set so stale checked states cannot reappear.
    const visibleIds = new Set(rows.map(job => String(job.id)));
    multiCandidateSelectedIds = new Set([...multiCandidateSelectedIds].filter(id => visibleIds.has(String(id))));
    const selected = multiCandidateSelectedIds;
    list.innerHTML = rows.length ? rows.map(job => `
      <label class="mrc-option"><input type="checkbox" data-multi-requirement-id="${escapeHtml(job.id)}" ${selected.has(String(job.id)) ? 'checked' : ''}>
      <span><strong>${escapeHtml(job.title || 'Requirement')}</strong><small>${escapeHtml(job.job_code || '')}${job.location ? ` · ${escapeHtml(job.location)}` : ''}</small></span></label>`).join('') : '<div class="mrc-empty">No requirements found for this client.</div>';
    if (message) message.textContent = rows.length ? `${rows.length} requirement(s) available. Select one or more.` : (clientId ? 'No requirements match the selected client and status.' : 'Select a client to view requirements.');
    const selectAll = $('multiCandidatesSelectAll');
    if (selectAll) { selectAll.checked = rows.length > 0 && rows.every(job => selected.has(String(job.id))); selectAll.disabled = !rows.length; }
  }

  function openMultiRequirementCandidatesModal(preselectedId = '') {
    const modal = $('multiRequirementCandidatesModal');
    const clientSelect = $('multiCandidatesClientSelect');
    if (!modal || !clientSelect) return;
    multiCandidateSelectedIds = new Set();
    const preselected = jobs.find(job => String(job.id) === String(preselectedId));
    clientSelect.innerHTML = '<option value="">Select Client</option>' + clients.map(client => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.client_name)}</option>`).join('');
    clientSelect.value = preselected?.client_id ? String(preselected.client_id) : '';
    const statusMenu = $('multiCandidatesStatusMenu');
    if (statusMenu) { statusMenu.hidden = true; statusMenu.querySelectorAll('[data-multi-status]').forEach(input => { input.checked = false; }); const allStatus = statusMenu.querySelector('[data-multi-status-all]'); if (allStatus) allStatus.checked = true; }
    syncMultiCandidateStatusFilter();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    if (preselectedId && preselected) multiCandidateSelectedIds.add(String(preselectedId));
    renderMultiRequirementCandidatesList();
  }

  async function loadMasterData() {
    const [clientResult, categoryResult, locationResult] = await Promise.all([
      supabase.from('clients').select('id, client_code, client_name, is_active, display_order').eq('is_active', true).order('display_order').order('client_name'),
      supabase.from('job_categories').select('id, category_code, category_name, is_active, display_order').eq('is_active', true).order('display_order').order('category_name'),
      supabase.from('locations').select('id, location_name, is_active, display_order').order('display_order').order('location_name')
    ]);
    if (clientResult.error) throw clientResult.error;
    if (categoryResult.error) throw categoryResult.error;
    if (locationResult.error) throw locationResult.error;
    clients = clientResult.data || [];
    jobCategories = categoryResult.data || [];
    locations = locationResult.data || [];
    populateMasterSelects();
  }

  function populateMasterSelects() {
    const clientSelect = $('clientName');
    const categorySelect = $('jobCategory');
    const locationSelect = $('jobLocation');
    if (!clientSelect || !categorySelect || !locationSelect) return;

    clientSelect.innerHTML = '<option value="">Select Client</option>' + clients.map(client =>
      `<option value="${escapeHtml(client.id)}">${escapeHtml(client.client_name)} (${escapeHtml(client.client_code)})</option>`
    ).join('');

    const listClientFilter = $('clientFilter');
    if (listClientFilter) {
      listClientFilter.innerHTML = '<option value="">All Clients</option>' + clients.map(client =>
        `<option value="${escapeHtml(client.id)}">${escapeHtml(client.client_name)}</option>`
      ).join('');
    }

    categorySelect.innerHTML = '<option value="">Select Category</option>' + jobCategories.map(category =>
      `<option value="${escapeHtml(category.id)}">${escapeHtml(category.category_name)} (${escapeHtml(category.category_code)})</option>`
    ).join('');

    locationSelect.innerHTML = '<option value="">Select Location</option>' + locations.map(location =>
      `<option value="${escapeHtml(location.id)}" ${location.is_active ? '' : 'disabled'}>${escapeHtml(location.location_name)}${location.is_active ? '' : ' (Inactive)'}</option>`
    ).join('');

    const listLocationFilter = $('locationFilter');
    if (listLocationFilter) {
      listLocationFilter.innerHTML = '<option value="">All Locations</option>' + locations.filter(location => location.is_active).map(location =>
        `<option value="${escapeHtml(location.id)}">${escapeHtml(location.location_name)}</option>`
      ).join('');
    }
  }

  function updateJobCodePreview() {
    const client = clients.find(item => item.id === $('clientName').value);
    const category = jobCategories.find(item => item.id === $('jobCategory').value);
    const openDate = $('jobOpenDate').value;
    const codeField = $('jobCode');

    if (!codeField) return;

    if (client && category && openDate) {
      const compactDate = openDate.replace(/-/g, '');
      codeField.value = `${client.client_code.toUpperCase()}-${category.category_code.toUpperCase()}-${compactDate}-XXXX`;
    } else if (!$('jobId').value) {
      codeField.value = '';
    }
  }

  async function loadJobs() {
    showMessage('Loading jobs…', '');
    try {
      const [jobResult, metadataResult] = await Promise.all([
        supabase
          .from('jobs')
          .select('*, clients:client_id(client_name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('job_admin_metadata')
          .select('job_id, client_name')
      ]);
      if (jobResult.error) throw jobResult.error;
      if (metadataResult.error) throw metadataResult.error;

      const metadataByJob = Object.fromEntries(
        (metadataResult.data || []).map(item => [item.job_id, item])
      );

      jobs = (jobResult.data || []).map(job => {
        const category = jobCategories.find(item => String(item.id) === String(job.job_category_id));
        return {
          ...job,
          job_category_name: job.job_category || category?.category_name || '—',
          client_name:
            job.clients?.client_name ||
            metadataByJob[job.id]?.client_name ||
            ''
        };
      });
      renderJobs();
      showMessage(jobs.length ? '' : 'No requirements have been created yet.', '');
    } catch (error) {
      console.error(error);
      showMessage(`Could not load requirements: ${error.message || error}`, 'error');
    }
  }

  function clearList(type) {
    const map = {
      responsibilities: 'responsibilitiesList',
      requirements: 'requirementsList',
      qualifications: 'qualificationsList'
    };
    $(map[type]).innerHTML = '';
  }

  function addListItem(type, value = '') {
    const map = {
      responsibilities: 'responsibilitiesList',
      requirements: 'requirementsList',
      qualifications: 'qualificationsList'
    };
    const list = $(map[type]);
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML = `
      <input type="text" class="repeat-input" data-list-type="${type}" maxlength="500" value="${escapeHtml(value)}"
             placeholder="${type === 'requirements' ? 'Enter a requirement' : type === 'responsibilities' ? 'Enter a key responsibility' : 'Enter a preferred qualification'}">
      <button type="button" class="remove-item" aria-label="Remove item"><i class="fa-solid fa-xmark"></i></button>
    `;
    row.querySelector('.remove-item').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  function getListValues(type) {
    const map = {
      responsibilities: 'responsibilitiesList',
      requirements: 'requirementsList',
      qualifications: 'qualificationsList'
    };
    return [...$(map[type]).querySelectorAll('.repeat-input')]
      .map(input => input.value.trim())
      .filter(Boolean);
  }

  let jobFormDirty = false;

  function markJobFormDirty() {
    jobFormDirty = true;
  }

  function resetForm() {
    jobFormDirty = false;
    $('jobForm').reset();
    $('jobId').value = '';
    $('clientName').value = '';
    $('jobCategory').value = '';
    $('jobOpenDate').value = '';
    $('jobCode').value = '';
    $('numberOfPositions').value = '';
    $('skillLevel').value = '';
    $('jobStatus').value = 'draft';
    clearList('responsibilities');
    clearList('requirements');
    clearList('qualifications');
    renderJDState(null);
    showFormMessage('');
  }

  function setViewMode(enabled) {
    viewMode = enabled;
    const modal = $('jobModal');
    const form = $('jobForm');
    modal.classList.toggle('view-mode', enabled);
    form.classList.toggle('view-mode', enabled);

    form.querySelectorAll('input, select, textarea').forEach(control => {
      if (control.id === 'jobId') return;
      control.disabled = enabled;
    });

    form.querySelectorAll('[data-add-list], .remove-item').forEach(control => {
      control.classList.toggle('hidden', enabled);
      control.disabled = enabled;
    });

    $('saveJobButton').classList.toggle('hidden', enabled);
    $('cancelJobButton').textContent = enabled ? 'Close' : 'Cancel';
    $('jobModalTitle').textContent = enabled ? 'View Requirement' : ($('jobId').value ? 'Edit Requirement' : 'Add New Requirement');
    $('jdUploadControls').classList.toggle('hidden', enabled);
    $('removeJDButton').classList.toggle('hidden', enabled || !currentJD);
  }

  function openModal(job = null, mode = 'edit') {
    resetForm();
    setViewMode(false);

    if (job) {
      $('jobModalTitle').textContent = 'Edit Requirement';
      $('jobId').value = job.id;
      $('jobCode').value = job.job_code || '';
      $('clientName').value = job.client_id || '';
      $('jobCategory').value = job.job_category_id || '';
      $('jobOpenDate').value = job.job_open_date || '';
      $('skillLevel').value = job.skill_level || '';
      $('jobTitle').value = job.title || '';
      $('numberOfPositions').value = job.number_of_positions == null ? '' : String(job.number_of_positions);
      const matchedLocation = locations.find(item => item.id === job.location_id) ||
        locations.find(item => String(item.location_name || '').trim().toLowerCase() === String(job.location || '').trim().toLowerCase());
      $('jobLocation').value = matchedLocation ? matchedLocation.id : '';
      $('employmentType').value = job.employment_type || 'full_time';
      $('jobExperience').value = job.experience || '';
      $('jobStatus').value = job.status || 'draft';
      $('salaryRange').value = job.salary_budget || '';
      $('closingDate').value = job.closing_date || '';
      $('shortDescription').value = job.short_description || '';
      $('detailedDescription').value = job.detailed_description || '';
      (job.job_responsibilities || []).forEach(x => addListItem('responsibilities', x.responsibility));
      (job.job_requirements || []).forEach(x => addListItem('requirements', x.requirement));
      (job.job_qualifications || []).forEach(x => addListItem('qualifications', x.qualification));
      renderJDState(job);
    } else {
      $('jobModalTitle').textContent = 'Add New Requirement';
      addListItem('responsibilities');
      addListItem('requirements');
      addListItem('qualifications');
    }

    if (mode === 'view') {
      setViewMode(true);
    }

    $('jobModal').classList.remove('hidden');
    $('jobModal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    if (mode !== 'view') {
      if (job) {
        $('jobTitle').focus();
      } else {
        $('clientName').focus();
      }
    }
  }

  let pendingCloseAfterDiscard = false;

  function showDiscardChangesModal() {
    const modal = $('discardChangesModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function hideDiscardChangesModal() {
    const modal = $('discardChangesModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function closeModal(force = false) {
    if (!force && jobFormDirty) {
      pendingCloseAfterDiscard = true;
      showDiscardChangesModal();
      return false;
    }

    pendingCloseAfterDiscard = false;
    hideDiscardChangesModal();
    jobFormDirty = false;
    setViewMode(false);
    $('jobModal').classList.add('hidden');
    $('jobModal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    return true;
  }

  async function loadJobDetails(id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return null;

    const [requirements, responsibilities, qualifications, metadata] = await Promise.all([
      supabase.from('job_requirements').select('*').eq('job_id', id).order('display_order'),
      supabase.from('job_responsibilities').select('*').eq('job_id', id).order('display_order'),
      supabase.from('job_qualifications').select('*').eq('job_id', id).order('display_order'),
      supabase.from('job_admin_metadata').select('*').eq('job_id', id).maybeSingle()
    ]);

    if (requirements.error) throw requirements.error;
    if (responsibilities.error) throw responsibilities.error;
    if (qualifications.error) throw qualifications.error;
    if (metadata.error) throw metadata.error;

    return {
      ...job,
      job_requirements: requirements.data || [],
      job_responsibilities: responsibilities.data || [],
      job_qualifications: qualifications.data || [],
      job_admin_metadata: metadata.data || null
    };
  }

  async function saveList(table, jobId, column, values) {
    const { error: deleteError } = await supabase.from(table).delete().eq('job_id', jobId);
    if (deleteError) throw deleteError;

    if (!values.length) return;
    const rows = values.map((value, index) => ({
      job_id: jobId,
      [column]: value,
      display_order: index
    }));
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw error;
  }

  async function saveJob(event) {
    event.preventDefault();
    if (saving) return;

    const jobId = $('jobId').value;
    const clientId = $('clientName').value;
    const categoryId = $('jobCategory').value;
    const jobOpenDate = $('jobOpenDate').value;
    const title = $('jobTitle').value.trim();
    const positionsRaw = $('numberOfPositions').value.trim();
    const numberOfPositions = positionsRaw === '' ? null : Number(positionsRaw);
    const locationId = $('jobLocation').value;
    const selectedLocation = locations.find(item => item.id === locationId);
    const location = selectedLocation ? selectedLocation.location_name : '';
    const employmentType = $('employmentType').value;
    const experience = $('jobExperience').value.trim();
    const skillLevel = $('skillLevel').value.trim() || null;
    const status = $('jobStatus').value;
    const salaryRange = $('salaryRange').value.trim() || null;
    const closingDate = $('closingDate').value || null;
    const shortDescription = $('shortDescription').value.trim() || null;
    const detailedDescription = $('detailedDescription').value.trim() || null;

    if (!clientId || !categoryId || !locationId || !jobOpenDate || !title || !location || !experience) {
      showFormMessage('Please complete all required fields.', 'error');
      return;
    }
    if (numberOfPositions !== null && (!Number.isInteger(numberOfPositions) || numberOfPositions < 1)) {
      showFormMessage('Number of Positions must be a whole number greater than zero.', 'error');
      $('numberOfPositions').focus();
      return;
    }

    saving = true;
    const button = $('saveJobButton');
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    showFormMessage('Saving requirement…');

    try {
      let savedJob;

      if (jobId) {
        // Job Code is permanent after creation and is intentionally not editable.
        const payload = {
          title,
          number_of_positions: numberOfPositions,
          location,
          location_id: locationId,
          employment_type: employmentType,
          experience,
          short_description: shortDescription,
          detailed_description: detailedDescription,
          status,
          salary_budget: salaryRange,
          closing_date: closingDate,
          job_open_date: jobOpenDate,
          skill_level: skillLevel,
          client_id: clientId,
          job_category_id: categoryId
        };

        const { data, error } = await supabase.from('jobs')
          .update(payload)
          .eq('id', jobId)
          .select('*')
          .single();
        if (error) throw error;
        savedJob = data;

        const client = clients.find(item => item.id === clientId);
        const category = jobCategories.find(item => item.id === categoryId);
        const { error: metadataError } = await supabase.from('job_admin_metadata').upsert({
          job_id: savedJob.id,
          client_name: client ? client.client_name : null,
          job_category: category ? category.category_name : null
        }, { onConflict: 'job_id' });
        if (metadataError) throw metadataError;
      } else {
        const { data, error } = await supabase.rpc('create_careers_job', {
          p_client_id: clientId,
          p_job_category_id: categoryId,
          p_location_id: locationId,
          p_job_open_date: jobOpenDate,
          p_skill_level: skillLevel,
          p_title: title,
          p_location: location,
          p_employment_type: employmentType,
          p_experience: experience,
          p_short_description: shortDescription,
          p_detailed_description: detailedDescription,
          p_closing_date: closingDate,
          p_status: status
        });
        if (error) throw error;
        savedJob = Array.isArray(data) ? data[0] : data;

        // Salary Range is stored in the existing jobs.salary_budget field.
        const { data: salaryUpdatedJob, error: salaryError } = await supabase.from('jobs')
          .update({ salary_budget: salaryRange })
          .eq('id', savedJob.id)
          .select('*')
          .single();
        if (salaryError) throw salaryError;
        savedJob = salaryUpdatedJob;

        // Keep the position count informational and independent of vacancy/status logic.
        const { data: positionsUpdatedJob, error: positionsError } = await supabase.from('jobs')
          .update({ number_of_positions: numberOfPositions })
          .eq('id', savedJob.id)
          .select('*')
          .single();
        if (positionsError) throw positionsError;
        savedJob = positionsUpdatedJob;
      }

      await Promise.all([
        saveList('job_responsibilities', savedJob.id, 'responsibility', getListValues('responsibilities')),
        saveList('job_requirements', savedJob.id, 'requirement', getListValues('requirements')),
        saveList('job_qualifications', savedJob.id, 'qualification', getListValues('qualifications'))
      ]);

      $('jobId').value = savedJob.id;
      const jdFile = $('jdFileInput').files && $('jdFileInput').files[0];
      if (jdFile) {
        showFormMessage('Requirement saved. Uploading JD document…');
        await requirementDocumentAction('upload', jdFile);
      }

      jobFormDirty = false;
      closeModal(true);
      showMessage(jobId
        ? 'Job updated successfully.'
        : `Job created successfully. Job Code: ${savedJob.job_code}`, 'success');
      await loadJobs();
    } catch (error) {
      console.error(error);
      showFormMessage(`Could not save requirement: ${error.message || error}`, 'error');
    } finally {
      saving = false;
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Requirement';
    }
  }

  function openDeleteModal(id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    deleteJobId = id;
    $('deleteText').textContent =
      `“${job.title}” (${job.job_code}) and its requirements, responsibilities and qualifications will be permanently removed.`;
    $('deleteModal').classList.remove('hidden');
    $('deleteModal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeDeleteModal() {
    deleteJobId = null;
    $('deleteModal').classList.add('hidden');
    $('deleteModal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function deleteJob() {
    if (!deleteJobId) return;
    const button = $('confirmDeleteButton');
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';

    try {
      const { error } = await supabase.from('jobs').delete().eq('id', deleteJobId);
      if (error) throw error;
      closeDeleteModal();
      showMessage('Requirement deleted successfully.', 'success');
      await loadJobs();
    } catch (error) {
      console.error(error);
      showMessage(`Could not delete requirement: ${error.message || error}`, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-trash"></i> Delete Requirement';
    }
  }

  function bindEvents() {
    $('addJobButton').addEventListener('click', () => openModal());
    $('closeJobModal').addEventListener('click', () => closeModal());
    $('cancelJobButton').addEventListener('click', () => closeModal());
    $('cancelDiscardChangesButton').addEventListener('click', () => {
      pendingCloseAfterDiscard = false;
      hideDiscardChangesModal();
      document.body.classList.add('modal-open');
    });
    $('confirmDiscardChangesButton').addEventListener('click', () => {
      hideDiscardChangesModal();
      if (pendingCloseAfterDiscard) closeModal(true);
      else document.body.classList.add('modal-open');
    });
    $('discardChangesModal').addEventListener('click', (event) => {
      if (event.target === $('discardChangesModal')) {
        pendingCloseAfterDiscard = false;
        hideDiscardChangesModal();
        document.body.classList.add('modal-open');
      }
    });
    $('jobForm').addEventListener('submit', saveJob);
    $('jobForm').addEventListener('input', markJobFormDirty);
    $('jobForm').addEventListener('change', markJobFormDirty);
    $('jdFileInput').addEventListener('change', () => {
      const file = $('jdFileInput').files && $('jdFileInput').files[0];
      $('jdSelectedFileName').textContent = file ? `${file.name} (${formatFileSize(file.size)})` : 'No file selected';
      $('clearJDSelectionButton').classList.toggle('hidden', !file);
      if (file && (file.size <= 0 || file.size > 5 * 1024 * 1024)) {
        showFormMessage('JD document must be between 1 byte and 5 MB.', 'error');
        $('jdFileInput').value = '';
        $('jdSelectedFileName').textContent = 'No file selected';
        $('clearJDSelectionButton').classList.add('hidden');
        return;
      }
      if (file && !/\.(pdf|doc|docx)$/i.test(file.name)) {
        showFormMessage('JD document must be a PDF, DOC or DOCX file.', 'error');
        $('jdFileInput').value = '';
        $('jdSelectedFileName').textContent = 'No file selected';
        $('clearJDSelectionButton').classList.add('hidden');
      }
    });
    $('clearJDSelectionButton').addEventListener('click', () => {
      $('jdFileInput').value = '';
      $('jdSelectedFileName').textContent = 'No file selected';
      $('clearJDSelectionButton').classList.add('hidden');
    });
    $('viewJDButton').addEventListener('click', viewRequirementJD);
    $('downloadJDButton').addEventListener('click', downloadRequirementJD);
    $('closeJDButton').addEventListener('click', closeJDViewer);
    $('removeJDButton').addEventListener('click', removeRequirementJD);
    $('jobForm').addEventListener('click', (event) => {
      if (event.target.closest('[data-add-list], .remove-item')) markJobFormDirty();
    });

    $('clientName').addEventListener('change', updateJobCodePreview);
    $('jobCategory').addEventListener('change', updateJobCodePreview);
    $('jobOpenDate').addEventListener('change', updateJobCodePreview);

    const clearFiltersButton = $('clearFiltersButton');
    if (clearFiltersButton) {
      clearFiltersButton.addEventListener('click', () => {
        $('jobSearch').value = '';
        $('statusFilter').value = '';
        if ($('locationFilter')) $('locationFilter').value = '';
        if ($('clientFilter')) $('clientFilter').value = '';
        renderJobs();
      });
    }

    const exportJobsButton = $('exportJobsButton');
    if (exportJobsButton) {
      exportJobsButton.addEventListener('click', () => {
        const rows = filteredJobs();
        const headers = ['Requirements','Category','Client','Location','Skill Level','Salary Range','Experience','Open Date','Positions','Status'];
        const csvRows = [headers, ...rows.map(job => [
          job.title || '', job.job_category_name || '', job.client_name || '', job.location || '', job.skill_level || '',
          job.salary_budget || '', job.experience || '', formatDate(job.job_open_date),
          job.number_of_positions == null ? '' : job.number_of_positions, statusLabel(job.status)
        ])];
        const csv = csvRows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'navodix-resource-requirements.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
    }

    $('jobSearch').addEventListener('input', renderJobs);
    $('statusFilter').addEventListener('change', renderJobs);
    $('locationFilter').addEventListener('change', renderJobs);
    $('clientFilter').addEventListener('change', renderJobs);
    $('refreshJobsButton').addEventListener('click', loadJobs);

    $('jobsTableBody').addEventListener('click', (event) => {
      const row = event.target.closest('tr.requirement-row');
      if (!row) return;
      selectRequirementRow(row.dataset.requirementRowId);
    });

    $('jobsTableBody').addEventListener('dblclick', async (event) => {
      const row = event.target.closest('tr.requirement-row');
      if (!row) return;
      selectRequirementRow(row.dataset.requirementRowId);
      hideRequirementRowContextMenu();
      await handleRequirementContextAction('view');
    });

    $('jobsTableBody').addEventListener('contextmenu', (event) => {
      const row = event.target.closest('tr.requirement-row');
      if (!row) return;
      event.preventDefault();
      openRequirementRowContextMenu(row.dataset.requirementRowId, event.clientX, event.clientY);
    });

    $('requirementRowContextMenu').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-context-action]');
      if (!button) return;
      await handleRequirementContextAction(button.dataset.contextAction);
    });

    document.addEventListener('click', (event) => {
      const menu = $('requirementRowContextMenu');
      if (menu && !menu.contains(event.target)) hideRequirementRowContextMenu();
    });

    window.addEventListener('resize', hideRequirementRowContextMenu);
    window.addEventListener('scroll', hideRequirementRowContextMenu, true);

    document.querySelectorAll('[data-add-list]').forEach(button => {
      button.addEventListener('click', () => addListItem(button.dataset.addList));
    });

    $('multiCandidatesClose')?.addEventListener('click', closeMultiRequirementCandidatesModal);
    $('multiCandidatesCancel')?.addEventListener('click', closeMultiRequirementCandidatesModal);
    $('multiCandidatesClientSelect')?.addEventListener('change', () => { multiCandidateSelectedIds = new Set(); renderMultiRequirementCandidatesList(); });
    $('multiCandidatesStatusTrigger')?.addEventListener('click', () => { const menu = $('multiCandidatesStatusMenu'); if (!menu) return; menu.hidden = !menu.hidden; $('multiCandidatesStatusTrigger').setAttribute('aria-expanded', String(!menu.hidden)); });
    $('multiCandidatesStatusMenu')?.addEventListener('change', event => {
      const menu = $('multiCandidatesStatusMenu');
      const all = menu?.querySelector('[data-multi-status-all]');
      const options = [...(menu?.querySelectorAll('[data-multi-status]') || [])];
      if (event.target.matches('[data-multi-status-all]')) { options.forEach(input => { input.checked = false; }); }
      else if (event.target.matches('[data-multi-status]')) { if (all) all.checked = false; }
      syncMultiCandidateStatusFilter();
      renderMultiRequirementCandidatesList();
    });
    document.addEventListener('click', event => { const wrap = document.querySelector('#multiRequirementCandidatesModal .mrc-status-wrap'); const menu = $('multiCandidatesStatusMenu'); const trigger = $('multiCandidatesStatusTrigger'); if (wrap && menu && !wrap.contains(event.target)) { menu.hidden = true; trigger?.setAttribute('aria-expanded', 'false'); } });
    $('multiCandidatesRequirementList')?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-multi-requirement-id]'); if (!checkbox) return;
      const id = String(checkbox.dataset.multiRequirementId);
      if (checkbox.checked) multiCandidateSelectedIds.add(id); else multiCandidateSelectedIds.delete(id);
      renderMultiRequirementCandidatesList();
    });
    $('multiCandidatesSelectAll')?.addEventListener('change', (event) => {
      const clientId = $('multiCandidatesClientSelect')?.value || '';
      const statuses = getMultiCandidateSelectedStatuses();
      jobs.filter(job => String(job.client_id || '') === String(clientId) && (!statuses.length || statuses.includes(String(job.status || '').toLowerCase()))).forEach(job => {
        if (event.target.checked) multiCandidateSelectedIds.add(String(job.id)); else multiCandidateSelectedIds.delete(String(job.id));
      });
      renderMultiRequirementCandidatesList();
    });
    $('multiCandidatesContinue')?.addEventListener('click', () => {
      const ids = [...multiCandidateSelectedIds];
      const message = $('multiCandidatesMessage');
      if (!ids.length) { if (message) message.textContent = 'No Requirement selected'; return; }
      window.location.href = `profiles.html?requirements=${encodeURIComponent(ids.join(','))}`;
    });
    $('multiRequirementCandidatesModal')?.addEventListener('click', event => { if (event.target === $('multiRequirementCandidatesModal')) closeMultiRequirementCandidatesModal(); });
    $('cancelDeleteButton').addEventListener('click', closeDeleteModal);
    $('confirmDeleteButton').addEventListener('click', deleteJob);

    // Intentionally do not close the Job form when the backdrop is clicked.
    // Long forms should never lose entered data because of an accidental outside click.
    $('jobModal').addEventListener('click', (event) => {
      if (event.target === $('jobModal')) return;
    });
    $('deleteModal').addEventListener('click', (event) => {
      if (event.target === $('deleteModal')) closeDeleteModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('jobModal').classList.contains('hidden')) closeModal();
      if (!$('deleteModal').classList.contains('hidden')) closeDeleteModal();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();

    // auth.js already protects this page. The small delay allows its session guard
    // to complete before querying RLS-protected job data.
    const allowed = await window.navodixAdminReady;
    if (allowed === false) return;
    try {
      await loadMasterData();
      await loadJobs();
    } catch (error) {
      console.error(error);
      showMessage(`Could not load job setup data: ${error.message || error}`, 'error');
    }
  });

  window.navodixJobs = { loadJobs, openModal };
})();
