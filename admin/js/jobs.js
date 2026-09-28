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
    return jobs.filter(job => {
      const matchesSearch = !search || [
        job.job_code, job.title, job.location, job.experience, job.client_name
      ].some(v => String(v || '').toLowerCase().includes(search));
      return matchesSearch && (!status || job.status === status);
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

    body.innerHTML = pageRows.map(job => `
      <tr>
        <td>
          <div class="job-title-cell">
            <strong>${escapeHtml(job.title)}</strong>
            <span class="job-client-name">${escapeHtml(job.client_name || '—')}</span>
          </div>
        </td>
        <td>${escapeHtml(job.location)}</td>
        <td>${escapeHtml(formatType(job.employment_type))}</td>
        <td>${escapeHtml(job.experience)}</td>
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
    `).join('');

    const hasRows = pageRows.length > 0;
    empty.classList.toggle('hidden', hasRows);
    body.parentElement.classList.toggle('hidden', !hasRows);
    updateJobsPagination(rows.length, totalPages, start, pageRows.length);
    updateSummary();
  }

  function updateJobsPagination(total, totalPages, start, count) {
    const wrap = $('jobsPagination');
    if (!wrap) return;
    wrap.classList.toggle('hidden', total === 0);
    if (!total) return;
    $('jobsPageInfo').textContent = `Showing ${start + 1}-${start + count} of ${total}`;
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

    categorySelect.innerHTML = '<option value="">Select Category</option>' + jobCategories.map(category =>
      `<option value="${escapeHtml(category.id)}">${escapeHtml(category.category_name)} (${escapeHtml(category.category_code)})</option>`
    ).join('');

    locationSelect.innerHTML = '<option value="">Select Location</option>' + locations.map(location =>
      `<option value="${escapeHtml(location.id)}" ${location.is_active ? '' : 'disabled'}>${escapeHtml(location.location_name)}${location.is_active ? '' : ' (Inactive)'}</option>`
    ).join('');
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
      const matchedLocation = locations.find(item => item.id === job.location_id) ||
        locations.find(item => String(item.location_name || '').trim().toLowerCase() === String(job.location || '').trim().toLowerCase());
      $('jobLocation').value = matchedLocation ? matchedLocation.id : '';
      $('employmentType').value = job.employment_type || 'full_time';
      $('jobExperience').value = job.experience || '';
      $('jobStatus').value = job.status || 'draft';
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

  function closeModal(force = false) {
    if (!force && jobFormDirty) {
      const discard = window.confirm('You have entered information for this requirement. Are you sure you want to close without saving?');
      if (!discard) return false;
    }

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
    const locationId = $('jobLocation').value;
    const selectedLocation = locations.find(item => item.id === locationId);
    const location = selectedLocation ? selectedLocation.location_name : '';
    const employmentType = $('employmentType').value;
    const experience = $('jobExperience').value.trim();
    const skillLevel = $('skillLevel').value.trim() || null;
    const status = $('jobStatus').value;
    const closingDate = $('closingDate').value || null;
    const shortDescription = $('shortDescription').value.trim() || null;
    const detailedDescription = $('detailedDescription').value.trim() || null;

    if (!clientId || !categoryId || !locationId || !jobOpenDate || !title || !location || !experience) {
      showFormMessage('Please complete all required fields.', 'error');
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
      }

      await Promise.all([
        saveList('job_responsibilities', savedJob.id, 'responsibility', getListValues('responsibilities')),
        saveList('job_requirements', savedJob.id, 'requirement', getListValues('requirements')),
        saveList('job_qualifications', savedJob.id, 'qualification', getListValues('qualifications'))
      ]);

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
    $('jobForm').addEventListener('submit', saveJob);
    $('jobForm').addEventListener('input', markJobFormDirty);
    $('jobForm').addEventListener('change', markJobFormDirty);
    $('jobForm').addEventListener('click', (event) => {
      if (event.target.closest('[data-add-list], .remove-item')) markJobFormDirty();
    });

    $('clientName').addEventListener('change', updateJobCodePreview);
    $('jobCategory').addEventListener('change', updateJobCodePreview);
    $('jobOpenDate').addEventListener('change', updateJobCodePreview);

    $('jobSearch').addEventListener('input', () => { currentPage = 1; renderJobs(); });
    $('statusFilter').addEventListener('change', () => { currentPage = 1; renderJobs(); });
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
