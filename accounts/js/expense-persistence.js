/* Navodix Accounts - Expense / Claims / Reimbursements Supabase integration
 * Requires the Step 1 database migration and existing Accounts authentication.
 * Demo records are replaced by live database records after authentication.
 */
(function () {
  'use strict';

  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  let profile = null;
  let loading = false;

  const fail = (error, prefix) => {
    console.error(prefix, error);
    toast((prefix || 'Operation failed') + ': ' + (error?.message || String(error)), 'error');
  };
  const isoDate = value => value ? String(value).slice(0, 10) : '';
  const displayDate = value => value ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const statusForUi = value => value === 'Pending Approval' ? 'Pending approval' : value;
  const statusForDb = value => value === 'Pending approval' ? 'Pending Approval' : value;
  const directorKey = () => profile?.director_code === 'DIR-001' ? 'Suryanarayana' : profile?.director_code === 'DIR-002' ? 'Dinesan' : (profile?.full_name || currentDirector || 'Director');
  const directorName = () => directorKey();
  const actorId = () => profile?.id;
  const byExpenseId = id => expenses.find(x => x.dbId === id || x.id === id);

  async function loadAll() {
    if (loading) return;
    loading = true;
    try {
      profile = await ready;
      const [eRes, cRes, rRes] = await Promise.all([
        db.from('acc_expenses').select('*').is('voided_at', null).order('expense_date', { ascending: false }),
        db.from('acc_expense_claims').select('*, acc_expense_claim_items(*, acc_expenses(*)), acc_expense_claim_approvals(*)').is('deleted_at', null).order('created_at', { ascending: false }),
        db.from('acc_reimbursements').select('*').order('payment_date', { ascending: false })
      ]);
      if (eRes.error) throw eRes.error;
      if (cRes.error) throw cRes.error;
      if (rRes.error) throw rRes.error;

      expenses = (eRes.data || []).map(e => ({
        dbId: e.id, id: e.expense_no, date: displayDate(e.expense_date), isoDate: e.expense_date, isMine: e.created_by === actorId(), gstRate: Number(e.gst_rate || 0), reference: e.payment_reference || '',
        description: e.description, category: e.category, vendor: e.vendor_name || '—',
        paidBy: e.paid_by, paidByUserId: e.paid_by_user_id, amount: Number(e.taxable_amount),
        gst: Number(e.gst_amount), status: e.status, invoice: e.bill_reference || '—',
        gstin: e.supplier_gstin || '', reference: e.payment_reference || '', remarks: e.remarks || ''
      }));

      sheets = (cRes.data || []).map(c => {
        const items = c.acc_expense_claim_items || [];
        const history = (c.acc_expense_claim_approvals || []).sort((a,b) => new Date(a.action_at)-new Date(b.action_at)).map(h => ({
          action: h.action, by: h.acted_by, at: h.action_at, reason: h.reason || h.comments || ''
        }));
        return {
          dbId: c.id, id: c.claim_no, date: displayDate(c.claim_date), isoDate: c.claim_date, isMine: c.submitted_by === actorId(), director: c.submitted_by === actorId() ? directorName() : 'Other Director',
          submittedById: c.submitted_by, items: items.length, total: Number(c.total_amount), status: statusForUi(c.status),
          createdBy: c.submitted_by === actorId() ? directorName() : 'Other Director', expenseIds: items.map(i => i.acc_expenses?.expense_no).filter(Boolean),
          expenseDbIds: items.map(i => i.expense_id), expenseDetails: items.map(i => { const e=i.acc_expenses||{}; return { id:e.expense_no||'—', date:e.expense_date||null, description:e.description||'', category:e.category||'', vendor:e.vendor_name||'', amount:Number(e.taxable_amount||0), gst:Number(e.gst_amount||0), status:e.status||'' }; }), approvedById: c.approved_by, rejectedById: c.rejected_by, rejectionReason: c.rejection_reason || '',
          approvalHistory: history, remarks: c.remarks || '', submittedAt: c.submitted_at
        };
      });

      // Materialise pending balances as display rows; actual payment rows remain the persisted records.
      const paidByClaim = new Map();
      (rRes.data || []).forEach(r => paidByClaim.set(r.claim_id, (paidByClaim.get(r.claim_id) || 0) + Number(r.amount)));
      const actualRows = (rRes.data || []).map(r => {
        const claim = (cRes.data || []).find(c => c.id === r.claim_id);
        return { dbId: r.id, id: r.reimbursement_no, date: displayDate(r.payment_date), director: claim?.submitted_by === actorId() ? directorName() : 'Other Director', claim: claim?.claim_no || '—', claimDbId: r.claim_id, amount: Number(r.amount), status: 'Paid', reference: r.bank_reference || '', mode: r.payment_mode };
      });
      const pendingRows = (cRes.data || []).filter(c => ['Approved – Payment Pending','Payment Initiated'].includes(c.status)).map(c => {
        const paid = paidByClaim.get(c.id) || 0, due = Number(c.total_amount) - paid;
        return due > 0 ? { id: 'DUE-' + c.claim_no, date: displayDate(c.claim_date), director: c.submitted_by === actorId() ? directorName() : 'Other Director', claim: c.claim_no, claimDbId: c.id, amount: due, status: 'Pending payment', reference: '', mode: '' } : null;
      }).filter(Boolean);
      reimbursements = [...pendingRows, ...actualRows];
      if (profile?.director_code) currentDirector = directorKey();
      render();
      // Refresh the consolidated Financial Management registers after expense / reimbursement changes.
      window.refreshFinancialManagement?.();
    } catch (error) {
      fail(error, 'Unable to load expense data');
    } finally { loading = false; }
  }

  window.__navodixReloadExpenses = loadAll;

  window.saveExpense = async function () {
    try {
      const v = id => document.getElementById(id)?.value ?? '';
      const description = v('eDescription').trim();
      const amount = Number(v('eAmount'));
      const gstOn = v('eGstOn') === 'Yes';
      const gstRate = gstOn ? Number(v('eGstRate')) : 0;
      const gst = gstOn ? amount * gstRate / 100 : 0;
      const paidBy = v('ePaidBy');
      if (!description || !Number.isFinite(amount) || amount <= 0) { toast('Enter a description and a valid amount.', 'error'); return; }
      if (paidBy !== 'Company' && paidBy !== directorName()) {
        toast('You can record a personal expense only for yourself. The other director must record their own expense.', 'error'); return;
      }
      const payload = {
        expense_date: v('eDate'), category: v('eCategory'), description,
        vendor_name: v('eVendor').trim() || null, bill_reference: v('eInvoice').trim() || null,
        paid_by: paidBy, paid_by_user_id: paidBy === 'Company' ? null : actorId(),
        taxable_amount: amount, gst_amount: gst, gst_rate: gstRate,
        supplier_gstin: v('eGstin').trim() || null, payment_reference: v('eMode') || null,
        remarks: v('eRemarks').trim() || null, status: paidBy === 'Company' ? 'Recorded' : 'Unclaimed'
      };
      const { data: savedExpense, error } = await db.from('acc_expenses').insert(payload).select('id').single();
      if (error) throw error;
      const selectedFiles = document.getElementById('eFile')?.files;
      if (selectedFiles?.length) {
        try { await window.navodixAccountsDocuments?.uploadSelected('eFile', 'expense', savedExpense.id, 'expenseUploadStatus'); }
        catch (uploadError) {
          console.error('Expense saved but supporting-document upload failed:', uploadError);
          closeModal(true); modalDirty = false; await loadAll();
          toast('Expense saved, but document upload failed: ' + uploadError.message, 'error');
          return;
        }
      }
      closeModal(true); modalDirty = false; await loadAll(); toast('Expense saved successfully.');
    } catch (error) { fail(error, 'Unable to save expense'); }
  };

  window.openSheetModal = function () {
    const eligible = expenses.filter(e => e.paidBy !== 'Company' && e.paidByUserId === actorId() && ['Unclaimed','Recorded'].includes(e.status));
    showModal('Create Expense Sheet / Claim', `<div class="form-grid">
      <div class="form-field"><label>Submitted By</label><input class="form-control" value="${escapeHtml(directorName())}" disabled></div>
      <div class="form-field"><label>Claim Date *</label><input class="form-control" type="date" id="sDate" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-field full"><label>Select personal expenses *</label><div style="border:1px solid #dce5ed;border-radius:8px;padding:10px;max-height:240px;overflow:auto">${eligible.length ? eligible.map(e => `<label class="check-row" style="padding:8px 0;border-bottom:1px solid #edf1f4"><input type="checkbox" name="sheetExpense" value="${e.dbId}"><span style="flex:1">${escapeHtml(e.id)} · ${escapeHtml(e.description)}</span><b>${money(e.amount + e.gst)}</b></label>`).join('') : '<span class="sub-text">No unclaimed personal expenses are available.</span>'}</div></div>
      <div class="form-field full"><label>Remarks</label><textarea class="form-control" rows="2" id="sRemarks"></textarea></div></div>
      <div class="note-box" style="margin-top:12px">The claim will be submitted to the other director. Self-approval is prohibited.</div>`,
      `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveSheet()">Submit Claim</button>`);
  };

  window.saveSheet = async function () {
    try {
      const ids = [...document.querySelectorAll('input[name="sheetExpense"]:checked')].map(x => x.value);
      if (!ids.length) { toast('Select at least one expense.', 'error'); return; }
      const { data, error } = await db.rpc('acc_submit_expense_claim', { p_expense_ids: ids, p_claim_date: document.getElementById('sDate').value, p_remarks: document.getElementById('sRemarks').value.trim() || null });
      if (error) throw error;
      closeModal(true); await loadAll(); toast('Expense claim submitted for approval.');
    } catch (error) { fail(error, 'Unable to submit claim'); }
  };

  window.approveSheet = function (id) {
    const claim = sheets.find(x => x.id === id); if (!claim) return;
    showModal('Review Expense Claim – ' + id, `<div class="view-grid"><div><small>Submitted By</small><b>${escapeHtml(claim.director)}</b></div><div><small>Claim Amount</small><b>${money(claim.total)}</b></div><div><small>Expense Count</small><b>${claim.items}</b></div><div><small>Status</small><b>${escapeHtml(claim.status)}</b></div><div class="full"><small>Remarks</small><b>${escapeHtml(claim.remarks || '—')}</b></div></div><div class="note-box" style="margin-top:12px">Review the supporting expense records before approving or rejecting.</div>`,
      `<button class="btn btn-light" onclick="closeModal()">Close</button><button class="btn btn-danger" onclick="rejectSheetDb('${id}')">Reject</button><button class="btn btn-primary" onclick="approveSheetDb('${id}')">Approve</button>`);
  };

  window.approveSheetDb = async function (id) { await reviewClaim(id, 'Approve'); };
  window.rejectSheetDb = function (id) {
    requestTextInput('Reject expense claim', 'Reason for rejection', '', async reason => {
      if (!reason || !reason.trim()) { toast('A rejection reason is required.', 'error'); return; }
      await reviewClaim(id, 'Reject', reason.trim());
    }, { required: true, inputType: 'textarea' });
  };
  async function reviewClaim(id, decision, reason) {
    try {
      const claim = sheets.find(x => x.id === id); if (!claim) return;
      if (claim.submittedById === actorId()) { toast('You cannot approve or reject your own claim.', 'error'); return; }
      const { error } = await db.rpc('acc_review_expense_claim', { p_claim_id: claim.dbId, p_decision: decision, p_reason: reason || null });
      if (error) throw error;
      closeModal(true); await loadAll(); toast(decision === 'Approve' ? 'Claim approved.' : 'Claim rejected.');
    } catch (error) { fail(error, 'Unable to review claim'); }
  }

  window.undoApproval = async function (kind, id) {
    if (kind !== 'claim') { toast('This action is not available for this request type in this implementation step.', 'error'); return; }
    const claim = sheets.find(x => x.id === id); if (!claim) return;
    requestTextInput('Undo claim approval', 'Reason for reversing this approval', '', async reason => {
      if (!reason || !reason.trim()) { toast('A reason is required.', 'error'); return; }
      try { const { error } = await db.rpc('acc_reverse_expense_claim_approval', { p_claim_id: claim.dbId, p_reason: reason.trim() }); if (error) throw error; await loadAll(); toast('Claim approval reversed.'); }
      catch (error) { fail(error, 'Unable to reverse approval'); }
    }, { required: true, inputType: 'textarea' });
  };

  window.withdrawRequest = async function (kind, id) {
    if (kind !== 'claim') { toast('This action is not available for this request type in this implementation step.', 'error'); return; }
    const claim = sheets.find(x => x.id === id); if (!claim) return;
    confirmBox('Withdraw expense claim?', 'The claim will return to Draft and its expenses will become available again.', async () => {
      try { const { error } = await db.rpc('acc_withdraw_expense_claim', { p_claim_id: claim.dbId }); if (error) throw error; await loadAll(); toast('Claim withdrawn to Draft.'); }
      catch (error) { fail(error, 'Unable to withdraw claim'); }
    });
  };

  window.submitSheetAgain = function () { toast('Claim editing and resubmission are being added in the next implementation step.', 'error'); };
  window.editSheet = function () { toast('Claim editing is being added in the next implementation step.', 'error'); };

  window.openReimbursementModal = function () {
    const eligible = sheets.filter(s => ['Approved – Payment Pending','Payment Initiated'].includes(s.status) && (Number(s.total) - reimbursements.filter(r => r.claimDbId === s.dbId && r.status === 'Paid').reduce((sum,r) => sum + Number(r.amount||0),0)) > 0);
    showModal('Record Reimbursement', `<div class="form-grid"><div class="form-field full"><label>Approved Claim *</label><select class="form-control" id="rbClaim">${eligible.map(s => `<option value="${s.dbId}">${escapeHtml(s.id)} · ${escapeHtml(s.director)} · ${money(s.total)}</option>`).join('')}</select></div><div class="form-field"><label>Payment Date *</label><input class="form-control" id="rbDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="form-field"><label>Amount (₹) *</label><input class="form-control" id="rbAmount" type="number" min="0.01" step="0.01"></div><div class="form-field"><label>Payment Mode</label><select class="form-control" id="rbMode"><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Other</option></select></div><div class="form-field"><label>UTR / Bank Reference</label><input class="form-control" id="rbRef"></div><div class="form-field full"><label>Remarks</label><textarea class="form-control" id="rbRemarks" rows="2"></textarea></div></div>${eligible.length ? '' : '<div class="note-box">There are no approved claims awaiting reimbursement.</div>'}`, `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" ${eligible.length ? '' : 'disabled'} onclick="saveReimbursement()">Record Payment</button>`);
  };

  window.saveReimbursement = async function () {
    try {
      const claimId = document.getElementById('rbClaim').value;
      const amount = Number(document.getElementById('rbAmount').value);
      const claim = sheets.find(s => s.dbId === claimId);
      const alreadyPaid = reimbursements.filter(r => r.claimDbId === claimId && r.status === 'Paid').reduce((sum,r) => sum + Number(r.amount||0),0);
      const outstanding = claim ? Math.max(0, Number(claim.total) - alreadyPaid) : 0;
      if (!claimId || !Number.isFinite(amount) || amount <= 0 || amount > outstanding + 0.005) { toast('Enter a valid payment amount not exceeding the remaining approved claim balance of ' + money(outstanding) + '.', 'error'); return; }
      const { error } = await db.rpc('acc_record_reimbursement', { p_claim_id: claimId, p_payment_date: document.getElementById('rbDate').value, p_amount: amount, p_payment_mode: document.getElementById('rbMode').value, p_bank_reference: document.getElementById('rbRef').value.trim() || null, p_remarks: document.getElementById('rbRemarks').value.trim() || null });
      if (error) throw error;
      closeModal(true); await loadAll(); toast('Reimbursement payment recorded.');
    } catch (error) { fail(error, 'Unable to record reimbursement'); }
  };

  window.payReimbursement = function (id) {
    const row = reimbursements.find(x => x.id === id); if (!row || !row.claimDbId) return;
    window.openReimbursementModal();
    const claimSelect = document.getElementById('rbClaim'); if (claimSelect) claimSelect.value = row.claimDbId;
    const amount = document.getElementById('rbAmount'); if (amount) amount.value = row.amount.toFixed(2);
  };

  window.viewReimbursement = function (id) {
    const row = reimbursements.find(x => x.id === id); if (!row) return;
    showModal('Reimbursement Details', `<div class="view-grid"><div><small>Reference</small><b>${escapeHtml(row.id)}</b></div><div><small>Claim</small><b>${escapeHtml(row.claim)}</b></div><div><small>Director</small><b>${escapeHtml(row.director)}</b></div><div><small>Payment Date</small><b>${escapeHtml(row.date)}</b></div><div><small>Amount</small><b>${money(row.amount)}</b></div><div><small>Status</small><b>${escapeHtml(row.status)}</b></div><div class="full"><small>Bank Reference</small><b>${escapeHtml(row.reference || '—')}</b></div></div>`, `<button class="btn btn-light" onclick="closeModal()">Close</button>`);
  };

  const originalRender = window.render;
  window.render = function () { return originalRender.apply(this, arguments); };
  ready.then(() => loadAll()).catch(error => console.error('Accounts expense persistence initialization failed:', error));
})();
