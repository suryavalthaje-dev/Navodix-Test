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
              <span>${escapeHtml(job.clients?.client_name || 'Client not provided')}</span>
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
            employment_type,
            clients:client_id(client_name)
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

  function setStatusWorkflow(application) {
    const currentStatus = application?.status || 'new';
    const currentEl = $('applicationCurrentStatus');
    const select = $('applicationNewStatus');
    const note = $('applicationStatusNote');
    const button = $('applicationSaveStatusButton');

    if (currentEl) currentEl.textContent = statusLabel(currentStatus);
    if (select) select.value = currentStatus;
    if (note) note.value = '';
    if (button) button.disabled = true;
  }

  async function saveApplicationStatus() {
    if (!selectedApplication) return;

    const newStatus = $('applicationNewStatus').value;
    const oldStatus = selectedApplication.status || 'new';
    const note = $('applicationStatusNote').value.trim();

    if (newStatus === oldStatus) {
      setApplicationModalMessage('Please select a different status before saving.', 'error');
      return;
    }

    const button = $('applicationSaveStatusButton');
    button.disabled = true;
    setApplicationModalMessage('Saving application status…');

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Your authentication session could not be verified. Please sign in again.');

      const { error: updateError } = await supabase
        .from('applications')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedApplication.id);

      if (updateError) throw updateError;

      const { error: activityError } = await supabase
        .from('application_activity')
        .insert({
          application_id: selectedApplication.id,
          activity_type: 'status_change',
          from_status: oldStatus,
          to_status: newStatus,
          note: note || null,
          created_by: user.id
        });

      if (activityError) {
        // Keep the status and activity history consistent if the activity
        // insert is rejected by RLS or another database rule.
        await supabase
          .from('applications')
          .update({ status: oldStatus, updated_at: selectedApplication.updated_at || new Date().toISOString() })
          .eq('id', selectedApplication.id);
        throw activityError;
      }

      const now = new Date().toISOString();
      selectedApplication.status = newStatus;
      selectedApplication.updated_at = now;
      const index = applications.findIndex(item => String(item.id) === String(selectedApplication.id));
      if (index !== -1) {
        applications[index].status = newStatus;
        applications[index].updated_at = now;
      }

      $('applicationCurrentStatus').textContent = statusLabel(newStatus);
      $('applicationNewStatus').value = newStatus;
      $('applicationStatusNote').value = '';
      $('applicationJobDetails').innerHTML = [
        detailItem('Application Number', selectedApplication.application_number),
        detailItem('Status', statusLabel(selectedApplication.status)),
        detailItem('Job Title', selectedApplication.jobs?.title),
        detailItem('Job Code', selectedApplication.jobs?.job_code),
        detailItem('Job Location', selectedApplication.jobs?.location),
        detailItem('Employment Type', statusLabel(selectedApplication.jobs?.employment_type)),
        detailItem('Applied', formatDateTime(selectedApplication.applied_at)),
        detailItem('Submitted', formatDateTime(selectedApplication.submitted_at)),
        detailItem('Last Updated', formatDateTime(selectedApplication.updated_at))
      ].join('');

      setApplicationModalMessage(`Application status changed from ${statusLabel(oldStatus)} to ${statusLabel(newStatus)}.`, 'success');
      renderApplications();
    } catch (error) {
      console.error('Navodix application status update failed:', error);
      setApplicationModalMessage(`Could not update the application status: ${error.message || error}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function openApplicationModal(applicationId) {
    const application = applications.find(item => String(item.id) === String(applicationId));
    if (!application) return;

    selectedApplication = application;
    setStatusWorkflow(application);
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
    const downloadResumeButton = $('applicationDownloadResumeButton');
    resumeButton.removeAttribute('data-resume-url');
    resumeButton.setAttribute('aria-disabled', 'true');
    resumeButton.classList.add('disabled');
    downloadResumeButton.removeAttribute('data-resume-url');
    downloadResumeButton.setAttribute('aria-disabled', 'true');
    downloadResumeButton.classList.add('disabled');
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
        resumeButton.setAttribute('data-resume-url', data.signedUrl);
        resumeButton.setAttribute('aria-disabled', 'false');
        resumeButton.classList.remove('disabled');
        downloadResumeButton.setAttribute('data-resume-url', data.signedUrl);
        downloadResumeButton.setAttribute('aria-disabled', 'false');
        downloadResumeButton.classList.remove('disabled');
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

    $('applicationNewStatus').addEventListener('change', function () {
      const same = !selectedApplication || this.value === selectedApplication.status;
      $('applicationSaveStatusButton').disabled = same;
    });

    $('applicationSaveStatusButton').addEventListener('click', saveApplicationStatus);

    $('applicationDownloadResumeButton').addEventListener('click', async function (event) {
      event.preventDefault();
      if (this.getAttribute('aria-disabled') === 'true') return;

      const signedUrl = this.getAttribute('data-resume-url');
      if (!signedUrl) return;

      try {
        $('applicationResumeStatus').textContent = 'Preparing download…';
        const response = await fetch(signedUrl, { credentials: 'omit' });
        if (!response.ok) throw new Error(`Resume request failed (HTTP ${response.status})`);

        const blob = await response.blob();
        const resumePath = selectedApplication && selectedApplication.resume_path
          ? selectedApplication.resume_path
          : '';
        const fileName = resumePath.split('/').pop() || 'resume';
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
        $('applicationResumeStatus').textContent = 'Resume download started.';
      } catch (error) {
        console.error('Navodix resume download failed:', error);
        $('applicationResumeStatus').textContent = 'Resume could not be downloaded. Please try again.';
        setApplicationModalMessage(`Could not download the resume: ${error.message || error}`, 'error');
      }
    });

    $('applicationResumeButton').addEventListener('click', async function (event) {
      event.preventDefault();
      if (this.getAttribute('aria-disabled') === 'true') return;

      const signedUrl = this.getAttribute('data-resume-url');
      if (!signedUrl) return;

      // Open a blank tab immediately so the browser does not block the
      // new tab while the private resume is being fetched.
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) {
        setApplicationModalMessage('Please allow pop-ups for this Admin page to open the resume.', 'error');
        return;
      }

      try {
        $('applicationResumeStatus').textContent = 'Opening resume…';

        const resumePath = selectedApplication && selectedApplication.resume_path
          ? selectedApplication.resume_path
          : '';
        const fileName = resumePath.split('/').pop() || 'resume';
        const extension = fileName.includes('.')
          ? fileName.split('.').pop().toLowerCase()
          : '';

        if (extension === 'docx') {
          // DOCX is rendered locally in the browser using docx-preview.
          // The resume itself is fetched directly from the private Supabase
          // Storage signed URL; it is not uploaded to a conversion service.
          const safeUrl = JSON.stringify(signedUrl);
          const safeName = JSON.stringify(fileName);
          previewWindow.document.open();
          previewWindow.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resume - ${safeName.slice(1,-1).replace(/</g,'&lt;').replace(/>/g,'&gt;')}</title>
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/docx-preview@0.4.0/dist/docx-preview.min.js"><\/script>
<style>
html,body{margin:0;padding:0;background:#eef2f7;color:#1f2937;font-family:Arial,Helvetica,sans-serif}#toolbar{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #d8dee8;padding:10px 16px;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}#status{color:#315b70}#container{padding:24px;min-height:calc(100vh - 45px)}.docx-wrapper{background:transparent!important}.docx{box-shadow:0 2px 10px rgba(0,0,0,.12);margin:0 auto 18px;background:#fff!important}@media(max-width:700px){#container{padding:10px}.docx{max-width:100%;overflow-x:auto}}
</style>
</head>
<body>
<div id="toolbar"><span id="status">Loading resume…</span></div>
<div id="container"></div>
<script>
(async function(){
  const url=${safeUrl};
  const status=document.getElementById('status');
  try{
    const response=await fetch(url,{credentials:'omit'});
    if(!response.ok) throw new Error('Resume request failed (HTTP '+response.status+')');
    const blob=await response.blob();
    await docx.renderAsync(blob,document.getElementById('container'),null,{breakPages:true,ignoreLastRenderedPageBreak:false,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true});
    status.textContent='Resume opened. Rendered locally in this browser.';
  }catch(error){
    status.textContent='Unable to display this DOCX resume: '+(error.message||error);
  }
})();
<\/script>
</body></html>`);
          previewWindow.document.close();
          $('applicationResumeStatus').textContent = 'DOCX resume opened in a new tab.';
        } else {
          const response = await fetch(signedUrl, { credentials: 'omit' });
          if (!response.ok) throw new Error(`Resume request failed (HTTP ${response.status})`);

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          previewWindow.location.href = blobUrl;
          $('applicationResumeStatus').textContent = 'Resume opened in a new tab.';

          // Keep the object URL alive while the browser loads the document.
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60 * 1000);
        }
      } catch (error) {
        previewWindow.close();
        console.error('Navodix resume open failed:', error);
        $('applicationResumeStatus').textContent = 'Resume could not be opened. Please try again.';
        setApplicationModalMessage(`Could not open the resume: ${error.message || error}`, 'error');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await window.navodixAdminReady;
    bindEvents();
    await loadApplications();
  });
})();
