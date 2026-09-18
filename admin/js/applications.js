(function () {
  'use strict';

  const supabase = window.navodixSupabase;
  const PAGE_SIZE = 20;
  let applications = [];
  let currentPage = 1;
  let selectedApplication = null;
  let editingInterviewId = null;
  let interviewResultsByApplication = new Map();
  let jobCategories = [];
  let locations = [];

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
    const clientId = $('applicationClientFilter').value;
    const jobId = $('applicationJobFilter').value;
    const categoryId = $('applicationCategoryFilter').value;
    const locationId = $('applicationLocationFilter').value;
    const dateFrom = $('applicationDateFrom').value;
    const dateTo = $('applicationDateTo').value;
    const interviewResult = $('applicationInterviewResultFilter').value;
    const submittedClient = $('applicationSubmittedClientFilter').value;
    const futureConsideration = $('applicationFutureConsiderationFilter').value;

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
      const matchesClient = !clientId || String(job.client_id || '') === clientId;
      const matchesJob = !jobId || String(job.id || '') === jobId;
      const matchesCategory = !categoryId || String(job.job_category_id || '') === categoryId;
      const matchesLocation = !locationId || String(job.location_id || '') === locationId;
      const applicationDate = String(application.submitted_at || application.applied_at || '').slice(0, 10);
      const matchesDateFrom = !dateFrom || (applicationDate && applicationDate >= dateFrom);
      const matchesDateTo = !dateTo || (applicationDate && applicationDate <= dateTo);
      const roundResults = interviewResultsByApplication.get(String(application.id)) || [];
      const matchesInterviewResult = !interviewResult || roundResults.includes(interviewResult);
      const matchesSubmittedClient = !submittedClient || (submittedClient === 'yes' ? application.status === 'submitted_to_client' : application.status !== 'submitted_to_client');
      const matchesFutureConsideration = !futureConsideration || (futureConsideration === 'yes' ? application.status === 'future_consideration' : application.status !== 'future_consideration');

      return matchesSearch && matchesStatus && matchesClient && matchesJob &&
        matchesCategory && matchesLocation && matchesDateFrom && matchesDateTo &&
        matchesInterviewResult && matchesSubmittedClient && matchesFutureConsideration;
    });
  }

  function populateFilterOptions() {
    const clientMap = new Map();
    const jobMap = new Map();

    applications.forEach(application => {
      const job = application.jobs || {};
      const client = job.clients || {};
      if (job.id) jobMap.set(String(job.id), job);
      if (job.client_id && client.client_name) clientMap.set(String(job.client_id), client.client_name);
    });

    const categoryMap = new Map(jobCategories.map(item => [String(item.id), item.category_name]));
    const locationMap = new Map(locations.map(item => [String(item.id), item.location_name]));

    const fill = (id, entries, placeholder) => {
      const select = $(id);
      const current = select.value;
      select.innerHTML = `<option value="">${placeholder}</option>` + entries
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join('');
      if ([...select.options].some(option => option.value === current)) select.value = current;
    };

    fill('applicationClientFilter', [...clientMap.entries()], 'All Clients');
    fill('applicationJobFilter', [...jobMap.entries()].map(([id, job]) => [id, `${job.title || 'Untitled Job'}${job.job_code ? ` (${job.job_code})` : ''}`]), 'All Jobs');
    fill('applicationCategoryFilter', [...categoryMap.entries()], 'All Job Categories');
    fill('applicationLocationFilter', [...locationMap.entries()], 'All Locations');
  }

  function clearApplicationFilters() {
    $('applicationSearch').value = '';
    $('applicationStatusFilter').value = '';
    $('applicationClientFilter').value = '';
    $('applicationJobFilter').value = '';
    $('applicationCategoryFilter').value = '';
    $('applicationLocationFilter').value = '';
    $('applicationDateFrom').value = '';
    $('applicationDateTo').value = '';
    $('applicationInterviewResultFilter').value = '';
    $('applicationSubmittedClientFilter').value = '';
    $('applicationFutureConsiderationFilter').value = '';
    currentPage = 1;
    renderApplications();
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
            location_id,
            job_category_id,
            client_id,
            employment_type,
            clients:client_id(client_name)
          )
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      applications = data || [];

      const [categoryResult, locationResult, interviewResult] = await Promise.all([
        supabase.from('job_categories').select('id, category_name').order('category_name'),
        supabase.from('locations').select('id, location_name').order('location_name'),
        supabase.from('application_interviews').select('application_id, result')
      ]);

      if (categoryResult.error) throw categoryResult.error;
      if (locationResult.error) throw locationResult.error;
      if (interviewResult.error) throw interviewResult.error;

      jobCategories = categoryResult.data || [];
      locations = locationResult.data || [];
      interviewResultsByApplication = new Map();
      (interviewResult.data || []).forEach(row => {
        const key = String(row.application_id);
        if (!interviewResultsByApplication.has(key)) interviewResultsByApplication.set(key, []);
        interviewResultsByApplication.get(key).push(row.result);
      });

      populateFilterOptions();
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

  function setApplicationStatusMessage(text, type = '') {
    const el = $('applicationStatusMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function resetApplicationStatusForm(status) {
    if ($('applicationStatusSelect')) $('applicationStatusSelect').value = status || 'new';
    if ($('applicationStatusNote')) $('applicationStatusNote').value = '';
    setApplicationStatusMessage('');
    if ($('saveApplicationStatusButton')) {
      $('saveApplicationStatusButton').disabled = false;
      $('saveApplicationStatusButton').textContent = 'Save Status';
    }
  }

  function interviewTypeLabel(value) {
    return statusLabel(value);
  }

  function interviewResultLabel(value) {
    return statusLabel(value);
  }

  function interviewModeLabel(value) {
    return value === 'in_person' ? 'In Person' : statusLabel(value);
  }

  function renderInterviewRounds(rounds) {
    const container = $('applicationInterviewsList');
    if (!container) return;
    if (!rounds || !rounds.length) {
      container.innerHTML = '<div class="application-interviews-empty">No interview rounds have been added.</div>';
      return;
    }

    container.innerHTML = rounds.map(round => `
      <article class="application-interview-card" data-interview-id="${escapeHtml(round.id)}">
        <div class="application-interview-card-top">
          <div>
            <strong>Round ${escapeHtml(round.round_number)}</strong>
            <span>${escapeHtml(interviewTypeLabel(round.interview_type))}</span>
          </div>
          <div class="application-interview-card-actions">
            <button type="button" class="btn btn-outline btn-small interview-edit-button" data-interview-id="${escapeHtml(round.id)}">Edit</button>
            <button type="button" class="btn btn-danger btn-small interview-delete-button" data-interview-id="${escapeHtml(round.id)}">Delete</button>
          </div>
          <span class="interview-result-pill interview-result-${escapeHtml(round.result)}">${escapeHtml(interviewResultLabel(round.result))}</span>
        </div>
        <div class="application-interview-meta">
          <span><b>Date:</b> ${escapeHtml(formatDate(round.scheduled_date))}</span>
          <span><b>Time:</b> ${escapeHtml(round.scheduled_time ? String(round.scheduled_time).slice(0,5) : '—')}</span>
          <span><b>Interviewer:</b> ${escapeHtml(round.interviewer)}</span>
          <span><b>Mode:</b> ${escapeHtml(interviewModeLabel(round.mode))}</span>
        </div>
        ${round.feedback ? `<div class="application-interview-feedback"><span>Feedback / Notes</span><p>${escapeHtml(round.feedback)}</p></div>` : ''}
      </article>
    `).join('');
  }

  async function loadInterviewRounds(applicationId) {
    const container = $('applicationInterviewsList');
    if (container) container.innerHTML = '<div class="application-interviews-empty">Loading interview rounds…</div>';

    const { data, error } = await supabase
      .from('application_interviews')
      .select('id, application_id, round_number, interview_type, scheduled_date, scheduled_time, interviewer, mode, result, feedback, created_by, created_at, updated_at')
      .eq('application_id', applicationId)
      .order('round_number', { ascending: true });

    if (error) {
      console.error('Navodix interview rounds load failed:', error);
      if (container) container.innerHTML = '<div class="application-interviews-empty error">Interview rounds could not be loaded.</div>';
      return;
    }
    renderInterviewRounds(data || []);
  }

  function setInterviewFormMessage(text, type = '') {
    const el = $('interviewFormMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function resetInterviewForm() {
    editingInterviewId = null;
    const form = $('addInterviewRoundForm');
    if (form) form.reset();
    if ($('interviewResult')) $('interviewResult').value = 'pending';
    if ($('interviewMode')) $('interviewMode').value = 'online';
    if ($('interviewFormTitle')) $('interviewFormTitle').textContent = 'Add Interview Round';
    if ($('saveInterviewRoundButton')) $('saveInterviewRoundButton').textContent = 'Save Interview Round';
    setInterviewFormMessage('');
  }

  function toggleInterviewForm(show) {
    const form = $('addInterviewRoundForm');
    if (!form) return;
    if (show) {
      form.classList.remove('hidden');
      setInterviewFormMessage('');
      $('interviewType')?.focus();
    } else {
      form.classList.add('hidden');
      resetInterviewForm();
    }
  }

  async function getCurrentUserId() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('Your session has expired. Please sign in again.');
    return userId;
  }

  function interviewActivityNote(round, action) {
    const date = formatDate(round.scheduled_date);
    const time = round.scheduled_time ? String(round.scheduled_time).slice(0, 5) : '—';
    const details = [
      `${interviewTypeLabel(round.interview_type)} interview`,
      `Date: ${date}`,
      `Time: ${time}`,
      `Interviewer: ${round.interviewer || '—'}`,
      `Mode: ${interviewModeLabel(round.mode)}`,
      `Result: ${interviewResultLabel(round.result)}`
    ].join(' | ');
    const feedback = round.feedback ? ` | Feedback: ${round.feedback}` : '';
    return `${action} Round ${round.round_number} — ${details}${feedback}`;
  }

  async function saveInterviewRound(event) {
    event.preventDefault();
    if (!selectedApplication) return;

    const type = $('interviewType').value;
    const date = $('interviewDate').value;
    const time = $('interviewTime').value || null;
    const interviewer = $('interviewer').value.trim();
    const mode = $('interviewMode').value;
    const result = $('interviewResult').value;
    const feedback = $('interviewFeedback').value.trim() || null;

    if (!type || !date || !interviewer || !mode || !result) {
      setInterviewFormMessage('Please complete all required interview fields.', 'error');
      return;
    }

    const saveButton = $('saveInterviewRoundButton');
    saveButton.disabled = true;
    saveButton.textContent = editingInterviewId ? 'Updating…' : 'Saving…';
    setInterviewFormMessage('');

    try {
      const userId = await getCurrentUserId();
      const newValues = {
        interview_type: type,
        scheduled_date: date,
        scheduled_time: time,
        interviewer,
        mode,
        result,
        feedback
      };

      if (editingInterviewId) {
        const { data: existingRound, error: existingError } = await supabase
          .from('application_interviews')
          .select('id, application_id, round_number, interview_type, scheduled_date, scheduled_time, interviewer, mode, result, feedback')
          .eq('id', editingInterviewId)
          .eq('application_id', selectedApplication.id)
          .maybeSingle();
        if (existingError || !existingRound) {
          throw existingError || new Error('Interview round could not be found.');
        }

        const { error: updateError } = await supabase
          .from('application_interviews')
          .update(newValues)
          .eq('id', editingInterviewId)
          .eq('application_id', selectedApplication.id);
        if (updateError) throw updateError;

        const updatedRound = { ...existingRound, ...newValues };
        const { error: activityError } = await supabase
          .from('application_activity')
          .insert({
            application_id: selectedApplication.id,
            activity_type: 'interview_updated',
            note: interviewActivityNote(updatedRound, 'Updated'),
            created_by: userId
          });

        if (activityError) {
          await supabase
            .from('application_interviews')
            .update({
              interview_type: existingRound.interview_type,
              scheduled_date: existingRound.scheduled_date,
              scheduled_time: existingRound.scheduled_time,
              interviewer: existingRound.interviewer,
              mode: existingRound.mode,
              result: existingRound.result,
              feedback: existingRound.feedback
            })
            .eq('id', existingRound.id)
            .eq('application_id', selectedApplication.id);
          throw activityError;
        }

        setInterviewFormMessage('Interview round updated successfully.', 'success');
      } else {
        const { data: nextRound, error: roundError } = await supabase.rpc('get_next_interview_round', {
          p_application_id: selectedApplication.id
        });
        if (roundError) throw roundError;

        const roundNumber = Number(nextRound);
        const roundToInsert = {
          application_id: selectedApplication.id,
          round_number: roundNumber,
          ...newValues,
          created_by: userId
        };

        const { data: insertedRound, error: insertError } = await supabase
          .from('application_interviews')
          .insert(roundToInsert)
          .select('id, application_id, round_number, interview_type, scheduled_date, scheduled_time, interviewer, mode, result, feedback')
          .single();
        if (insertError) throw insertError;

        const { error: activityError } = await supabase
          .from('application_activity')
          .insert({
            application_id: selectedApplication.id,
            activity_type: 'interview_created',
            note: interviewActivityNote(insertedRound, 'Created'),
            created_by: userId
          });

        if (activityError) {
          await supabase
            .from('application_interviews')
            .delete()
            .eq('id', insertedRound.id)
            .eq('application_id', selectedApplication.id);
          throw activityError;
        }

        setInterviewFormMessage(`Round ${roundNumber} saved successfully.`, 'success');
      }

      toggleInterviewForm(false);
      await Promise.all([
        loadInterviewRounds(selectedApplication.id),
        loadApplicationActivity(selectedApplication.id)
      ]);
    } catch (error) {
      console.error('Navodix interview round save failed:', error);
      setInterviewFormMessage(`Could not save the interview round: ${error.message || error}`, 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Interview Round';
    }
  }

  async function editInterviewRound(interviewId) {
    if (!selectedApplication) return;
    const { data: round, error } = await supabase
      .from('application_interviews')
      .select('id, application_id, round_number, interview_type, scheduled_date, scheduled_time, interviewer, mode, result, feedback')
      .eq('id', interviewId)
      .eq('application_id', selectedApplication.id)
      .maybeSingle();
    if (error || !round) {
      setApplicationModalMessage(error?.message || 'Interview round could not be found.', 'error');
      return;
    }
    editingInterviewId = round.id;
    $('interviewType').value = round.interview_type || '';
    $('interviewDate').value = round.scheduled_date || '';
    $('interviewTime').value = round.scheduled_time ? String(round.scheduled_time).slice(0,5) : '';
    $('interviewer').value = round.interviewer || '';
    $('interviewMode').value = round.mode || 'online';
    $('interviewResult').value = round.result || 'pending';
    $('interviewFeedback').value = round.feedback || '';
    $('interviewFormTitle').textContent = `Edit Round ${round.round_number}`;
    $('saveInterviewRoundButton').textContent = 'Update Interview Round';
    setInterviewFormMessage('');
    toggleInterviewForm(true);
  }

  async function deleteInterviewRound(interviewId) {
    if (!selectedApplication) return;
    const confirmed = window.confirm('Delete this interview round? This action cannot be undone.');
    if (!confirmed) return;

    try {
      const userId = await getCurrentUserId();
      const { data: round, error: roundError } = await supabase
        .from('application_interviews')
        .select('id, application_id, round_number, interview_type, scheduled_date, scheduled_time, interviewer, mode, result, feedback')
        .eq('id', interviewId)
        .eq('application_id', selectedApplication.id)
        .maybeSingle();
      if (roundError || !round) throw roundError || new Error('Interview round could not be found.');

      const { error: deleteError } = await supabase
        .from('application_interviews')
        .delete()
        .eq('id', interviewId)
        .eq('application_id', selectedApplication.id);
      if (deleteError) throw deleteError;

      const { error: activityError } = await supabase
        .from('application_activity')
        .insert({
          application_id: selectedApplication.id,
          activity_type: 'interview_deleted',
          note: interviewActivityNote(round, 'Deleted'),
          created_by: userId
        });

      if (activityError) {
        await supabase
          .from('application_interviews')
          .insert({
            id: round.id,
            application_id: round.application_id,
            round_number: round.round_number,
            interview_type: round.interview_type,
            scheduled_date: round.scheduled_date,
            scheduled_time: round.scheduled_time,
            interviewer: round.interviewer,
            mode: round.mode,
            result: round.result,
            feedback: round.feedback,
            created_by: userId
          });
        throw activityError;
      }

      await Promise.all([
        loadInterviewRounds(selectedApplication.id),
        loadApplicationActivity(selectedApplication.id)
      ]);
      setApplicationModalMessage('Interview round deleted successfully.', 'success');
    } catch (error) {
      console.error('Navodix interview round delete failed:', error);
      setApplicationModalMessage(`Could not delete the interview round: ${error.message || error}`, 'error');
    }
  }

  function activityTypeLabel(value) {
    if (value === 'status_change') return 'Status Changed';
    if (value === 'note') return 'Note Added';
    if (value === 'interview_created') return 'Interview Round Added';
    if (value === 'interview_updated') return 'Interview Round Updated';
    if (value === 'interview_deleted') return 'Interview Round Deleted';
    return statusLabel(value || 'Activity');
  }

  function setApplicationNoteMessage(text, type = '') {
    const el = $('applicationNoteMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function toggleApplicationNoteForm(show) {
    const form = $('applicationNoteForm');
    if (!form) return;
    if (show) {
      form.classList.remove('hidden');
      setApplicationNoteMessage('');
      $('applicationNote')?.focus();
    } else {
      form.classList.add('hidden');
      if ($('applicationNote')) $('applicationNote').value = '';
      setApplicationNoteMessage('');
    }
  }

  function renderApplicationActivity(rows) {
    const container = $('applicationActivityList');
    if (!container) return;
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="application-activity-empty">No activity has been recorded for this application.</div>';
      return;
    }

    container.innerHTML = rows.map(item => {
      const isStatus = item.activity_type === 'status_change';
      const actor = item.created_by ? (item.created_by_name || item.created_by_email || 'Unknown user') : 'System';
      const title = activityTypeLabel(item.activity_type);
      const statusLine = isStatus
        ? `<div class="application-activity-status"><span>${escapeHtml(statusLabel(item.from_status || '—'))}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i><strong>${escapeHtml(statusLabel(item.to_status || '—'))}</strong></div>`
        : '';
      const note = item.note ? `<div class="application-activity-note">${escapeHtml(item.note).replace(/\n/g, '<br>')}</div>` : '';
      return `
        <article class="application-activity-item">
          <div class="application-activity-item-marker"><i class="fa-solid ${isStatus ? 'fa-arrows-rotate' : 'fa-note-sticky'}" aria-hidden="true"></i></div>
          <div class="application-activity-item-content">
            <div class="application-activity-item-top">
              <strong>${escapeHtml(title)}</strong>
              <time>${escapeHtml(formatDateTime(item.created_at))}</time>
            </div>
            ${statusLine}
            ${note}
            <div class="application-activity-actor">By: ${escapeHtml(actor)}</div>
          </div>
        </article>`;
    }).join('');
  }

  async function loadApplicationActivity(applicationId) {
    const container = $('applicationActivityList');
    if (container) container.innerHTML = '<div class="application-activity-empty">Loading activity history…</div>';

    const { data, error } = await supabase
      .from('application_activity')
      .select('id, application_id, activity_type, from_status, to_status, note, created_by, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Navodix application activity load failed:', error);
      if (container) container.innerHTML = '<div class="application-activity-empty error">Activity history could not be loaded.</div>';
      return;
    }

    const rows = data || [];
    const userIds = [...new Set(rows.map(item => item.created_by).filter(Boolean))];
    let names = new Map();

    if (userIds.length) {
      const { data: admins, error: adminError } = await supabase
        .from('careers_admins')
        .select('user_id, display_name')
        .in('user_id', userIds);
      if (adminError) {
        console.warn('Navodix activity user-name lookup failed:', adminError);
      } else {
        names = new Map((admins || []).map(user => [user.user_id, user.display_name || '']));
      }
    }

    renderApplicationActivity(rows.map(item => ({
      ...item,
      created_by_name: names.get(item.created_by) || ''
    })));
  }

  async function saveApplicationNote(event) {
    event.preventDefault();
    if (!selectedApplication) return;

    const note = $('applicationNote').value.trim();
    if (!note) {
      setApplicationNoteMessage('Please enter a note or comment.', 'error');
      $('applicationNote')?.focus();
      return;
    }

    const saveButton = $('saveApplicationNoteButton');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    setApplicationNoteMessage('');

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error('Your session has expired. Please sign in again.');

      const { error } = await supabase
        .from('application_activity')
        .insert({
          application_id: selectedApplication.id,
          activity_type: 'note',
          note,
          created_by: userId
        });
      if (error) throw error;

      toggleApplicationNoteForm(false);
      await loadApplicationActivity(selectedApplication.id);
      setApplicationModalMessage('Note added successfully.', 'success');
    } catch (error) {
      console.error('Navodix application note save failed:', error);
      setApplicationNoteMessage(`Could not save the note: ${error.message || error}`, 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Note';
    }
  }

  async function saveApplicationStatus() {
    if (!selectedApplication) return;

    const oldStatus = selectedApplication.status || 'new';
    const newStatus = $('applicationStatusSelect')?.value || '';
    const note = $('applicationStatusNote')?.value.trim() || null;

    if (!newStatus) {
      setApplicationStatusMessage('Please select a status.', 'error');
      return;
    }

    if (newStatus === oldStatus) {
      setApplicationStatusMessage('Please select a different status.', 'error');
      return;
    }

    const saveButton = $('saveApplicationStatusButton');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    setApplicationStatusMessage('');
    setApplicationModalMessage('');

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error('Your session has expired. Please sign in again.');

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
          note,
          created_by: userId
        });

      if (activityError) {
        // Keep status and history consistent if the activity insert is rejected.
        await supabase
          .from('applications')
          .update({ status: oldStatus, updated_at: selectedApplication.updated_at || new Date().toISOString() })
          .eq('id', selectedApplication.id);
        throw activityError;
      }

      selectedApplication.status = newStatus;
      selectedApplication.updated_at = new Date().toISOString();
      const modalStatus = $('applicationModalStatus');
      if (modalStatus) modalStatus.textContent = statusLabel(newStatus);
      const localApplication = applications.find(item => String(item.id) === String(selectedApplication.id));
      if (localApplication) {
        localApplication.status = newStatus;
        localApplication.updated_at = selectedApplication.updated_at;
      }

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

      resetApplicationStatusForm(newStatus);
      renderApplications();
      await loadApplicationActivity(selectedApplication.id);
      setApplicationModalMessage(`Application status changed to ${statusLabel(newStatus)}.`, 'success');
    } catch (error) {
      console.error('Navodix application status update failed:', error);
      setApplicationStatusMessage(`Could not update the application status: ${error.message || error}`, 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Status';
    }
  }

  async function openApplicationModal(applicationId) {
    const application = applications.find(item => String(item.id) === String(applicationId));
    if (!application) return;

    selectedApplication = application;
    const applicant = application.applicants || {};
    const job = application.jobs || {};

    $('applicationModalTitle').textContent = 'Application Details';
    $('applicationModalNumber').textContent = application.application_number ? `Application No. ${application.application_number}` : 'View complete application information';
    const modalStatus = $('applicationModalStatus');
    if (modalStatus) modalStatus.textContent = statusLabel(application.status);
    setApplicationModalMessage('');
    resetApplicationStatusForm(application.status);
    toggleInterviewForm(false);
    toggleApplicationNoteForm(false);
    loadInterviewRounds(application.id);
    loadApplicationActivity(application.id);

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

    [
      'applicationStatusFilter',
      'applicationClientFilter',
      'applicationJobFilter',
      'applicationCategoryFilter',
      'applicationLocationFilter',
      'applicationDateFrom',
      'applicationDateTo',
      'applicationInterviewResultFilter',
      'applicationSubmittedClientFilter',
      'applicationFutureConsiderationFilter'
    ].forEach(id => {
      $(id).addEventListener('change', function () {
        currentPage = 1;
        renderApplications();
      });
    });

    $('clearApplicationFiltersButton').addEventListener('click', clearApplicationFilters);
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

    $('addApplicationNoteButton').addEventListener('click', function () { toggleApplicationNoteForm(true); });
    $('cancelApplicationNoteButton').addEventListener('click', function () { toggleApplicationNoteForm(false); });
    $('applicationNoteForm').addEventListener('submit', saveApplicationNote);

    $('saveApplicationStatusButton').addEventListener('click', saveApplicationStatus);
    $('applicationStatusSelect').addEventListener('change', function () { setApplicationStatusMessage(''); });

    $('addInterviewRoundButton').addEventListener('click', function () { toggleInterviewForm(true); });
    $('cancelInterviewRoundButton').addEventListener('click', function () { toggleInterviewForm(false); });
    $('applicationInterviewsList').addEventListener('click', function (event) {
      const editButton = event.target.closest('.interview-edit-button');
      if (editButton) {
        editInterviewRound(editButton.dataset.interviewId);
        return;
      }
      const deleteButton = event.target.closest('.interview-delete-button');
      if (deleteButton) {
        deleteInterviewRound(deleteButton.dataset.interviewId);
      }
    });
    $('addInterviewRoundForm').addEventListener('submit', saveInterviewRound);

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
