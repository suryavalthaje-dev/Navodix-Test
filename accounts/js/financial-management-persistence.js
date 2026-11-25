/* Navodix Accounts – Financial Management persistence integration.
 * Implements the existing prototype's Director Advances, Banking and
 * Transactions screens using Supabase. No new navigation or visual theme.
 */
(function () {
  'use strict';
  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  const originalDeleteRequest = window.deleteRequest;
  const originalWithdrawRequest = window.withdrawRequest;
  const originalUndoApproval = window.undoApproval;
  let profile = null, advances = [], bankRows = [], repaymentRows = [], disbursementRows = [], fundRows = [];
  let busy = false;
  const today = () => new Date().toISOString().slice(0,10);
  const dateText = v => v ? new Date(v + 'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const n = v => Number(v || 0);
  const fmt = v => money(n(v));
  const isPersonal = x => x.advance_type === 'Personal Advance / Director Loan';
  const activeDirector = () => profile?.director_code;
  const ownRequest = x => x.requester_id === profile?.id;
  const esc = v => escapeHtml(v == null ? '' : String(v));
  const rpc = async (name,args) => { const {data,error}=await db.rpc(name,args); if(error) throw error; return data; };

  async function loadFinancialData() {
    if (busy) return;
    busy = true;
    try {
      profile = await ready;
      const [a,b,r,f,d] = await Promise.all([
        db.from('acc_director_advance_requests').select('*').neq('status','Deleted').order('created_at',{ascending:false}),
        db.from('acc_bank_transactions').select('*').order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),
        db.from('acc_director_advance_repayments').select('*').order('transaction_date',{ascending:false}),
        db.from('acc_director_fund_contributions').select('*').order('contribution_date',{ascending:false}),
        db.from('acc_director_advance_disbursements').select('*').order('payment_date',{ascending:false})
      ]);
      for (const q of [a,b,r,f,d]) if(q.error) throw q.error;
      advances = a.data || []; bankRows = b.data || []; repaymentRows = r.data || []; fundRows = f.data || []; disbursementRows=d.data||[];
      const byId = new Map(), byDisbursed = new Map();
      repaymentRows.forEach(x=>{ if(!byId.has(x.request_id))byId.set(x.request_id,[]); byId.get(x.request_id).push(x); });
      disbursementRows.forEach(x=>{ if(!byDisbursed.has(x.request_id))byDisbursed.set(x.request_id,[]); byDisbursed.get(x.request_id).push(x); });
      advances.forEach(x=>{x.repayments=byId.get(x.id)||[];x.disbursements=byDisbursed.get(x.id)||[];});
      // Update the shared prototype collections so dashboard / quick views use persisted values.
      funds = fundRows.map(x=>({dbId:x.id,id:x.contribution_no,date:dateText(x.contribution_date),director:x.director_name,directorCode:x.director_code,type:x.contribution_type,amount:n(x.amount),ref:x.bank_reference||'—',mode:x.payment_mode,bankAccount:x.bank_account_label,remarks:x.remarks||''}));
      directorAdvances = advances.map(x=>{
        const reps=x.repayments||[], disbs=x.disbursements||[], principalPaid=reps.reduce((s,r)=>s+n(r.principal_amount),0), interestPaid=reps.reduce((s,r)=>s+n(r.interest_amount),0), disbursed=disbs.reduce((s,d)=>s+n(d.amount),0);
        const outstanding=Math.max(0,disbursed-principalPaid);
        return {id:x.request_no,dbId:x.id,requesterId:x.requester_id,date:dateText(x.created_at?.slice(0,10)),director:x.director_name,type:x.advance_type,purpose:x.purpose,requested:n(x.requested_amount),approved:n(x.approved_amount),disbursed:disbursed,utilised:0,balance:outstanding,principalOutstanding:outstanding,interestOutstanding:Math.max(0,n(x.interest_due)-interestPaid),status:x.status,interestType:x.interest_type,rate:n(x.annual_interest_rate),requiredDate:x.required_date,approvalHistory:x.approval_history||[],repayments:reps.map(r=>({date:dateText(r.transaction_date),kind:r.transaction_kind,principal:n(r.principal_amount),interest:n(r.interest_amount),amount:n(r.principal_amount),mode:r.payment_mode,reference:r.bank_reference,remarks:r.remarks}))};
      });
      bankEntries = bankRows.map(x=>({id:x.id,number:x.transaction_no,date:x.transaction_date,type:x.transaction_type,description:x.description,reference:x.bank_reference||'—',amount:n(x.amount),status:x.reconciliation_status}));
      transactions = buildTransactions();
      render();
    } catch(e) {
      console.error('Financial Management data load failed',e);
      toast('Unable to load Financial Management records: '+(e?.message||String(e)),'error');
    } finally { busy=false; }
  }

  function buildTransactions() {
    const rows=[];
    bankRows.forEach(x=>rows.push({date:dateText(x.transaction_date),name:x.description,type:'Bank '+x.transaction_type,ref:x.bank_reference||x.transaction_no,amount:x.transaction_type==='Credit'?n(x.amount):-n(x.amount)}));
    (typeof expenses!=='undefined'?expenses:[]).filter(x=>x.paidBy!=='Company').forEach(x=>rows.push({date:x.isoDate||x.date||'—',name:x.description||'Director-paid expense',type:'Director-paid expense',ref:x.id||'—',amount:-(n(x.amount)+n(x.gst))}));
    return rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
  }

  window.refreshFinancialManagement = loadFinancialData;

  // Director Advances
  window.renderDirectorAdvances = function () {
    const business=advances.filter(x=>x.advance_type==='Business Expense Advance').reduce((s,x)=>s+Math.max(0,n(x.approved_amount)-x.repayments.filter(r=>r.transaction_kind==='Unused Advance Return').reduce((a,r)=>a+n(r.principal_amount),0)),0);
    const personal=advances.filter(isPersonal).reduce((s,x)=>s+Math.max(0,n(x.approved_amount)-x.repayments.reduce((a,r)=>a+n(r.principal_amount),0)),0);
    const pending=advances.filter(x=>x.status==='Pending approval').length;
    const overdue=advances.filter(x=>x.status==='Overdue').length;
    const rows=advances.map(x=>{
      const reps=x.repayments||[], outstanding=Math.max(0,n(x.approved_amount)-reps.reduce((s,r)=>s+n(r.principal_amount),0));
      const mine=ownRequest(x), pendingApproval=x.status==='Pending approval', canReverse=x.status==='Approved – Payment Pending'&&x.approved_by===profile?.id;
      return `<tr><td><b>${esc(x.request_no)}</b><div class="sub-text">${dateText(x.created_at?.slice(0,10))}</div></td><td>${esc(x.director_name)}</td><td>${esc(x.advance_type)}</td><td>${esc(x.purpose)}</td><td>${fmt(x.requested_amount)}</td><td>${fmt(x.approved_amount)}</td><td>${fmt((x.disbursements||[]).reduce((s,d)=>s+n(d.amount),0))}</td><td>${fmt(outstanding)}</td><td>${badge(x.status)}</td><td><button class="btn btn-light btn-sm" onclick="viewAdvance('${x.id}')"<span>◉</span> View</button>${mine&&['Draft','Approval Reversed'].includes(x.status)?` <button class="btn btn-light btn-sm" onclick="editAdvance('${x.id}')"<span>✎</span> Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteRequest('advance','${x.id}')"<span>×</span> Delete</button> <button class="btn btn-primary btn-sm" onclick="resubmitAdvance('${x.id}')"<span>↻</span> Resubmit</button>`:''}${mine&&pendingApproval?` <button class="btn btn-light btn-sm" onclick="withdrawRequest('advance','${x.id}')"<span>↶</span> Withdraw</button>`:''}${pendingApproval&&!mine?` <button class="btn btn-primary btn-sm" onclick="decideAdvance('${x.id}','Approve')"<span>✓</span> Approve</button> <button class="btn btn-danger btn-sm" onclick="decideAdvance('${x.id}','Reject')"<span>✕</span> Reject</button>`:''}${canReverse?` <button class="btn btn-light btn-sm" onclick="undoApproval('advance','${x.id}')"<span>↶</span> Undo Approval</button>`:''}${(['Approved – Payment Pending','Active'].includes(x.status)&&(x.disbursements||[]).reduce((s,d)=>s+n(d.amount),0)<n(x.approved_amount))?` <button class="btn btn-primary btn-sm" onclick="openDisbursementModal('${x.id}')"<span>↗</span> Record Disbursement</button>`:''}${x.status==='Active'&&outstanding>0?` <button class="btn btn-primary btn-sm" onclick="openAdvanceRepayment('${x.id}')">${isPersonal(x)?'Record Repayment':'Record Return'}</button>`:''}</td></tr>`;
    }).join('');
    const repay=repaymentRows.map(r=>{const x=advances.find(a=>a.id===r.request_id);return `<tr><td>${dateText(r.transaction_date)}</td><td><b>${esc(x?.request_no||'—')}</b></td><td>${esc(x?.director_name||'—')}</td><td>${esc(r.transaction_kind)}</td><td>${fmt(r.principal_amount)}</td><td>${fmt(r.interest_amount)}</td><td>${esc(r.payment_mode)}</td><td>${esc(r.bank_reference||'—')}</td></tr>`}).join('');
    return `<div class="page-head"><div><h2>Director Advance Management</h2><p>Request, approve and track business advances and personal director loans.</p></div><button class="btn btn-primary" onclick="openAdvanceRequest()">＋ New Advance Request</button></div>
      <div class="summary-grid dashboard-summary-grid">${card('Business Advances Outstanding',fmt(business),'Approved amount less recorded returns','₹')}${card('Personal Loans Principal Outstanding',fmt(personal),'Principal tracked separately from interest','₹','blue')}${card('Pending Approvals',pending,'Awaiting other director review','◷','orange')}${card('Overdue Settlements',overdue,'Requires follow-up','!','purple')}</div>
      <div class="panel" style="margin-top:15px"><div class="panel-header"><h3>Advance Register</h3><span class="sub-text">${advances.length} record(s)</span></div>${advances.length?table(['Request / Date','Director','Advance Type','Purpose','Requested','Approved','Disbursed','Outstanding Principal / Balance','Status','Action'],rows):'<div class="empty-state"><div class="empty-state-title">No advance requests recorded</div><div class="sub-text">Create a business advance or personal director loan request.</div></div>'}</div>
      <div class="grid-2" style="margin-top:15px"><div class="panel"><div class="panel-header"><h3>Business Expense Advances</h3></div><div class="panel-body"><p class="sub-text">Track eligible business expenses and unused funds returned against approved advances.</p><button class="btn btn-light btn-sm" onclick="openAdvanceRequest('Business Expense Advance')">＋ Request Business Advance</button></div></div><div class="panel"><div class="panel-header"><h3>Personal Advances / Director Loans</h3></div><div class="panel-body"><p class="sub-text">Track approved interest terms and record principal and interest repayments separately.</p><button class="btn btn-light btn-sm" onclick="openAdvanceRequest('Personal Advance / Director Loan')">＋ Request Personal Loan</button></div></div></div>
      <div class="panel" style="margin-top:15px"><div class="panel-header"><h3>Repayment & Refund Register</h3></div>${repay.length?table(['Date','Advance ID','Director','Transaction Type','Principal / Returned','Interest','Payment Mode','Bank Reference'],repay):'<div class="empty-state">No repayments or returns recorded.</div>'}</div>`;
  };

  window.openAdvanceRequest = function(type='Business Expense Advance') {
    showModal('New Director Advance Request',`<div class="form-grid"><div class="form-field"><label>Requesting Director</label><input class="form-control" value="${esc(profile?.full_name)}" disabled></div>
      <div class="form-field"><label>Advance Type *</label><select class="form-control" id="advType" onchange="toggleAdvanceTerms()"><option ${type==='Business Expense Advance'?'selected':''}>Business Expense Advance</option><option ${type==='Personal Advance / Director Loan'?'selected':''}>Personal Advance / Director Loan</option></select></div>
      <div class="form-field"><label>Requested Amount (INR) *</label><input class="form-control" id="advAmount" type="number" min="0.01" step="0.01"></div>
      <div class="form-field"><label>Required Date *</label><input class="form-control" id="advDate" type="date" value="${today()}"></div>
      <div class="form-field full"><label>Purpose / Description *</label><textarea class="form-control" id="advPurpose" rows="3"></textarea></div>
      <div class="form-field full" id="advBusiness"><label>Expected business expense / settlement details</label><textarea class="form-control" id="advSettlement" rows="2"></textarea></div>
      <div class="form-field full" id="advPersonal" style="display:none"><label>Interest Type *</label><select class="form-control" id="advInterest" onchange="toggleRate()"><option>Interest-free</option><option>Interest-bearing</option></select><div id="advRateWrap" style="display:none;margin-top:8px"><label>Proposed annual interest rate (%) *</label><input class="form-control" id="advRate" type="number" min="0.01" step="0.01"></div><label style="margin-top:9px">Repayment schedule</label><select class="form-control" id="advRepay"><option>One-time repayment</option><option>Monthly instalments</option><option>Quarterly instalments</option><option>As approved</option></select></div></div>`,
      `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="saveAdvanceBtn" onclick="submitAdvanceRequest()">Submit Request</button>`);
    toggleAdvanceTerms();
  };
  window.submitAdvanceRequest = async function() {
    const type=document.getElementById('advType').value, amount=n(document.getElementById('advAmount').value), date=document.getElementById('advDate').value, purpose=document.getElementById('advPurpose').value.trim();
    if(!amount||amount<=0||!date||!purpose){toast('Enter amount, required date and purpose.','error');return;}
    const btn=document.getElementById('saveAdvanceBtn'); if(btn){btn.disabled=true;btn.textContent='Submitting…';}
    try {
      await rpc('acc_create_director_advance',{p_advance_type:type,p_purpose:purpose,p_requested_amount:amount,p_required_date:date,p_interest_type:type==='Business Expense Advance'?'Not applicable':document.getElementById('advInterest').value,p_annual_interest_rate:type==='Business Expense Advance'?0:n(document.getElementById('advRate')?.value),p_repayment_schedule:document.getElementById('advRepay')?.value||null,p_settlement_details:document.getElementById('advSettlement')?.value||null});
      await loadFinancialData(); finishModalSuccess('Director advance request submitted successfully.');
    } catch(e){toast('Unable to submit request: '+(e?.message||String(e)),'error');if(btn){btn.disabled=false;btn.textContent='Submit Request';}}
  };
  window.decideAdvance = async function(id,decision) {
    const row=advances.find(x=>x.id===id); if(!row)return;
    if(decision==='Reject'){
      requestTextInput('Reject director advance','Reason for rejection','',async reason=>{try{await rpc('acc_decide_director_advance',{p_request_id:id,p_decision:decision,p_comment:reason});await loadFinancialData();toast('Advance request rejected.');}catch(e){toast('Unable to reject request: '+e.message,'error');}},{required:true,inputType:'textarea'});
      return;
    }
    try{await rpc('acc_decide_director_advance',{p_request_id:id,p_decision:decision,p_comment:null});await loadFinancialData();toast('Advance request approved.');}
    catch(e){toast('Unable to update request: '+(e?.message||String(e)),'error');}
  };
  window.viewAdvance = function(id) {
    const x=advances.find(a=>a.id===id); if(!x)return;
    const personal=isPersonal(x), reps=x.repayments||[];
    const history=reps.map(r=>`<tr><td>${dateText(r.transaction_date)}</td><td>${esc(r.transaction_kind)}</td><td>${fmt(r.principal_amount)}</td><td>${fmt(r.interest_amount)}</td><td>${esc(r.bank_reference||'—')}</td></tr>`).join('');
    const disbHistory=(x.disbursements||[]).map(d=>`<tr><td>${dateText(d.payment_date)}</td><td>${fmt(d.amount)}</td><td>${esc(d.payment_mode)}</td><td>${esc(d.bank_reference||'—')}</td></tr>`).join('');
    showModal('Advance Request – '+x.request_no,`<div class="view-grid"><div><small>Request Number</small><b>${esc(x.request_no)}</b></div><div><small>Requesting Director</small><b>${esc(x.director_name)}</b></div><div><small>Advance Type</small><b>${esc(x.advance_type)}</b></div><div><small>Required Date</small><b>${dateText(x.required_date)}</b></div><div><small>Requested Amount</small><b>${fmt(x.requested_amount)}</b></div><div><small>Approved Amount</small><b>${fmt(x.approved_amount)}</b></div><div><small>Status</small><b>${esc(x.status)}</b></div><div><small>Interest Terms</small><b>${esc(x.interest_type)}${n(x.annual_interest_rate)?' · '+n(x.annual_interest_rate)+'% p.a.':''}</b></div><div class="full"><small>Purpose</small><b>${esc(x.purpose)}</b></div></div><h4 style="margin-top:15px">Disbursement History</h4>${disbHistory?table(['Payment Date','Amount','Payment Mode','Bank Reference'],disbHistory):'<div class="empty-state">No disbursements recorded.</div>'}<h4 style="margin-top:15px">Repayment / Return History</h4>${history?table(['Date','Type','Principal / Returned','Interest','Reference'],history):'<div class="empty-state">No repayment or return history.</div>'}`,
      `<button class="btn btn-light" onclick="closeModal()">Close</button>${x.status==='Pending approval'&&x.requester_id!==profile?.id?`<button class="btn btn-primary" onclick="decideAdvance('${x.id}','Approve')"<span>✓</span> Approve</button><button class="btn btn-danger" onclick="decideAdvance('${x.id}','Reject')"<span>✕</span> Reject</button>`:''}${x.status==='Approved – Payment Pending'&&x.approved_by===profile?.id?`<button class="btn btn-light" onclick="undoApproval('advance','${x.id}')"<span>↶</span> Undo Approval</button>`:''}${(['Approved – Payment Pending','Active'].includes(x.status)&&(x.disbursements||[]).reduce((s,d)=>s+n(d.amount),0)<n(x.approved_amount))?`<button class="btn btn-primary" onclick="openDisbursementModal('${x.id}')"<span>↗</span> Record Disbursement</button>`:''}${x.status==='Active'&&ownRequest(x)?`<button class="btn btn-primary" onclick="openAdvanceRepayment('${x.id}')">${personal?'Record Repayment':'Record Return'}</button>`:''}`);
  };
  window.editAdvance = function(id) {
    const x=advances.find(a=>a.id===id); if(!x||x.requester_id!==profile?.id||!['Draft','Approval Reversed'].includes(x.status))return;
    showModal('Edit Director Advance',`<div class="form-grid"><div class="form-field"><label>Requested Amount (INR) *</label><input class="form-control" id="editAdvAmount" type="number" min="0.01" step="0.01" value="${n(x.requested_amount)}"></div><div class="form-field"><label>Required Date *</label><input class="form-control" id="editAdvDate" type="date" value="${x.required_date}"></div><div class="form-field full"><label>Purpose / Description *</label><textarea class="form-control" id="editAdvPurpose" rows="3">${esc(x.purpose)}</textarea></div></div>`,
      `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveAdvanceEdit('${x.id}')">Save Changes</button>`);
  };
  window.saveAdvanceEdit = async function(id) {
    const x=advances.find(a=>a.id===id); if(!x)return;
    try { await rpc('acc_edit_director_advance',{p_request_id:id,p_requested_amount:n(document.getElementById('editAdvAmount').value),p_required_date:document.getElementById('editAdvDate').value,p_purpose:document.getElementById('editAdvPurpose').value.trim()}); await loadFinancialData(); finishModalSuccess('Advance request updated.'); }
    catch(e){toast('Unable to update request: '+(e?.message||String(e)),'error');}
  };
  window.resubmitAdvance = async id => {try{await rpc('acc_change_director_advance_status',{p_request_id:id,p_action:'Resubmit',p_reason:null});await loadFinancialData();toast('Request resubmitted for approval.');}catch(e){toast(e.message,'error');}};
  window.deleteRequest = async function(kind,id) {
    if(kind==='claim') {
      const claim = sheets.find(x => x.id === id);
      if(!claim || !claim.isMine || !['Draft','Approval Reversed'].includes(claim.status)) {
        toast('Only your Draft or Approval Reversed claim can be deleted.','error'); return;
      }
      confirmBox('Delete expense claim?',`Delete ${id}? The claim will be logically deleted; its approval history and supporting documents will be retained.`,async()=>{
        try {
          const {error}=await db.rpc('acc_delete_expense_claim',{p_claim_id:claim.dbId});
          if(error) throw error;
          await window.refreshExpenseData?.();
          toast('Expense claim deleted. Its financial and audit history has been retained.');
        } catch(e) { toast('Unable to delete expense claim: '+(e?.message||String(e)),'error'); }
      },'Cancel','Delete','danger');
      return;
    }
    if(kind!=='advance'){ if(typeof originalDeleteRequest==='function')return originalDeleteRequest(kind,id); return; }
    confirmBox('Delete advance request?','This request will be marked as deleted and retained in the audit history.',async()=>{try{await rpc('acc_change_director_advance_status',{p_request_id:id,p_action:'Delete',p_reason:null});await loadFinancialData();toast('Advance request deleted.');}catch(e){toast('Unable to delete request: '+e.message,'error');}},'Cancel','Delete','danger');
  };
  window.withdrawRequest = async function(kind,id) {
    if(kind!=='advance'){ if(typeof originalWithdrawRequest==='function')return originalWithdrawRequest(kind,id); return; }
    try{await rpc('acc_change_director_advance_status',{p_request_id:id,p_action:'Withdraw',p_reason:null});await loadFinancialData();toast('Request withdrawn to Draft.');}catch(e){toast('Unable to withdraw request: '+e.message,'error');}
  };
  window.undoApproval = function(kind,id) {
    if(kind!=='advance'){ if(typeof originalUndoApproval==='function')return originalUndoApproval(kind,id); return; }
    requestTextInput('Undo approval','Reason for reversing this approval','',async reason=>{
      try{await rpc('acc_change_director_advance_status',{p_request_id:id,p_action:'Undo Approval',p_reason:reason});await loadFinancialData();toast('Approval reversed.');}
      catch(e){toast('Unable to reverse approval: '+e.message,'error');}
    },{required:true,inputType:'textarea'});
  };

  window.openDisbursementModal = function(id) {
    const x=advances.find(a=>a.id===id); if(!x||x.status!=='Approved – Payment Pending'&&x.status!=='Active')return;
    const already=(x.disbursements||[]).reduce((s,d)=>s+n(d.amount),0), remaining=Math.max(0,n(x.approved_amount)-already);
    showModal('Record Director Advance Disbursement',`<div class="view-grid"><div><small>Request Number</small><b>${esc(x.request_no)}</b></div><div><small>Approved Amount</small><b>${fmt(x.approved_amount)}</b></div><div><small>Previously Disbursed</small><b>${fmt(already)}</b></div><div><small>Remaining Approved Amount</small><b>${fmt(remaining)}</b></div></div><div class="form-grid" style="margin-top:14px"><div class="form-field"><label>Payment Date *</label><input class="form-control" type="date" id="disbDate" value="${today()}"></div><div class="form-field"><label>Amount (₹) *</label><input class="form-control" type="number" id="disbAmount" min="0.01" max="${remaining}" step="0.01"></div><div class="form-field"><label>Payment Mode *</label><select class="form-control" id="disbMode"><option>Bank Transfer</option><option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>Cheque</option><option>Cash</option></select></div><div class="form-field"><label>Bank / UTR Reference</label><input class="form-control" id="disbRef"></div></div>`,
      `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="disbSave" onclick="saveAdvanceDisbursement('${id}',${remaining})"<span>↗</span> Record Disbursement</button>`);
  };
  window.saveAdvanceDisbursement = async function(id,remaining) {
    const date=document.getElementById('disbDate').value, amount=n(document.getElementById('disbAmount').value), mode=document.getElementById('disbMode').value, ref=document.getElementById('disbRef').value.trim();
    if(!date||amount<=0||amount>remaining){toast('Enter a valid payment date and amount within the remaining approved amount.','error');return;}
    const btn=document.getElementById('disbSave');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{await rpc('acc_disburse_director_advance',{p_request_id:id,p_payment_date:date,p_amount:amount,p_payment_mode:mode,p_bank_reference:ref||null});await loadFinancialData();finishModalSuccess('Advance disbursement recorded and bank debit created.');}
    catch(e){toast('Unable to record disbursement: '+e.message,'error');if(btn){btn.disabled=false;btn.textContent='Record Disbursement';}}
  };
  window.openAdvanceRepayment = function(id) {
    const x=advances.find(a=>a.id===id);if(!x||x.status!=='Active'||!ownRequest(x))return;
    const personal=isPersonal(x),disb=(x.disbursements||[]).reduce((s,d)=>s+n(d.amount),0),paid=(x.repayments||[]).reduce((s,r)=>s+n(r.principal_amount),0),principal=Math.max(0,disb-paid);
    showModal(personal?'Record Director Loan Repayment':'Record Unused Advance Return',`<div class="view-grid"><div><small>Advance ID</small><b>${esc(x.request_no)}</b></div><div><small>Principal / Advance Outstanding</small><b>${fmt(principal)}</b></div></div><div class="form-grid" style="margin-top:14px"><div class="form-field"><label>Receipt Date *</label><input class="form-control" id="arDate" type="date" value="${today()}"></div><div class="form-field"><label>Payment Mode *</label><select class="form-control" id="arMode"><option>Bank Transfer</option><option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>Cheque</option><option>Cash</option></select></div><div class="form-field"><label>${personal?'Principal Repaid':'Unused Amount Returned'} (₹) *</label><input class="form-control" id="arPrincipal" type="number" min="0.01" max="${principal}" step="0.01"></div>${personal?`<div class="form-field"><label>Interest Paid (₹)</label><input class="form-control" id="arInterest" type="number" min="0" step="0.01" value="0"></div>`:''}<div class="form-field full"><label>Bank / UTR Reference</label><input class="form-control" id="arReference"></div><div class="form-field full"><label>Remarks</label><textarea class="form-control" id="arRemarks" rows="2"></textarea></div></div>`,
      `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="arSave" onclick="saveAdvanceRepayment('${id}',${personal},${principal})">Record ${personal?'Repayment':'Return'}</button>`);
  };
  window.saveAdvanceRepayment = async function(id,personal,principalLimit) {
    const principal=n(document.getElementById('arPrincipal').value), interest=n(document.getElementById('arInterest')?.value), date=document.getElementById('arDate').value, mode=document.getElementById('arMode').value;
    if(!date||(personal?(principal+interest<=0):(principal<=0))||principal<0||principal>principalLimit||interest<0){toast('Enter a valid date and amount within the outstanding balance.','error');return;}
    const btn=document.getElementById('arSave');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{await rpc('acc_record_director_advance_repayment',{p_request_id:id,p_transaction_date:date,p_principal_amount:principal,p_interest_amount:personal?interest:0,p_payment_mode:mode,p_bank_reference:document.getElementById('arReference').value.trim()||null,p_remarks:document.getElementById('arRemarks').value.trim()||null});await loadFinancialData();finishModalSuccess('Repayment / return recorded and bank credit created.');}
    catch(e){toast('Unable to record repayment / return: '+e.message,'error');if(btn){btn.disabled=false;btn.textContent='Record';}}
  };

  // Banking
  window.renderBanking = function() {
    const credits=bankRows.filter(x=>x.transaction_type==='Credit').reduce((s,x)=>s+n(x.amount),0);
    const debits=bankRows.filter(x=>x.transaction_type==='Debit').reduce((s,x)=>s+n(x.amount),0);
    const unreconciled=bankRows.filter(x=>x.reconciliation_status==='Unreconciled').length;
    const rows=bankRows.map(x=>`<tr><td>${dateText(x.transaction_date)}</td><td>${esc(x.transaction_no)}</td><td>${esc(x.description)}</td><td>${esc(x.transaction_type)}</td><td>${fmt(x.amount)}</td><td>${esc(x.bank_reference||'—')}</td><td>${badge(x.reconciliation_status)}</td><td>${x.reconciliation_status==='Unreconciled'?`<button class="btn btn-light btn-sm" onclick="reconcileBankTransaction('${x.id}')"<span>✓</span> Mark Reconciled</button>`:'—'}</td></tr>`).join('');
    return `<div class="page-head"><div><h2>Banking</h2><p>Company bank account and direct bank transactions.</p></div><button class="btn btn-primary" onclick="openBankEntryModal()">＋ Record Bank Transaction</button></div>
      <div class="summary-grid dashboard-summary-grid">${card('Recorded Credits',fmt(credits),'Credits entered in Accounts','↗')}${card('Recorded Debits',fmt(debits),'Debits entered in Accounts','↘','blue')}${card('Net Recorded Movement',fmt(credits-debits),'Excludes opening bank balance','₹','purple')}${card('Unreconciled Entries',unreconciled,'Awaiting statement matching','◷','orange')}</div>
      <div class="panel" style="margin-top:16px"><div class="panel-header"><h3>Primary Company Bank Account</h3>${badge('Active')}</div><div class="panel-body"><b>Primary Company Bank Account</b><p class="sub-text">One company bank account is configured in the initial prototype scope. Actual bank details and opening balance have not been supplied.</p></div></div>
      <div class="panel" style="margin-top:16px"><div class="panel-header"><h3>Bank Transactions & Reconciliation</h3><span class="sub-text">${bankRows.length} record(s)</span></div>${rows?table(['Date','Transaction No.','Description','Type','Amount','Bank Reference','Status','Action'],rows):'<div class="empty-state">No bank transactions recorded.</div>'}</div>`;
  };
  window.openBankEntryModal = function() {
    showModal('Record Bank Transaction',`<div class="form-grid"><div class="form-field"><label>Date *</label><input id="bkDate" type="date" class="form-control" value="${today()}"></div><div class="form-field"><label>Type *</label><select id="bkType" class="form-control"><option>Credit</option><option>Debit</option></select></div><div class="form-field full"><label>Description *</label><input id="bkDesc" class="form-control" maxlength="250"></div><div class="form-field"><label>Amount (₹) *</label><input id="bkAmount" type="number" min="0.01" step="0.01" class="form-control"></div><div class="form-field"><label>Bank Reference</label><input id="bkRef" class="form-control"></div><div class="form-field full"><label>Bank Account</label><input class="form-control" value="Primary Company Bank Account" disabled></div></div>`,
      `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="saveBankBtn" onclick="saveBankEntry()">Save Entry</button>`);
  };
  window.saveBankEntry = async function() {
    const date=document.getElementById('bkDate').value,type=document.getElementById('bkType').value,desc=document.getElementById('bkDesc').value.trim(),amount=n(document.getElementById('bkAmount').value),btn=document.getElementById('saveBankBtn');
    if(!date||!desc||amount<=0){toast('Enter date, description and a valid amount.','error');return;}
    if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{await rpc('acc_record_bank_transaction',{p_transaction_date:date,p_transaction_type:type,p_description:desc,p_amount:amount,p_bank_reference:document.getElementById('bkRef').value.trim()||null,p_bank_account_label:'Primary Company Bank Account'});await loadFinancialData();finishModalSuccess('Bank transaction recorded.');}
    catch(e){toast('Unable to record bank transaction: '+e.message,'error');if(btn){btn.disabled=false;btn.textContent='Save Entry';}}
  };
  window.reconcileBankTransaction = async id => {try{await rpc('acc_reconcile_bank_transaction',{p_transaction_id:id});await loadFinancialData();toast('Bank transaction marked as reconciled.');}catch(e){toast('Unable to reconcile transaction: '+e.message,'error');}};

  // Unified register: transaction rows are sourced from persisted Financial Management data.
  window.renderTransactions = function() {
    const rows=transactions.map(t=>`<tr><td>${esc(t.date)}</td><td><div class="main-text">${esc(t.name)}</div></td><td>${esc(t.type)}</td><td>${esc(t.ref)}</td><td class="${n(t.amount)>=0?'positive':'negative'}"><b>${n(t.amount)>=0?'+':'−'}${fmt(Math.abs(n(t.amount)))}</b></td></tr>`).join('');
    return `<div class="page-head"><div><h2>Transactions</h2><p>Unified view of recorded financial activity.</p></div><button class="btn btn-light" onclick="toast('Transaction export is planned in the prototype.')">⇩ Export</button></div>${rows?table(['Date','Description','Transaction Type','Reference','Amount'],rows):'<div class="empty-state">No financial transactions recorded.</div>'}`;
  };

  window.renderDashboard = function() {
    const bankNet=bankRows.reduce((s,x)=>s+(x.transaction_type==='Credit'?n(x.amount):-n(x.amount)),0);
    const capital=fundRows.reduce((s,x)=>s+n(x.amount),0);
    const expenseTotal=(typeof expenses!=='undefined'?expenses:[]).reduce((s,x)=>s+n(x.amount)+n(x.gst),0);
    const receiptTotal=bankRows.filter(x=>x.transaction_type==='Credit'&&/client receipt/i.test(x.description||'')).reduce((s,x)=>s+n(x.amount),0);
    const recent=transactions.slice(0,6).map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.name)}</td><td>${esc(t.type)}</td><td class="${n(t.amount)>=0?'positive':'negative'}">${n(t.amount)>=0?'+':'−'}${fmt(Math.abs(n(t.amount)))}</td></tr>`).join('');
    return `<div class="page-head"><div><h2>Financial Overview</h2><p>Financial activity from recorded Accounts transactions.</p></div><button class="btn btn-light" onclick="refreshFinancialManagement()">↻ Refresh</button></div>
      <div class="summary-grid">${dashboardCard('Net Recorded Bank Movement',fmt(bankNet))}${dashboardCard('Shareholder Capital',fmt(capital))}${dashboardCard('Expenses Recorded',fmt(expenseTotal))}${dashboardCard('Client Receipts',fmt(receiptTotal))}</div>
      <div class="panel-grid"><section class="panel dashboard-panel recent-transactions-panel"><div class="panel-header"><h3>Recent Transactions</h3><button class="action-link" onclick="setPage('Transactions')">View all →</button></div><div class="panel-body">${recent?table(['Date','Description','Type','Amount'],recent):'<div class="empty-state">No recorded transactions yet.</div>'}</div></section>
      <section class="panel dashboard-panel"><div class="panel-header"><h3>Pending Actions</h3></div><div class="panel-body">${advances.filter(x=>x.status==='Pending approval').length} director advance request(s) awaiting review</div></section>
      <section class="panel dashboard-panel"><div class="panel-header"><h3>Quick Actions</h3></div><div class="panel-body"><div class="quick-grid"><button class="quick-link" onclick="openExpenseModal()">＋ Add Expense</button><button class="quick-link" onclick="openFundModal()">↗ Record Funds</button><button class="quick-link" onclick="openAdvanceRequest()">＋ New Advance</button><button class="quick-link" onclick="openBankEntryModal()">₹ Bank Transaction</button></div></div></section></div>`;
  };

  // The existing auth-ready promise guarantees the authenticated profile before data access.
  ready.then(loadFinancialData).catch(e=>console.error('Financial Management initialization failed',e));
})();
