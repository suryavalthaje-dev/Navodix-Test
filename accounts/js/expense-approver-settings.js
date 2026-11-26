/* Navodix Accounts – per-user expense claim approver settings */
(function () {
  'use strict';
  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  const esc = value => typeof escapeHtml === 'function' ? escapeHtml(value ?? '') : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rows = [];
  let loading = false;

  function panel() {
    return `<div class="panel" id="expenseApproverSettings" style="margin:0 0 15px">
      <div class="panel-header"><div><h3>Expense Claim Approver Assignments</h3><div class="sub-text">Assign one approver to each active user. Approvers must be active Superuser or Accounts users.</div></div><button class="btn btn-light btn-sm" type="button" onclick="window.loadExpenseApproverSettings(true)">↻ Refresh</button></div>
      <div class="panel-body" id="expenseApproverSettingsBody"><div class="sub-text">Loading user assignments…</div></div>
    </div>`;
  }

  function renderRows() {
    const body = document.getElementById('expenseApproverSettingsBody');
    if (!body) return;
    const eligible = rows.filter(r => ['superuser','accounts'].includes(String(r.claimant_role || '').trim().toLowerCase()));
    if (!rows.length) { body.innerHTML = '<div class="note-box">No active users were returned.</div>'; return; }
    body.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>User</th><th>Role</th><th>Assigned Approver</th><th>Action</th></tr></thead><tbody>${rows.map(r => {
      const opts = eligible.filter(a => a.claimant_user_id !== r.claimant_user_id).map(a => `<option value="${esc(a.claimant_user_id)}" ${a.approver_user_id === a.claimant_user_id ? '' : a.approver_user_id === r.approver_user_id ? 'selected' : ''}>${esc(a.claimant_name)} · ${esc(({superuser:'Superuser',accounts:'Accounts'})[String(a.claimant_role || '').toLowerCase()] || a.claimant_role)}</option>`).join('');
      return `<tr><td><b>${esc(r.claimant_name)}</b><div class="sub-text">${esc(r.claimant_email)}</div></td><td>${esc(({superuser:'Superuser',admin:'Admin',accounts:'Accounts',employee:'Employee'})[String(r.claimant_role || '').toLowerCase()] || r.claimant_role || '—')}</td><td><select class="form-control" id="approver-${esc(r.claimant_user_id)}"><option value="">Select approver…</option>${opts}</select></td><td><button class="btn btn-primary btn-sm" type="button" onclick="window.saveExpenseClaimApprover('${esc(r.claimant_user_id)}')">Save</button></td></tr>`;
    }).join('')}</tbody></table></div><div class="note-box" style="margin-top:12px">A user cannot approve their own claims. Changing an assignment affects future submissions; submitted claims retain their recorded approver.</div>`;
  }

  window.loadExpenseApproverSettings = async function (quiet) {
    if (loading) return;
    loading = true;
    const body = document.getElementById('expenseApproverSettingsBody');
    if (body) body.innerHTML = '<div class="sub-text">Loading user assignments…</div>';
    try {
      await ready;
      const { data, error } = await db.rpc('acc_list_expense_approver_assignments');
      if (error) throw error;
      rows = data || [];
      renderRows();
      if (quiet && typeof toast === 'function') toast('Approver assignments refreshed.');
    } catch (error) {
      console.error('Unable to load expense approver assignments:', error);
      if (body) body.innerHTML = `<div class="note-box">Unable to load approver assignments: ${esc(error.message || error)}</div>`;
    } finally { loading = false; }
  };

  window.saveExpenseClaimApprover = async function (claimantId) {
    const select = document.getElementById('approver-' + claimantId);
    const approverId = select?.value;
    if (!approverId) { toast('Please select an approver.', 'error'); return; }
    if (approverId === claimantId) { toast('A user cannot approve their own claims.', 'error'); return; }
    try {
      const { error } = await db.rpc('acc_set_expense_claim_approver', {
        p_claimant_user_id: claimantId,
        p_approver_user_id: approverId
      });
      if (error) throw error;
      await window.loadExpenseApproverSettings(false);
      toast('Expense claim approver assignment saved.');
    } catch (error) {
      console.error('Unable to save expense approver assignment:', error);
      toast('Unable to save assignment: ' + (error.message || error), 'error');
    }
  };

  const originalRenderSettings = window.renderSettings;
  if (typeof originalRenderSettings === 'function') {
    window.renderSettings = function () {
      let html = originalRenderSettings();
      // Replace the prototype's obsolete director-based approval card.
      html = html.replace(/<div class="panel"><div class="panel-header"><h3>Directors & Approval Rules<\/h3>[\s\S]*?<\/div><\/div>(?=<div class="panel">)/,
        '<div class="panel"><div class="panel-header"><h3>Approval Workflow</h3></div><div class="panel-body"><div class="note-box">Expense claims are routed to the claimant’s individually assigned approver. Assignment is managed below.</div></div></div>');
      html = html.replace('</div><div class="grid-2">', `</div>${panel()}<div class="grid-2">`);
      setTimeout(() => window.loadExpenseApproverSettings(false), 0);
      return html;
    };
  }
})();
