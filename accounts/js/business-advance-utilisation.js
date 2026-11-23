/* Business Expense Advance utilisation. Adds allocations without posting a second expense or bank movement. */
(function(){
  'use strict';
  const db=window.navodixSupabase, ready=window.navodixAccountsAuthReady;
  let profile=null, rows=[], loading=false;
  const num=v=>Number(v||0), moneyFmt=v=>money(num(v)), esc=v=>escapeHtml(v==null?'':String(v));
  const dateNow=()=>new Date().toISOString().slice(0,10);
  const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw error;return data;};
  async function load(){
    if(loading)return; loading=true;
    try{
      profile=await ready;
      const {data,error}=await db.from('acc_business_advance_utilisations').select('*, acc_expenses(expense_no,expense_date,description,paid_by,taxable_amount,gst_amount), acc_director_advance_requests(request_no,requester_id,advance_type)').order('utilisation_date',{ascending:false});
      if(error)throw error; rows=data||[];
      if(typeof directorAdvances!=='undefined') directorAdvances.forEach(a=>{if(a.type==='Business Expense Advance'){const ar=rows.filter(r=>r.advance_id===a.dbId&&!r.reversed_at);const used=ar.reduce((t,r)=>t+num(r.utilised_amount),0);const returned=(a.repayments||[]).filter(r=>r.kind==='Unused Advance Return').reduce((t,r)=>t+num(r.principal),0);a.utilised=used;a.balance=Math.max(0,num(a.disbursed)-returned-used);}});
      if(typeof currentPage!=='undefined'&&currentPage==='Director Advances') refreshPanel();
    }catch(e){console.error('Advance utilisation load failed',e);}
    finally{loading=false;}
  }
  function activeAdvances(){return (typeof directorAdvances!=='undefined'?directorAdvances:[]).filter(a=>a.type==='Business Expense Advance'&&a.status==='Active'&&a.dbId&&a.requesterId===profile?.id);}
  function expenseRows(){return (typeof expenses!=='undefined'?expenses:[]).filter(e=>e.dbId&&e.paidBy!=='Company'&&e.paidByUserId===profile?.id&&['Recorded','Unclaimed'].includes(e.status));}
  function panel(){
    const active=rows.filter(r=>!r.reversed_at);
    const total=active.reduce((s,r)=>s+num(r.utilised_amount),0);
    const tr=active.map(r=>`<tr><td>${esc(r.utilisation_date)}</td><td><b>${esc(r.acc_director_advance_requests?.request_no||'—')}</b></td><td>${esc(r.acc_expenses?.expense_no||'—')}</td><td>${esc(r.acc_expenses?.description||'')}</td><td>${moneyFmt(r.utilised_amount)}</td><td>${esc(r.remarks||'—')}</td><td>${r.created_by===profile?.id?`<button class="btn btn-light btn-sm" onclick="reverseBusinessAdvanceUtilisation('${r.id}')">Reverse</button>`:'—'}</td></tr>`).join('');
    return `<section class="panel" style="margin-top:16px" id="businessAdvanceUtilisationPanel"><div class="panel-header"><div><h3>Business Advance Utilisation</h3><div class="sub-text">Allocate eligible personal expenses to an active business advance. This does not create another expense or bank entry.</div></div><button class="btn btn-primary btn-sm" onclick="openBusinessAdvanceUtilisation()">＋ Allocate Expense</button></div><div class="panel-body"><div class="summary-grid dashboard-summary-grid" style="margin-bottom:12px"><div class="summary-card"><div class="summary-label">Expenses Allocated</div><div class="summary-value">${moneyFmt(total)}</div></div><div class="summary-card"><div class="summary-label">Active Allocations</div><div class="summary-value">${active.length}</div></div></div>${tr?`<div class="table-wrap">${table(['Date','Advance','Expense','Description','Allocated','Remarks','Action'],tr)}</div>`:'<div class="empty-state">No business advance expenses allocated yet.</div>'}</div></section>`;
  }
  const baseRender=window.renderDirectorAdvances;
  if(typeof baseRender==='function') window.renderDirectorAdvances=function(){return baseRender()+panel();};
  function refreshPanel(){const old=document.getElementById('businessAdvanceUtilisationPanel');if(old)old.outerHTML=panel();}
  window.openBusinessAdvanceUtilisation=function(){
    const adv=activeAdvances(), exp=expenseRows();
    if(!adv.length){toast('There are no active business advances available for utilisation.','error');return;}
    if(!exp.length){toast('No eligible personal expenses are available. Record an expense paid by you first.','error');return;}
    showModal('Allocate Expense to Business Advance',`<div class="form-grid"><div class="form-field full"><label>Business Advance *</label><select id="bauAdvance" class="form-control">${adv.map(a=>`<option value="${esc(a.dbId)}">${esc(a.id)} · ${esc(a.purpose)} · Balance ${moneyFmt(a.balance)}</option>`).join('')}</select></div><div class="form-field full"><label>Expense *</label><select id="bauExpense" class="form-control">${exp.map(e=>`<option value="${esc(e.dbId)}">${esc(e.id)} · ${esc(e.description)} · ${moneyFmt(num(e.amount)+num(e.gst))}</option>`).join('')}</select></div><div class="form-field"><label>Utilisation Date *</label><input id="bauDate" class="form-control" type="date" value="${dateNow()}"></div><div class="form-field full"><label>Remarks</label><textarea id="bauRemarks" class="form-control" rows="2" maxlength="500"></textarea></div></div><div class="note-box" style="margin-top:10px">Only expenses paid personally by the requesting director and not already claimed or allocated can be selected. Allocation records utilisation only; it does not post a second expense or bank transaction.</div>`,`<button class="btn btn-light" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="bauSave" onclick="saveBusinessAdvanceUtilisation()">Allocate Expense</button>`);
  };
  window.saveBusinessAdvanceUtilisation=async function(){
    const advance=document.getElementById('bauAdvance')?.value,expense=document.getElementById('bauExpense')?.value,date=document.getElementById('bauDate')?.value,remarks=document.getElementById('bauRemarks')?.value||'';
    const btn=document.getElementById('bauSave');if(!advance||!expense||!date){toast('Select an advance, expense and date.','error');return;}
    if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try{await rpc('acc_record_business_advance_utilisation',{p_advance_id:advance,p_expense_id:expense,p_utilisation_date:date,p_remarks:remarks.trim()||null});await load();await window.refreshFinancialManagement?.();await window.__navodixReloadExpenses?.();closeModal();toast('Expense allocated to the business advance.');if(typeof currentPage!=='undefined'&&currentPage==='Director Advances')render();}
    catch(e){toast('Unable to allocate expense: '+(e?.message||String(e)),'error');if(btn){btn.disabled=false;btn.textContent='Allocate Expense';}}
  };
  window.reverseBusinessAdvanceUtilisation=async function(id){
    requestTextInput('Reverse expense allocation','Reason for reversing this allocation','',async reason=>{
      try{await rpc('acc_reverse_business_advance_utilisation',{p_utilisation_id:id,p_reason:reason.trim()});await load();toast('Allocation reversed.');render();}
      catch(e){toast('Unable to reverse allocation: '+(e?.message||String(e)),'error');}
    },{required:true,inputType:'textarea'});
  };
  ready.then(load).catch(e=>console.error('Advance utilisation auth failed',e));
  const priorRefresh=window.refreshFinancialManagement;
  if(typeof priorRefresh==='function') window.refreshFinancialManagement=async function(){await priorRefresh();await load();};
})();
