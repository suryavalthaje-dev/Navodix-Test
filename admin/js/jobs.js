(function () {
  'use strict';

  const supabase = window.navodixSupabase;
  let jobs = [];
  let deleteJobId = null;
  let saving = false;
  let viewMode = false;
  let selectedJDFile = null;
  let existingJDFile = null;
  let jdRemoveRequested = false;
  let clients = [];
  let jobCategories = [];
  let locations = [];
  let currentPage = 1;
  const PAGE_SIZE = 20;

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

  async function callRequirementDocumentFunction(formData) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Your session has expired. Please sign in again.');

    const response = await fetch(
      window.NAVODIX_SUPABASE_URL + '/functions/v1/requirement-documents',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
        body: formData
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || payload.message || 'Requirement document operation failed.');
    }
    return payload;
  }

  async function getRequirementJDSignedUrl(jobId, action = 'view-url') {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('job_id', jobId);
    const payload = await callRequirementDocumentFunction(fd);
    const url = payload.signed_url || payload.signedUrl;
    if (!url) throw new Error('The Requirement Documents service did not return a secure JD URL.');
    return payload;
  }

  function closeRequirementJDViewer() {
    const viewer = $('jdInlineViewer');
    const frame = $('jdInlineFrame');
    const docxViewer = $('jdInlineDocxViewer');
    const loading = $('jdInlineLoading');
    const title = $('jdInlineViewerTitle');
    const closeTop = $('jdInlineCloseTopButton');
    if (frame) frame.src = '';
    if (docxViewer) docxViewer.innerHTML = '';
    if (frame) frame.classList.add('hidden');
    if (docxViewer) docxViewer.classList.add('hidden');
    if (loading) {
      loading.classList.remove('hidden');
      loading.textContent = 'Loading job description…';
    }
    if (title) title.textContent = 'Job Description';
    if (closeTop) closeTop.classList.add('hidden');
    if (viewer) viewer.classList.add('hidden');
  }

  async function viewRequirementJD() {
    const viewer = $('jdInlineViewer');
    const frame = $('jdInlineFrame');
    const docxViewer = $('jdInlineDocxViewer');
    const loading = $('jdInlineLoading');
    const closeTop = $('jdInlineCloseTopButton');
    if (!viewer || !frame || !docxViewer || !loading) {
      showFormMessage('JD viewer is not available.', 'error');
      return;
    }
    if (!existingJDFile || !existingJDFile.objectPath || !$('jobId').value) {
      showFormMessage('No JD document is stored for this requirement.', 'error');
      return;
    }

    try {
      showFormMessage('');
      viewer.classList.remove('hidden');
      frame.classList.add('hidden');
      docxViewer.classList.add('hidden');
      docxViewer.innerHTML = '';
      loading.classList.remove('hidden');
      loading.textContent = 'Loading job description…';
      if (closeTop) closeTop.classList.remove('hidden');

      const payload = await getRequirementJDSignedUrl($('jobId').value, 'view-url');
      const url = payload.signed_url;
      const fileName = String(existingJDFile.name || payload.file_name || '').toLowerCase();
      const isPdf = /\.pdf$/i.test(fileName);
      const isDocx = /\.docx$/i.test(fileName);

      if (isPdf) {
        frame.onload = () => {
          loading.classList.add('hidden');
          frame.classList.remove('hidden');
        };
        frame.src = url + '#toolbar=1&navpanes=0&view=FitH';
      } else if (isDocx) {
        if (typeof window.docx === 'undefined' || typeof window.docx.renderAsync !== 'function') {
          throw new Error('DOCX preview support is not available. Please refresh the page and try again.');
        }
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`JD request failed (HTTP ${response.status})`);
        const blob = await response.blob();
        await window.docx.renderAsync(blob, docxViewer, null, {
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true
        });
        docxViewer.classList.remove('hidden');
        loading.classList.add('hidden');
      } else {
        frame.onload = () => {
          loading.classList.add('hidden');
          frame.classList.remove('hidden');
        };
        loading.textContent = 'Preparing job description… If your browser cannot display this DOC file inline, use Download JD.';
        frame.src = url;
      }
    } catch (error) {
      closeRequirementJDViewer();
      showFormMessage(`Could not open the JD: ${error.message || error}`, 'error');
    }
  }

  async function openRequirementJDInNewTab() {
    if (!existingJDFile || !existingJDFile.objectPath || !$('jobId').value) {
      showFormMessage('No JD document is stored for this requirement.', 'error');
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      showFormMessage('Please allow pop-ups to open the JD in a new tab.', 'error');
      return;
    }

    try {
      const payload = await getRequirementJDSignedUrl($('jobId').value, 'view-url');
      const url = payload.signed_url;
      const fileName = String(existingJDFile.name || payload.file_name || "");
      const isDocx = /\.docx$/i.test(fileName);

      // PDF can be rendered natively by the browser. DOCX needs the same
      // client-side renderer used by the inline viewer.
      if (!isDocx) {
        popup.location.href = url;
        return;
      }

      const safeTitle = escapeHtml(fileName || 'Job Description');
      popup.document.open();
      popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html,body{margin:0;padding:0;background:#EEF2F7;color:#263B5A;font-family:Arial,sans-serif;}
    .bar{position:sticky;top:0;z-index:2;padding:12px 16px;background:#173F78;color:#fff;font-size:14px;font-weight:600;}
    .status{padding:14px 16px;text-align:center;color:#52647D;font-size:13px;}
    #docx{max-width:100%;min-height:calc(100vh - 46px);padding:24px;box-sizing:border-box;overflow:auto;}
    #docx .docx-wrapper{background:transparent!important;padding:0!important;}
    #docx .docx{margin:0 auto 18px!important;background:#fff!important;box-shadow:0 2px 10px rgba(0,0,0,.12);}
    #docx img{max-width:100%;}
    .error{color:#B42318;}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docx-preview@0.4.0/dist/docx-preview.min.js"></script>
</head>
<body>
  <div class="bar">${safeTitle}</div>
  <div id="status" class="status">Loading Job Description…</div>
  <div id="docx"></div>
  <script>
    (async function(){
      try {
        const response = await fetch(${JSON.stringify(url)}, { credentials: 'omit' });
        if (!response.ok) throw new Error('Unable to retrieve the document (HTTP ' + response.status + ').');
        const blob = await response.blob();
        if (!window.docx || typeof window.docx.renderAsync !== 'function') {
          throw new Error('DOCX preview library could not be loaded.');
        }
        await window.docx.renderAsync(blob, document.getElementById('docx'), null, {
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true
        });
        document.getElementById('status').remove();
      } catch (error) {
        const status = document.getElementById('status');
        status.textContent = 'Could not preview the DOCX: ' + (error.message || error);
        status.classList.add('error');
      }
    })();
  <\/script>
</body>
</html>`);
      popup.document.close();
    } catch (error) {
      try { popup.close(); } catch (_) {}
      showFormMessage(`Could not open the JD: ${error.message || error}`, 'error');
    }
  }

  async function downloadRequirementJD() {
    if (!existingJDFile || !existingJDFile.objectPath || !$('jobId').value) {
      showFormMessage('No JD document is stored for this requirement.', 'error');
      return;
    }
    try {
      const payload = await getRequirementJDSignedUrl($('jobId').value, 'download-url');
      const link = document.createElement('a');
      link.href = payload.signed_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showFormMessage(`Could not download the JD: ${error.message || error}`, 'error');
    }
  }

  function openRemoveJDConfirmation() {
    if (!existingJDFile && !selectedJDFile) return;
    const modal = $('removeJDModal');
    if (!modal) return;
    const fileName = existingJDFile?.name || selectedJDFile?.name || 'the selected Job Description';
    const text = $('removeJDText');
    if (text) {
      text.textContent = existingJDFile
        ? `“${fileName}” will be removed from this requirement. The change will take effect when you save the requirement.`
        : `The selected Job Description “${fileName}” will be cleared. No document will be uploaded when you save the requirement.`;
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeRemoveJDConfirmation() {
    const modal = $('removeJDModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    const otherOpen = document.querySelector('.modal-backdrop:not(.hidden)');
    if (!otherOpen) document.body.classList.remove('modal-open');
  }

  function confirmRemoveJD() {
    const jdFileInput = $('jdFile');
    selectedJDFile = null;
    if (jdFileInput) jdFileInput.value = '';
    if (existingJDFile) jdRemoveRequested = true;
    closeRequirementJDViewer();
    closeRemoveJDConfirmation();
    markJobFormDirty();
    renderJDState();
  }

  function resetJDState() {
    selectedJDFile = null;
    existingJDFile = null;
    jdRemoveRequested = false;
    const file = $('jdFile');
    const name = $('existingJDFileName');
    const remove = $('removeJDButton');
    const help = $('jdFileHelp');
    if (file) file.value = '';
    if (name) {
      name.textContent = '';
      name.title = '';
      name.classList.add('hidden');
    }
    if (remove) remove.classList.add('hidden');
    if ($('viewJDButton')) $('viewJDButton').classList.add('hidden');
    if ($('openJDNewTabButton')) $('openJDNewTabButton').classList.add('hidden');
    if ($('downloadJDButton')) $('downloadJDButton').classList.add('hidden');
    if ($('jdInlineCloseTopButton')) $('jdInlineCloseTopButton').classList.add('hidden');
    closeRequirementJDViewer();
    if (help) help.textContent = 'Optional. Maximum 5 MB. PDF, DOC or DOCX.';
  }

  function renderJDState() {
    const file = $('jdFile');
    const name = $('existingJDFileName');
    const remove = $('removeJDButton');
    const help = $('jdFileHelp');
    const view = $('viewJDButton');
    const open = $('openJDNewTabButton');
    const download = $('downloadJDButton');
    if (!file || !name || !remove || !help) return;

    if (selectedJDFile) {
      if (view) view.classList.add('hidden');
      if (open) open.classList.add('hidden');
      if (download) download.classList.add('hidden');
      closeRequirementJDViewer();
      name.textContent = selectedJDFile.name;
      name.title = selectedJDFile.name;
      name.classList.remove('hidden');
      remove.classList.add('hidden');
      help.textContent = `Selected: ${selectedJDFile.name} (${Math.ceil(selectedJDFile.size / 1024)} KB). It will be uploaded when the requirement is saved.`;
      return;
    }

    if (existingJDFile && !jdRemoveRequested) {
      name.textContent = existingJDFile.name || 'Existing JD document';
      name.title = existingJDFile.name || '';
      name.classList.remove('hidden');
      remove.classList.toggle('hidden', viewMode);
      if (view) view.classList.remove('hidden');
      if (open) open.classList.remove('hidden');
      if (download) download.classList.remove('hidden');
      help.textContent = viewMode
        ? 'JD document is available. Use View JD to preview it inline.'
        : 'An existing JD document is stored for this requirement. Select a new file to replace it.';
      return;
    }

    name.textContent = '';
    name.title = '';
    name.classList.add('hidden');
    remove.classList.add('hidden');
    if (view) view.classList.add('hidden');
    if (open) open.classList.add('hidden');
    if (download) download.classList.add('hidden');
    closeRequirementJDViewer();
    help.textContent = jdRemoveRequested
      ? 'The existing JD will be removed when you save this requirement.'
      : 'Optional. Maximum 5 MB. PDF, DOC or DOCX.';
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
    $('totalJobs').textContent = jobs.length;
    $('publishedJobs').textContent = jobs.filter(j => j.status === 'published').length;
    $('draftJobs').textContent = jobs.filter(j => j.status === 'draft').length;
    $('closedJobs').textContent = jobs.filter(j => j.status === 'closed').length;
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
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    body.innerHTML = pageRows.length ? pageRows.map(job => `
      <tr>
        <td>
          <div class="job-title-cell">
            <strong>${escapeHtml(job.title)}</strong>
          </div>
        </td>
        <td>${escapeHtml(job.number_of_positions ?? '—')}</td>
        <td>${escapeHtml(job.client_name || '—')}</td>
        <td>${escapeHtml(job.location || '—')}</td>
        <td>${escapeHtml(job.skill_level || '—')}</td>
        <td>${escapeHtml(job.salary_budget || '—')}</td>
        <td>${escapeHtml(job.experience || '—')}</td>
        <td><span class="status-pill ${statusClass(job.status)}">${escapeHtml(statusLabel(job.status))}</span></td>
        <td>${escapeHtml(formatDate(job.job_open_date))}</td>
        <td>
          <div class="row-actions">
            <button class="icon-button" type="button" data-action="candidates" data-id="${job.id}" title="Manage candidates for requirement" aria-label="Manage candidates for requirement">
              <i class="fa-solid fa-users"></i>
            </button>
            <button class="icon-button" type="button" data-action="view" data-id="${job.id}" title="View requirement" aria-label="View requirement">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="icon-button" type="button" data-action="edit" data-id="${job.id}" title="Edit requirement" aria-label="Edit requirement">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="icon-button danger-icon" type="button" data-action="delete" data-id="${job.id}" title="Delete requirement" aria-label="Delete requirement">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('') : `
      <tr class="empty-row">
        <td colspan="10">
          <span class="empty-row-title">No requirements found</span>
          <span class="empty-row-text">Use “Add New Requirement” to create the first career opportunity.</span>
        </td>
      </tr>`;

    const hasRows = pageRows.length > 0;
    empty.classList.add('hidden');
    body.parentElement.classList.remove('hidden');
    updateJobsPagination(rows.length, totalPages, start, pageRows.length);
    updateSummary();
  }

  function updateJobsPagination(total, totalPages, start, count) {
    const wrap = $('jobsPagination');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    $('jobsPageInfo').textContent = total ? `Showing ${start + 1}-${start + count} of ${total}` : 'Showing 0 of 0';
    $('jobsPageNumber').textContent = `Page ${currentPage} of ${totalPages}`;
    $('jobsFirst').disabled = currentPage <= 1;
    $('jobsPrev').disabled = currentPage <= 1;
    $('jobsNext').disabled = currentPage >= totalPages;
    $('jobsLast').disabled = currentPage >= totalPages;
  }

  function goToJobsPage(page) {
    const totalPages = Math.max(1, Math.ceil(filteredJobs().length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);
    renderJobs();
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

      jobs = (jobResult.data || []).map(job => ({
        ...job,
        client_name:
          job.clients?.client_name ||
          metadataByJob[job.id]?.client_name ||
          ''
      }));
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
    $('skillLevel').value = '';
    $('jobStatus').value = 'draft';
    clearList('responsibilities');
    clearList('requirements');
    clearList('qualifications');
    resetJDState();
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
    renderJDState();
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
      $('numberOfPositions').value = job.number_of_positions ?? '';
      existingJDFile = job.jd_file_name ? {
        name: job.jd_file_name,
        objectPath: job.jd_object_path || '',
        type: job.jd_file_type || '',
        size: job.jd_file_size || null,
        uploadedAt: job.jd_uploaded_at || null
      } : null;
      jdRemoveRequested = false;
      $('jobTitle').value = job.title || '';
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
    } else {
      $('jobModalTitle').textContent = 'Add New Requirement';
      addListItem('responsibilities');
      addListItem('requirements');
      addListItem('qualifications');
    }

    renderJDState();

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
    closeRequirementJDViewer();
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
    const locationId = $('jobLocation').value;
    const selectedLocation = locations.find(item => item.id === locationId);
    const location = selectedLocation ? selectedLocation.location_name : '';
    const employmentType = $('employmentType').value;
    const experience = $('jobExperience').value.trim();
    const skillLevel = $('skillLevel').value.trim() || null;
    const numberOfPositionsRaw = $('numberOfPositions').value.trim();
    const numberOfPositions = numberOfPositionsRaw ? Number(numberOfPositionsRaw) : null;
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
      showFormMessage('Number of Positions must be a whole number greater than 0.', 'error');
      return;
    }
    if (selectedJDFile && selectedJDFile.size > 5 * 1024 * 1024) {
      showFormMessage('JD document must not exceed 5 MB.', 'error');
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
          number_of_positions: numberOfPositions,
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
          .update({ salary_budget: salaryRange, number_of_positions: numberOfPositions })
          .eq('id', savedJob.id)
          .select('*')
          .single();
        if (salaryError) throw salaryError;
        savedJob = salaryUpdatedJob;
        $('jobId').value = savedJob.id;
      }

      await Promise.all([
        saveList('job_responsibilities', savedJob.id, 'responsibility', getListValues('responsibilities')),
        saveList('job_requirements', savedJob.id, 'requirement', getListValues('requirements')),
        saveList('job_qualifications', savedJob.id, 'qualification', getListValues('qualifications'))
      ]);

      if (selectedJDFile) {
        const fd = new FormData();
        fd.append('action', 'upload');
        fd.append('job_id', savedJob.id);
        fd.append('file', selectedJDFile);
        await callRequirementDocumentFunction(fd);
      } else if (jdRemoveRequested && existingJDFile?.objectPath) {
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('job_id', savedJob.id);
        await callRequirementDocumentFunction(fd);
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
    $('jobForm').addEventListener('click', (event) => {
      if (event.target.closest('[data-add-list], .remove-item')) markJobFormDirty();
    });

    const jdFileInput = $('jdFile');
    if (jdFileInput) {
      jdFileInput.addEventListener('change', () => {
        const file = jdFileInput.files?.[0] || null;
        selectedJDFile = file;
        if (file) jdRemoveRequested = false;
        markJobFormDirty();
        renderJDState();
      });
    }

    const removeJDButton = $('removeJDButton');
    if (removeJDButton) {
      removeJDButton.addEventListener('click', openRemoveJDConfirmation);
    }
    const cancelRemoveJDButton = $('cancelRemoveJDButton');
    if (cancelRemoveJDButton) cancelRemoveJDButton.addEventListener('click', closeRemoveJDConfirmation);
    const confirmRemoveJDButton = $('confirmRemoveJDButton');
    if (confirmRemoveJDButton) confirmRemoveJDButton.addEventListener('click', confirmRemoveJD);

    const viewJDButton = $('viewJDButton');
    if (viewJDButton) viewJDButton.addEventListener('click', viewRequirementJD);
    const openJDNewTabButton = $('openJDNewTabButton');
    if (openJDNewTabButton) openJDNewTabButton.addEventListener('click', openRequirementJDInNewTab);
    const downloadJDButton = $('downloadJDButton');
    if (downloadJDButton) downloadJDButton.addEventListener('click', downloadRequirementJD);
    const jdInlineCloseButton = $('jdInlineCloseButton');
    if (jdInlineCloseButton) jdInlineCloseButton.addEventListener('click', closeRequirementJDViewer);
    const jdInlineCloseTopButton = $('jdInlineCloseTopButton');
    if (jdInlineCloseTopButton) jdInlineCloseTopButton.addEventListener('click', closeRequirementJDViewer);

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
        currentPage = 1;
        renderJobs();
      });
    }

    const exportJobsButton = $('exportJobsButton');
    if (exportJobsButton) {
      exportJobsButton.addEventListener('click', () => {
        const rows = filteredJobs();
        const headers = ['Requirements','Client','Location','Skill Level','Salary Range','Experience','Status','Open Date'];
        const csvRows = [headers, ...rows.map(job => [
          job.title || '', job.client_name || '', job.location || '', job.skill_level || '',
          job.salary_budget || '', job.experience || '', statusLabel(job.status), formatDate(job.job_open_date)
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

    $('jobSearch').addEventListener('input', () => { currentPage = 1; renderJobs(); });
    $('statusFilter').addEventListener('change', () => { currentPage = 1; renderJobs(); });
    $('locationFilter').addEventListener('change', () => { currentPage = 1; renderJobs(); });
    $('clientFilter').addEventListener('change', () => { currentPage = 1; renderJobs(); });
    $('refreshJobsButton').addEventListener('click', () => { currentPage = 1; loadJobs(); });
    $('jobsFirst').addEventListener('click', () => goToJobsPage(1));
    $('jobsPrev').addEventListener('click', () => goToJobsPage(currentPage - 1));
    $('jobsNext').addEventListener('click', () => goToJobsPage(currentPage + 1));
    $('jobsLast').addEventListener('click', () => goToJobsPage(Math.max(1, Math.ceil(filteredJobs().length / PAGE_SIZE))));

    $('jobsTableBody').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const id = button.dataset.id;

      if (button.dataset.action === 'candidates') {
        window.location.href = `profiles.html?requirement=${encodeURIComponent(id)}`;
        return;
      }

      if (button.dataset.action === 'view') {
        try {
          button.disabled = true;
          const job = await loadJobDetails(id);
          openModal(job, 'view');
        } catch (error) {
          showMessage(`Could not load job details: ${error.message || error}`, 'error');
        } finally {
          button.disabled = false;
        }
        return;
      }

      if (button.dataset.action === 'delete') {
        openDeleteModal(id);
        return;
      }

      if (button.dataset.action === 'edit') {
        try {
          button.disabled = true;
          const job = await loadJobDetails(id);
          openModal(job);
        } catch (error) {
          showMessage(`Could not load job details: ${error.message || error}`, 'error');
        } finally {
          button.disabled = false;
        }
      }
    });

    document.querySelectorAll('[data-add-list]').forEach(button => {
      button.addEventListener('click', () => addListItem(button.dataset.addList));
    });

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
