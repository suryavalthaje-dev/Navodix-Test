/* Additional persistent expense edit/view and claim edit/resubmit workflows. */
(function () {
  'use strict';
  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  const esc = v => escapeHtml(v == null ? '' : String(v));
  const today = () => new Date().toISOString().slice(0, 10);
  const byExpense = id => expenses.find(x => x.dbId === id || x.id === id);
  const byClaim = id => sheets.find(x => x.dbId === id || x.id === id);
  const options = ['Office Expenses','IT Equipment','Software & Cloud','Travel & Conveyance','Utilities','Professional Fees','Marketing','Other'];
  const field = (label,id,value,type='text',extra='') => `<div class="form-field"><label for="${id}">${label}</label><input class="form-control" id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  function expenseForm(e) {
    const gstRate = Number(e?.gstRate ?? (e?.amount ? (e.gst / e.amount * 100) : 18));
    return `<div class="form-grid">
      ${field('Expense Date *','eeDate',e?.isoDate || today(),'date')}
      <div class="form-field"><label>Expense Category *</label><select class="form-control" id="eeCategory">${options.map(x=>`<option ${x===(e?.category||'Office Expenses')?'selected':''}>${x}</option>`).join('')}</select></div>
      ${field('Description *','eeDescription',e?.description||'')}
      ${field('Vendor / Supplier','eeVendor',e?.vendor==='—'?'':e?.vendor||'')}
      ${field('Invoice Number','eeInvoice',e?.invoice==='—'?'':e?.invoice||'')}
      <div class="form-field"><label>Paid By</label><input class="form-control" value="${esc(e?.paidBy||'')}" disabled></div>
      ${field('Payment Reference / Mode','eeMode',e?.reference||'')}
      ${field('Amount before GST (₹) *','eeAmount',e?.amount??'','number','min="0.01" step="0.01"')}
      <div class="form-field"><label>GST Applicable?</label><select class="form-control" id="eeGstOn"><option ${e&&Number(e.gst)>0?'selected':''}>Yes</option><option ${!e||Number(e.gst)===0?'selected':''}>No</option></select></div>
      <div class="form-field"><label>GST Rate</label><select class="form-control" id="eeGstRate">${[0,5,12,18,28].map(n=>`<option value="${n}" ${n===gstRate?'selected':''}>${n}%</option>`).join('')}</select></div>
      ${field('Supplier GSTIN','eeGstin',e?.gstin||'')}
      <div class="form-field full"><label>Remarks</label><textarea class="form-control" id="eeRemarks" rows="2">${esc(e?.remarks||'')}</textarea></div>
    </div><div class="note-box" style="margin-top:12px">Only expenses that have not been submitted, approved or reimbursed can be edited. Supporting-document upload requires the Accounts R2 bucket configuration and is not enabled in this build.</div>`;
  }
  window.editExpense = function(id) {
    const e = byExpense(id); if (!e) return;
    if (!e.isMine || !['Recorded','Unclaimed'].includes(e.status)) { toast('This expense cannot be edited in its current status.', 'error'); return; }
    showModal('Edit Expense – '+esc(e.id), expenseForm(e), `<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveExpenseEdit('${e.dbId}')">Save Changes</button>`);
  };
  window.saveExpenseEdit = async function(id) {
    try {
      const v=k=>document.getElementById(k)?.value??'';
      const amount=Number(v('eeAmount')), gstOn=v('eeGstOn')==='Yes', rate=gstOn?Number(v('eeGstRate')):0;
      if(!v('eeDate')||!v('eeDescription').trim()||!amount||amount<=0){toast('Enter a date, description and valid amount.','error');return;}
      const {error}=await db.rpc('acc_update_expense',{p_expense_id:id,p_expense_date:v('eeDate'),p_category:v('eeCategory'),p_description:v('eeDescription').trim(),p_vendor_name:v('eeVendor').trim()||null,p_bill_reference:v('eeInvoice').trim()||null,p_taxable_amount:amount,p_gst_amount:gstOn?amount*rate/100:0,p_gst_rate:rate,p_supplier_gstin:v('eeGstin').trim()||null,p_payment_reference:v('eeMode').trim()||null,p_remarks:v('eeRemarks').trim()||null});
      if(error)throw error; closeModal(true); await window.refreshExpenseData?.(); toast('Expense updated successfully.');
    } catch(e){console.error(e);toast('Unable to update expense: '+(e.message||String(e)),'error');}
  };
  const originalViewExpense=window.viewExpense;
  window.viewExpense=function(id){
    const e=byExpense(id); if(!e){return originalViewExpense?.(id);}
    showModal('Expense Details',`<div class="view-grid"><div><small>Expense Number</small><b>${esc(e.id)}</b></div><div><small>Expense Date</small><b>${esc(e.date)}</b></div><div><small>Description</small><b>${esc(e.description)}</b></div><div><small>Category</small><b>${esc(e.category)}</b></div><div><small>Vendor</small><b>${esc(e.vendor)}</b></div><div><small>Paid By</small><b>${esc(e.paidBy)}</b></div><div><small>Invoice</small><b>${esc(e.invoice)}</b></div><div><small>Status</small><b>${esc(e.status)}</b></div><div><small>Taxable Amount</small><b>${money(e.amount)}</b></div><div><small>GST</small><b>${money(e.gst)}</b></div><div><small>Gross Total</small><b>${money(e.amount+e.gst)}</b></div><div><small>Supplier GSTIN</small><b>${esc(e.gstin||'—')}</b></div><div class="full"><small>Remarks</small><b>${esc(e.remarks||'—')}</b></div></div>`, `<button class="btn btn-light" onclick="closeModal()">Close</button>${e.isMine&&['Recorded','Unclaimed'].includes(e.status)?`<button class="btn btn-primary" onclick="editExpense('${e.dbId}')">✎ Edit Expense</button>`:''}`);
  };
  function claimForm(c){
    const chosen=new Set(c.expenseDbIds||[]);
    const eligible=expenses.filter(e=>e.paidBy!=='Company'&&e.isMine&&(['Unclaimed','Recorded','Claim pending'].includes(e.status))&&(chosen.has(e.dbId)||['Unclaimed','Recorded'].includes(e.status)));
    return `<div class="form-grid"><div class="form-field"><label>Submitted By</label><input class="form-control" value="${esc(c.director)}" disabled></div><div class="form-field"><label>Claim Date *</label><input class="form-control" type="date" id="ceDate" value="${esc(c.isoDate||today())}"></div><div class="form-field full"><label>Select expenses *</label><div style="border:1px solid #dce5ed;border-radius:8px;padding:10px;max-height:260px;overflow:auto">${eligible.map(e=>`<label class="check-row" style="padding:8px 0;border-bottom:1px solid #edf1f4"><input type="checkbox" name="claimEditExpense" value="${esc(e.dbId)}" ${chosen.has(e.dbId)?'checked':''}><span style="flex:1">${esc(e.id)} · ${esc(e.description)}</span><b>${money(e.amount+e.gst)}</b></label>`).join('')||'<span class="sub-text">No eligible expenses available.</span>'}</div></div><div class="form-field full"><label>Remarks</label><textarea class="form-control" id="ceRemarks" rows="2">${esc(c.remarks||'')}</textarea></div></div><div class="note-box" style="margin-top:12px">Editing saves the claim as Draft. Submit it again to route it to the other director for approval.</div>`;
  }
  window.editSheet=function(id){
    const c=byClaim(id); if(!c)return;
    if(!c.isMine||!['Draft','Rejected','Approval Reversed'].includes(c.status)){toast('Only your draft, rejected or approval-reversed claims can be edited.','error');return;}
    showModal('Edit Expense Claim – '+esc(c.id),claimForm(c),`<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveClaimEdit('${c.dbId}')">Save Draft</button>`);
  };
  window.saveClaimEdit=async function(id){
    try{const ids=[...document.querySelectorAll('input[name="claimEditExpense"]:checked')].map(x=>x.value);if(!ids.length){toast('Select at least one expense.','error');return;}
      const {error}=await db.rpc('acc_update_expense_claim_draft',{p_claim_id:id,p_expense_ids:ids,p_claim_date:document.getElementById('ceDate').value,p_remarks:document.getElementById('ceRemarks').value.trim()||null});if(error)throw error;
      closeModal(true);await window.refreshExpenseData?.();toast('Claim changes saved as Draft. Submit the draft to send it for approval.');
    }catch(e){console.error(e);toast('Unable to save claim: '+(e.message||String(e)),'error');}
  };
  window.submitSheetAgain=async function(id){
    const c=byClaim(id);if(!c||!c.isMine){toast('Only the claim owner can resubmit this claim.','error');return;}
    if(c.status!=='Draft'){toast('Edit the rejected claim and save it as Draft before resubmitting.','error');return;}
    confirmBox('Submit expense claim?',`Submit ${c.id} for ${money(c.total)} to the other director for approval?`,async()=>{
      try{const {error}=await db.rpc('acc_resubmit_expense_claim',{p_claim_id:c.dbId});if(error)throw error;await window.refreshExpenseData?.();toast('Expense claim resubmitted for approval.');}
      catch(e){toast('Unable to submit claim: '+(e.message||String(e)),'error');}
    },'Cancel','Submit');
  };
  window.refreshExpenseData=async function(){
    // Reuse the expense module's authenticated loader through its exposed refresh hook.
    if(window.__navodixReloadExpenses)return window.__navodixReloadExpenses();
    location.reload();
  };
  ready.catch(e=>console.error('Expense workflow completion initialization failed',e));
})();
