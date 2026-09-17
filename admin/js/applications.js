(function () {
  'use strict';

  const supabase = window.navodixSupabase;
  const PAGE_SIZE = 20;
  let applications = [];
  let currentPage = 1;
  let selectedApplication = null;

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

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
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
              <span>${escapeHtml(job.location || applicant.current_location || 'Location not provided')}</span>
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
          <td>${escapeHtml(formatDate(application.submitted_at || application.applied_at))}</td>
          <td><span class="status-pill ${statusClass(application.status)}">${escapeHtml(statusLabel(application.status))}</span></td>
          <td><button class="btn btn-outline btn-small application-view-button" type="button" data-id="${escapeHtml(application.id)}"><i class="fa-solid fa-eye" aria-hidden="true"></i> View Details</button></td>
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
            total_experience,
            alternate_phone,
            current_job_title,
            current_company,
            notice_period,
            current_ctc,
            expected_ctc,
            highest_qualification,
            specialization,
            graduation_year,
            skills,
            linkedin_url,
            github_url,
            additional_information,
            consent_at
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

  function detailItem(label, value, wide = false) {
    return `<div class="application-detail-item${wide ? ' application-detail-item-wide' : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '—')}</strong>
    </div>`;
  }

  function linkDetailItem(label, value) {
    if (!value) return detailItem(label, '—');
    const safe = escapeHtml(value);
    let href = '';
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') href = url.href;
    } catch (_) {}
    if (!href) return detailItem(label, value);
    return `<div class="application-detail-item">
      <span>${escapeHtml(label)}</span>
      <strong><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${safe}</a></strong>
    </div>`;
  }

  function setApplicationModalMessage(text, type = '') {
    const el = $('applicationModalMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  async function openApplicationModal(applicationId) {
    const application = applications.find(item => String(item.id) === String(applicationId));
    if (!application) return;

    selectedApplication = application;
    const applicant = application.applicants || {};
    const job = application.jobs || {};

    $('applicationModalTitle').textContent = applicant.full_name || 'Application';
    $('applicationModalNumber').textContent = application.application_number || '—';
    setApplicationModalMessage('');

    $('applicationJobDetails').innerHTML = [
      detailItem('Application Number', application.application_number),
      detailItem('Status', statusLabel(application.status)),
      detailItem('Job Title', job.title),
      detailItem('Job Code', job.job_code),
      detailItem('Job Location', job.location),
      detailItem('Employment Type', statusLabel(job.employment_type)),
      detailItem('Applied', formatDateTime(application.applied_at)),
      detailItem('Submitted', formatDateTime(application.submitted_at)),
      detailItem('Last Updated', formatDateTime(application.updated_at))
    ].join('');

    $('applicationApplicantDetails').innerHTML = [
      detailItem('Full Name', applicant.full_name),
      detailItem('Email', applicant.email),
      detailItem('Mobile', applicant.phone),
      detailItem('Alternate Phone', applicant.alternate_phone),
      detailItem('Current Location', applicant.current_location),
      detailItem('Total Experience', applicant.total_experience),
      detailItem('Current Job Title', applicant.current_job_title),
      detailItem('Current Company', applicant.current_company),
      detailItem('Notice Period', applicant.notice_period),
      detailItem('Current CTC', applicant.current_ctc),
      detailItem('Expected CTC', applicant.expected_ctc)
    ].join('');

    $('applicationEducationDetails').innerHTML = [
      detailItem('Highest Qualification', applicant.highest_qualification),
      detailItem('Specialization', applicant.specialization),
      detailItem('Graduation Year', applicant.graduation_year),
      detailItem('Skills', applicant.skills, true),
      linkDetailItem('LinkedIn', applicant.linkedin_url),
      linkDetailItem('GitHub', applicant.github_url)
    ].join('');

    $('applicationCoverMessage').textContent = application.cover_message || '—';
    $('applicationAdditionalInformation').textContent = applicant.additional_information || '—';

    $('applicationContactDetails').innerHTML = [
      detailItem('HR Email Status', application.email_status === 'sent' ? 'Sent' : application.email_status === 'failed' ? 'Failed' : 'Not Sent'),
      detailItem('HR Email Error', application.email_error),
      detailItem('Consent', applicant.consent_at ? `Given ${formatDateTime(applicant.consent_at)}` : '—')
    ].join('');

    const resumeButton = $('applicationResumeButton');
    resumeButton.removeAttribute('href');
    resumeButton.setAttribute('aria-disabled', 'true');
    resumeButton.classList.add('disabled');
    $('applicationResumeStatus').textContent = application.resume_path
      ? 'Preparing a secure resume link…'
      : 'No resume path is stored for this application.';

    const modal = $('applicationModal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    if (application.resume_path) {
      try {
        const { data, error } = await supabase.storage
          .from('careers-resumes')
          .createSignedUrl(application.resume_path, 600);
        if (error) throw error;
        if (!data || !data.signedUrl) throw new Error('Could not create a resume link');
        resumeButton.href = data.signedUrl;
        resumeButton.setAttribute('aria-disabled', 'false');
        resumeButton.classList.remove('disabled');
        $('applicationResumeStatus').textContent = 'Secure resume link ready. The link expires after 10 minutes.';
      } catch (error) {
        console.error('Navodix resume link failed:', error);
        $('applicationResumeStatus').textContent = 'Resume could not be opened. Please try again.';
        setApplicationModalMessage(`Could not prepare the resume: ${error.message || error}`, 'error');
      }
    }
  }

  function closeApplicationModal() {
    const modal = $('applicationModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    selectedApplication = null;
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

    $('applicationsTableBody').addEventListener('click', function (event) {
      const button = event.target.closest('.application-view-button');
      if (!button) return;
      event.stopPropagation();
      openApplicationModal(button.dataset.id);
    });

    $('closeApplicationModal').addEventListener('click', closeApplicationModal);
    $('applicationModalCloseBtn').addEventListener('click', closeApplicationModal);
    $('applicationModal').addEventListener('click', function (event) {
      if (event.target === $('applicationModal')) closeApplicationModal();
    });

    $('applicationResumeButton').addEventListener('click', function (event) {
      if (this.getAttribute('aria-disabled') === 'true') event.preventDefault();
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await window.navodixAdminReady;
    bindEvents();
    await loadApplications();
  });
})();
