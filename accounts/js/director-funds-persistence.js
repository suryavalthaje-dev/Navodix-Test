/* Navodix Accounts - Step 3 Director Funds persistence.
 * Uses the existing Accounts Supabase client and authenticated director profile.
 * Contributions are append-only and recorded through a server-side RPC.
 */
(function () {
  'use strict';

  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  let profile = null;
  let loading = false;
  // Do not present the prototype's illustrative contribution rows in the live Accounts session.
  funds = [];
  const dateLabel = value => value ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  }) : '—';
  const directorLabel = () => profile?.full_name || currentDirector || 'Director';

  async function loadFunds() {
    if (loading) return;
    loading = true;
    try {
      profile = await ready;
      const { data, error } = await db.from('acc_director_fund_contributions')
        .select('*').order('contribution_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      funds = (data || []).map(row => ({
        dbId: row.id,
        id: row.contribution_no,
        isoDate: row.contribution_date,
        date: dateLabel(row.contribution_date),
        director: row.director_name,
        directorCode: row.director_code,
        type: row.contribution_type,
        amount: Number(row.amount),
        ref: row.bank_reference || '—',
        mode: row.payment_mode,
        bankAccount: row.bank_account_label,
        remarks: row.remarks || ''
      }));
      render();
    } catch (error) {
      console.error('Unable to load director fund contributions', error);
      toast('Unable to load Director Funds: ' + (error?.message || String(error)), 'error');
    } finally {
      loading = false;
    }
  }

  window.renderFunds = function () {
    const total = funds.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const ownCode = profile?.director_code;
    const ownTotal = funds.filter(item => item.directorCode === ownCode).reduce((sum, item) => sum + item.amount, 0);
    const otherTotal = total - ownTotal;
    const rows = funds.map(item => `<tr>
      <td><b>${escapeHtml(item.id)}</b><div class="sub-text">${escapeHtml(item.date)}</div></td>
      <td><div class="main-text">${escapeHtml(item.director)}</div></td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.mode || '—')}</td>
      <td>${escapeHtml(item.ref)}</td>
      <td><b class="amount">${money(item.amount)}</b></td>
      <td><button class="action-link" onclick="viewFund('${item.dbId}')">View</button></td>
    </tr>`).join('');
    return `<div class="page-head"><div><h2>Director Funds</h2><p>Track director deposits recorded as Shareholder Capital, separately from Director Advances.</p></div>
      <button class="btn btn-primary" onclick="openFundModal()">＋ Record Contribution</button></div>
      <div class="summary-grid dashboard-summary-grid">
        ${card('Total Contributions', money(total), 'All recorded directors', '↗')}
        ${card('My Contributions', money(ownTotal), 'Recorded under your director profile', '◉', 'blue')}
        ${card('Other Director', money(otherTotal), 'Other director contributions', '◉', 'purple')}
        ${card('Contribution Type', 'Shareholder Capital', 'Initial configured classification', '▣', 'orange')}
      </div>
      <div class="panel" style="margin-top:18px"><div class="panel-header"><h3>Contribution Register</h3><span class="sub-text">${funds.length} record(s)</span></div>
        ${funds.length ? table(['Contribution No. / Date','Director','Contribution Type','Payment Mode','Bank Reference','Amount','Action'], rows)
          : '<div class="empty-state"><div class="empty-state-title">No contributions recorded</div><div class="sub-text">Record a director deposit to start the contribution register.</div></div>'}
      </div>
      <div class="note-box" style="margin-top:14px">Accounting note: contributions are initially classified as Shareholder Capital as agreed for this design. Confirm legal classification, corporate approvals and statutory formalities with the company’s CA before statutory posting.</div>`;
  };

  window.openFundModal = function () {
    const director = directorLabel();
    showModal('Record Shareholder Contribution', `<div class="form-grid">
      <div class="form-field"><label>Deposit Date *</label><input class="form-control" id="fDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-field"><label>Director</label><input class="form-control" value="${escapeHtml(director)}" disabled></div>
      <div class="form-field"><label>Contribution Type</label><input class="form-control" value="Shareholder Capital" disabled></div>
      <div class="form-field"><label>Amount (₹) *</label><input class="form-control" id="fAmount" type="number" min="0.01" step="0.01" placeholder="0.00"></div>
      <div class="form-field"><label>Company Bank Account</label><input class="form-control" id="fBankAccount" value="Primary Company Bank Account" disabled></div>
      <div class="form-field"><label>Payment Mode *</label><select class="form-control" id="fMode"><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Other</option></select></div>
      <div class="form-field full"><label>Bank / UTR Reference</label><input class="form-control" id="fRef" placeholder="Enter bank transaction reference"></div>
      <div class="form-field full"><label>Remarks</label><textarea class="form-control" id="fRemarks" rows="2" placeholder="Optional remarks"></textarea></div>
    </div>
    <div class="note-box" style="margin-top:14px">The contribution will be recorded against your authenticated director profile. Supporting-document upload will be connected when the dedicated Accounts R2 bucket is configured. Confirm the statutory treatment with the company’s CA.</div>`,
    `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="saveFundButton" onclick="saveFund()">Record Contribution</button>`);
  };

  window.saveFund = async function () {
    const date = document.getElementById('fDate')?.value;
    const amount = Number(document.getElementById('fAmount')?.value);
    const mode = document.getElementById('fMode')?.value;
    const button = document.getElementById('saveFundButton');
    if (!date) { toast('Select the deposit date.', 'error'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast('Enter a valid contribution amount greater than zero.', 'error'); document.getElementById('fAmount')?.focus(); return; }
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const { error } = await db.rpc('acc_record_director_fund_contribution', {
        p_contribution_date: date,
        p_amount: amount,
        p_payment_mode: mode,
        p_bank_reference: document.getElementById('fRef')?.value.trim() || null,
        p_bank_account_label: document.getElementById('fBankAccount')?.value || 'Primary Company Bank Account',
        p_remarks: document.getElementById('fRemarks')?.value.trim() || null
      });
      if (error) throw error;
      await loadFunds();
      finishModalSuccess('Director contribution recorded successfully.');
    } catch (error) {
      console.error('Unable to record director contribution', error);
      toast('Unable to record contribution: ' + (error?.message || String(error)), 'error');
      if (button?.isConnected) { button.disabled = false; button.textContent = 'Record Contribution'; }
    }
  };

  window.viewFund = function (id) {
    const item = funds.find(row => row.dbId === id);
    if (!item) return;
    showModal('Contribution Details – ' + item.id, `<div class="view-grid">
      <div><small>Contribution Number</small><b>${escapeHtml(item.id)}</b></div>
      <div><small>Deposit Date</small><b>${escapeHtml(item.date)}</b></div>
      <div><small>Director</small><b>${escapeHtml(item.director)}</b></div>
      <div><small>Contribution Type</small><b>${escapeHtml(item.type)}</b></div>
      <div><small>Amount</small><b>${money(item.amount)}</b></div>
      <div><small>Payment Mode</small><b>${escapeHtml(item.mode || '—')}</b></div>
      <div><small>Company Bank Account</small><b>${escapeHtml(item.bankAccount || '—')}</b></div>
      <div><small>Bank / UTR Reference</small><b>${escapeHtml(item.ref)}</b></div>
      <div class="full"><small>Remarks</small><b>${escapeHtml(item.remarks || '—')}</b></div>
    </div>`, `<button class="btn btn-light" onclick="closeModal()">Close</button>`);
  };

  ready.then(loadFunds).catch(error => {
    console.error('Director Funds initialization failed', error);
  });
})();
