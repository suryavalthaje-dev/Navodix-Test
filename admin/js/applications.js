(function () {
  'use strict';

  const supabase = window.navodixSupabase;
  const PAGE_SIZE = 20;
  let applications = [];
  let currentPage = 1;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function showMessage(text, type = '') {
    const el = $('applicationsMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function statusLabel(status) {
    return String(status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function statusClass(status) {
    return 'status-' + String(status || 'new').replace(/[^a-z_]/g, '');
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  function formatExperience(value) {
    return value ? String(value) : '—';
  }

  function updateSummary() {
    $('totalApplications').textContent = applications.length;
    $('newApplications').textContent = applications.filter(item => item.status === 'new').length;
    $('underReviewApplications').textContent = applications.filter(item => item.status === 'under_review').length;
    $('shortlistedApplications').textContent = applications.filter(item => item.status === 'shortlisted').length;
  }

  function filteredApplications() {
    const search = $('applicationSearch').value.trim().toLowerCase();
    const status = $('applicationStatusFilter').value;

    return applications.filter(application => {
      const applicant = application.applicants || {};
      const job = application.jobs || {};
      const haystack = [
        application.application_number,
        applicant.full_name,
        applicant.email,
        applicant.phone,
        job.title,
        job.job_code,
        job.location
      ].map(value => String(value || '').toLowerCase());

      const matchesSearch = !search || haystack.some(value => value.includes(search));
      const matchesStatus = !status || application.status === status;
      return matchesSearch && matchesStatus;
    });
  }

  function renderApplications() {
    const body = $('applicationsTableBody');
    const empty = $('emptyApplications');
    const rows = filteredApplications();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    body.innerHTML = pageRows.map(application => {
      const applicant = application.applicants || {};
      const job = application.jobs || {};
      return `
        <tr>
          <td>
            <div class="application-number-cell">
              <strong>${escapeHtml(application.application_number || '—')}</strong>
              <span>${escapeHtml(application.email_status === 'sent' ? 'HR email sent' : application.email_status === 'failed' ? 'HR email failed' : 'Email not sent')}</span>
            </div>
          </td>
          <td>
            <div class="job-title-cell">
              <strong>${escapeHtml(applicant.full_name || '—')}</strong>
              <span>${escapeHtml(applicant.current_location || 'Location not provided')}</span>
            </div>
          </td>
          <td>
            <div class="job-title-cell">
              <strong>${escapeHtml(job.title || '—')}</strong>
              <span>${escapeHtml(job.job_code || '—')}</span>
            </div>
          </td>
          <td>
            <div class="application-contact-cell">
              <span>${escapeHtml(applicant.email || '—')}</span>
              <span>${escapeHtml(applicant.phone || '—')}</span>
            </div>
          </td>
          <td>${escapeHtml(formatExperience(applicant.total_experience))}</td>
          <td>${escapeHtml(formatDateTime(application.submitted_at || application.applied_at))}</td>
          <td><span class="status-pill ${statusClass(application.status)}">${escapeHtml(statusLabel(application.status))}</span></td>
        </tr>
      `;
    }).join('');

    const hasRows = pageRows.length > 0;
    empty.classList.toggle('hidden', hasRows);
    body.parentElement.classList.toggle('hidden', !hasRows);

    $('applicationsPageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    $('applicationsPrev').disabled = currentPage <= 1;
    $('applicationsNext').disabled = currentPage >= totalPages;
    $('applicationsPagination').classList.toggle('hidden', !rows.length);

    updateSummary();
  }

  async function loadApplications() {
    showMessage('Loading applications…', '');

    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          application_number,
          status,
          email_status,
          email_error,
          applied_at,
          submitted_at,
          updated_at,
          resume_path,
          cover_message,
          applicants:applicant_id(
            id,
            full_name,
            email,
            phone,
            current_location,
            total_experience
          ),
          jobs:job_id(
            id,
            title,
            job_code,
            location,
            employment_type
          )
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      applications = data || [];
      currentPage = 1;
      renderApplications();
      showMessage(applications.length ? '' : 'No applications have been submitted yet.', '');
    } catch (error) {
      console.error('Navodix Applications load failed:', error);
      applications = [];
      currentPage = 1;
      renderApplications();
      showMessage(`Could not load applications: ${error.message || error}`, 'error');
    }
  }

  function bindEvents() {
    $('applicationSearch').addEventListener('input', function () {
      currentPage = 1;
      renderApplications();
    });

    $('applicationStatusFilter').addEventListener('change', function () {
      currentPage = 1;
      renderApplications();
    });

    $('refreshApplicationsButton').addEventListener('click', loadApplications);

    $('applicationsPrev').addEventListener('click', function () {
      if (currentPage > 1) {
        currentPage -= 1;
        renderApplications();
      }
    });

    $('applicationsNext').addEventListener('click', function () {
      const totalPages = Math.max(1, Math.ceil(filteredApplications().length / PAGE_SIZE));
      if (currentPage < totalPages) {
        currentPage += 1;
        renderApplications();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await window.navodixAdminReady;
    bindEvents();
    await loadApplications();
  });
})();
