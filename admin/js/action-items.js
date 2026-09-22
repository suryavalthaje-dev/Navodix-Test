(function(){
'use strict';
const supabase=window.navodixSupabase;
let items=[],assignees=[],projects=[],selected=null,saving=false,returnToDetailAfterForm=false,quickFilter='';
let currentUser=null,currentUserAssigneeId=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const labels={pending:'Pending',in_progress:'In Progress',on_hold:'On Hold',completed:'Completed',cancelled:'Cancelled',high:'High',medium:'Medium',low:'Low'};
const statusClass={pending:'status-draft',in_progress:'status-published',on_hold:'status-paused',completed:'status-published',cancelled:'status-closed'};
function msg(t,type=''){ $('actionItemsMessage').textContent=t||'';$('actionItemsMessage').className='admin-message'+(type?' '+type:''); }
function fmsg(t,type=''){ $('actionFormMessage').textContent=t||'';$('actionFormMessage').className='admin-message'+(type?' '+type:''); }
function formatDate(d){if(!d)return '—';const [y,m,day]=String(d).slice(0,10).split('-');return day&&m&&y?`${day}/${m}/${y}`:d;}
function formatDateOnlyLocal(v){if(!v)return '—';const date=new Date(v);if(Number.isNaN(date.getTime()))return formatDate(v);return date.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'});}
function formatDateTime(v){if(!v)return '—';return new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function populateSelect(id,data,placeholder){const el=$(id);const current=el.value;el.innerHTML=`<option value="">${placeholder}</option>`+data.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');if(data.some(x=>x.id===current))el.value=current;}
async function load(){
  msg('Loading action items…');
  try{
    const [userResult,aResult,pResult,iResult,mResult]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('action_item_assignees').select('id,name,email,is_active').order('name'),
      supabase.from('projects_areas').select('id,name,is_active').order('name'),
      supabase.from('action_items').select('*,project:project_area_id(id,name),assignee:assigned_to(id,name,is_active)').order('updated_at',{ascending:false}),
      supabase.from('action_item_assignee_map').select('action_item_id,assignee_id,responsibility_type,created_at').order('created_at')
    ]);
    if(userResult.error)throw userResult.error;
    if(aResult.error)throw aResult.error;
    if(pResult.error)throw pResult.error;
    if(iResult.error)throw iResult.error;
    if(mResult.error)throw mResult.error;
    currentUser=userResult.data?.user||null;
    assignees=aResult.data||[];
    projects=pResult.data||[];
    const mapRows=mResult.data||[];
    const byId=new Map(assignees.map(x=>[x.id,x]));
    const grouped=new Map();
    mapRows.forEach(r=>{if(!grouped.has(r.action_item_id))grouped.set(r.action_item_id,[]);const a=byId.get(r.assignee_id);if(a)grouped.get(r.action_item_id).push({...a,responsibility_type:r.responsibility_type||null,created_at:r.created_at});});
    items=(iResult.data||[]).map(x=>{
      let assignedPeople=grouped.get(x.id)||[];
      assignedPeople=[...assignedPeople].sort((a,b)=>{const ar=a.responsibility_type==='primary'?0:1;const br=b.responsibility_type==='primary'?0:1;return ar-br||String(a.created_at||'').localeCompare(String(b.created_at||''));});
      if(!assignedPeople.length&&x.assigned_to){const legacy=byId.get(x.assigned_to);if(legacy)assignedPeople=[{...legacy,responsibility_type:'primary'}];}
      const primary=assignedPeople.find(a=>a.responsibility_type==='primary')||assignedPeople[0]||x.assignee||null;
      const secondary=assignedPeople.filter(a=>a.id!==primary?.id);
      return {...x,assignees:assignedPeople,primaryAssignee:primary,secondaryAssignees:secondary,assignee:primary};
    });
    await resolveCurrentUserAssignee();
    populateSelect('actionAssigneeFilter',assignees.filter(x=>x.is_active),'All Assignees');
    populateSelect('actionProjectFilter',projects.filter(x=>x.is_active),'All Projects / Areas');
    populateSelect('actionPrimaryAssignee',assignees.filter(x=>x.is_active),'Select Primary Responsibility');
    populateMultiSelect('actionSecondaryAssignee',assignees.filter(x=>x.is_active));
    updateActionFilterHighlights();
    updateQuickFilterButtons();
    populateSelect('actionProject',projects.filter(x=>x.is_active),'Select Project / Area');
    render();
    msg('');
  }catch(e){console.error(e);msg(`Could not load action items: ${e.message||e}`,'error');}
}
function populateMultiSelect(id,data){
  const el=$(id);
  const selected=new Set(Array.from(el.selectedOptions||[]).map(o=>o.value));
  el.innerHTML=data.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  data.forEach(x=>{if(selected.has(x.id)){const o=el.querySelector(`option[value="${CSS.escape(x.id)}"]`);if(o)o.selected=true;}});
}
function getSelectedSecondaryIds(){return Array.from($('actionSecondaryAssignee').selectedOptions||[]).map(o=>o.value).filter(Boolean);}
function setSelectedSecondaryIds(ids){const set=new Set(ids||[]);Array.from($('actionSecondaryAssignee').options).forEach(o=>{o.selected=set.has(o.value);});}
function refreshSecondaryAssigneeOptions(selectedIds=[]){
  const primaryId=$('actionPrimaryAssignee').value;
  const current=new Set(selectedIds.length?selectedIds:getSelectedSecondaryIds());
  const data=assignees.filter(x=>x.is_active&&x.id!==primaryId);
  $('actionSecondaryAssignee').innerHTML=data.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  data.forEach(x=>{if(current.has(x.id)){const o=$('actionSecondaryAssignee').querySelector(`option[value="${CSS.escape(x.id)}"]`);if(o)o.selected=true;}});
}
function assigneeNamesHtml(x){
  const names=(x.assignees||[]).map(a=>a?.name).filter(Boolean);
  if(!names.length&&x.assignee?.name)names.push(x.assignee.name);
  if(!names.length)return 'Unassigned';
  return names.map(n=>`<div class="action-assignee-name">${esc(n)}</div>`).join('');
}
async function resolveCurrentUserAssignee(){
  currentUserAssigneeId=null;
  if(!currentUser||!assignees.length)return;
  let displayName=currentUser.user_metadata?.display_name||currentUser.user_metadata?.full_name||'';
  let adminEmail=currentUser.email||'';
  try{
    const {data,error}=await supabase.from('careers_admins').select('display_name,email').eq('user_id',currentUser.id).maybeSingle();
    if(!error&&data){displayName=data.display_name||displayName;adminEmail=data.email||adminEmail;}
  }catch(e){console.warn('Could not resolve Careers Admin details for My Incomplete Items:',e);}
  const norm=v=>String(v||'').trim().toLowerCase();
  const byEmail=norm(adminEmail);
  const byName=norm(displayName);
  const match=assignees.find(x=>x.is_active&&byEmail&&norm(x.email)===byEmail)||assignees.find(x=>x.is_active&&byName&&norm(x.name)===byName);
  currentUserAssigneeId=match?.id||null;
}

function isOpen(x){return !['completed','cancelled'].includes(x.status);}
function renderSummary(){const t=today();$('summaryTotal').textContent=items.length;$('summaryOpen').textContent=items.filter(isOpen).length;$('summaryToday').textContent=items.filter(x=>isOpen(x)&&x.due_date===t).length;$('summaryOverdue').textContent=items.filter(x=>isOpen(x)&&x.due_date&&x.due_date<t).length;$('summaryCompleted').textContent=items.filter(x=>x.status==='completed').length;}
function filtered(){const q=$('actionSearch').value.trim().toLowerCase(),s=$('actionStatusFilter').value,p=$('actionPriorityFilter').value,a=$('actionAssigneeFilter').value,pr=$('actionProjectFilter').value,d=$('actionDueDateFilter').value;return items.filter(x=>{const names=(x.assignees||[]).map(v=>v.name).join(' ');const hay=`${x.title} ${x.description||''} ${x.project?.name||''} ${names}`.toLowerCase();const incomplete=x.status==='pending'||x.status==='in_progress';const assignedIds=(x.assignees||[]).map(v=>v.id);const quickMatch=!quickFilter||(incomplete&&(quickFilter==='all-incomplete'||(quickFilter==='my-incomplete'&&currentUserAssigneeId&&assignedIds.includes(currentUserAssigneeId))));return quickMatch&&(!q||hay.includes(q))&&(!s||x.status===s)&&(!p||x.priority===p)&&(!a||assignedIds.includes(a))&&(!pr||x.project_area_id===pr)&&(!d||x.due_date===d);});}
function dueClass(x){if(!x.due_date||!isOpen(x))return '';const t=today();return x.due_date<t?' action-overdue':x.due_date===t?' action-due-today':'';}
function render(){const rows=filtered();$('actionItemsTableBody').innerHTML=rows.map(x=>`<tr class="${dueClass(x)}"><td><span class="action-title-text">${esc(x.title)}</span></td><td>${esc(x.project?.name||'—')}</td><td class="action-assignees-cell">${assigneeNamesHtml(x)}</td><td><span class="action-priority-text priority-${x.priority}">${labels[x.priority]}</span></td><td>${formatDate(x.due_date)}</td><td><span class="action-status-text status-${x.status}">${labels[x.status]||x.status}</span></td><td>${formatDateOnlyLocal(x.updated_at)}</td><td class="action-buttons-cell"><button class="btn btn-outline btn-small application-view-button action-view-button" type="button" data-action="view" data-id="${x.id}"><i class="fa-solid fa-eye" aria-hidden="true"></i> View details</button></td></tr>`).join('');$('emptyActionItems').classList.toggle('hidden',rows.length>0);$('actionItemsTableBody').closest('.table-wrap').classList.toggle('hidden',rows.length===0);renderSummary();}
function openForm(item=null,fromDetail=false){returnToDetailAfterForm=Boolean(item&&fromDetail);$('actionItemModal').classList.toggle('action-edit-overlay',returnToDetailAfterForm);$('actionItemForm').reset();$('actionItemId').value=item?.id||'';$('actionModalTitle').textContent=item?'Edit Action Item':'Add Action Item';$('actionTitle').value=item?.title||'';$('actionDescription').value=item?.description||'';$('actionProject').value=item?.project_area_id||'';const primaryId=item?.primaryAssignee?.id||item?.assignee?.id||'';$('actionPrimaryAssignee').value=primaryId;refreshSecondaryAssigneeOptions((item?.secondaryAssignees||[]).map(a=>a.id).filter(Boolean));$('actionPriority').value=item?.priority||'medium';$('actionDueDate').value=item?.due_date||'';$('actionStatus').value=item?.status||'pending';fmsg('');$('actionItemModal').classList.remove('hidden');$('actionItemModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');$('actionTitle').focus();}
function closeForm(force=false){if(saving&&!force)return;$('actionItemModal').classList.remove('action-edit-overlay');$('actionItemModal').classList.add('hidden');$('actionItemModal').setAttribute('aria-hidden','true');if(returnToDetailAfterForm&&selected){returnToDetailAfterForm=false;openDetail(selected.id);}else if(!$('actionDetailModal').classList.contains('hidden'))document.body.classList.add('modal-open');else document.body.classList.remove('modal-open');}
async function save(e){
  e.preventDefault();
  if(saving)return;
  const title=$('actionTitle').value.trim();
  const primaryAssignee=$('actionPrimaryAssignee').value||null;
  const secondaryAssigneeIds=getSelectedSecondaryIds().filter(id=>id!==primaryAssignee);
  if(!title){fmsg('Action Item is required.','error');return;}
  if(!primaryAssignee){fmsg('Please select a Primary Responsibility user.','error');return;}
  saving=true;
  const b=$('saveActionButton');
  b.disabled=true;
  b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
  try{
    const id=$('actionItemId').value||null;
    const payload={title,description:$('actionDescription').value.trim()||null,project_area_id:$('actionProject').value||null,assigned_to:primaryAssignee,priority:$('actionPriority').value,due_date:$('actionDueDate').value||null,status:$('actionStatus').value,updated_at:new Date().toISOString()};
    let actionId=id;
    if(id){
      const result=await supabase.from('action_items').update(payload).eq('id',id);
      if(result.error)throw result.error;
    }else{
      const {data:{user}}=await supabase.auth.getUser();
      const result=await supabase.from('action_items').insert({...payload,created_by:user?.id||null}).select('id').single();
      if(result.error)throw result.error;
      actionId=result.data.id;
    }
    const {error:deleteMapError}=await supabase.from('action_item_assignee_map').delete().eq('action_item_id',actionId);
    if(deleteMapError)throw deleteMapError;
    if(primaryAssignee){
      const rows=[{action_item_id:actionId,assignee_id:primaryAssignee,responsibility_type:'primary'},...secondaryAssigneeIds.map(assignee_id=>({action_item_id:actionId,assignee_id,responsibility_type:'secondary'}))];
      const {error:mapError}=await supabase.from('action_item_assignee_map').insert(rows);
      if(mapError)throw mapError;
    }
    if(id){
      await load();
      selected=items.find(x=>x.id===id)||selected;
      returnToDetailAfterForm=false;
      $('actionItemModal').classList.remove('action-edit-overlay');
      $('actionItemModal').classList.add('hidden');
      $('actionItemModal').setAttribute('aria-hidden','true');
      msg('Action item updated successfully.','success');
      if(selected)await openDetail(selected.id);else document.body.classList.remove('modal-open');
    }else{
      closeForm(true);
      msg('Action item created successfully.','success');
      await load();
    }
  }catch(e){
    console.error(e);
    fmsg(`Could not save action item: ${e.message||e}`,'error');
  }finally{
    saving=false;
    b.disabled=false;
    b.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save';
  }
}

async function deleteSelectedActionItem(){
  if(!selected)return;
  const item=selected;
  const confirmed=window.confirm(`Delete this action item?\n\n"${item.title}"\n\nThis action cannot be undone. The associated notes and history will also be deleted.`);
  if(!confirmed)return;
  const b=$('actionDetailDeleteBtn');
  b.disabled=true;
  b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';
  try{
    const {error}=await supabase.from('action_items').delete().eq('id',item.id);
    if(error)throw error;
    closeDetail();
    msg('Action item deleted successfully.','success');
    await load();
  }catch(e){
    console.error(e);
    const detailMsg=$('actionDetailMessage');
    detailMsg.textContent=`Could not delete action item: ${e.message||e}`;
    detailMsg.className='admin-message error';
  }finally{
    b.disabled=false;
    b.innerHTML='<i class="fa-solid fa-trash"></i> Delete Action Item';
  }
}

function detailItem(label,value,isHtml=false){return `<div class="application-detail-item"><span>${esc(label)}</span><strong>${isHtml?value:esc(value||'—')}</strong></div>`;}
async function openDetail(id){selected=items.find(x=>x.id===id);if(!selected)return;$('actionDetailTitle').textContent=selected.title;$('actionDetailMeta').textContent=`Last updated ${formatDateTime(selected.updated_at)}`;$('actionDetailStatus').textContent=labels[selected.status]||selected.status;$('actionDetailMessage').textContent='';$('actionDetailInfo').innerHTML=[detailItem('Project / Area',selected.project?.name),detailItem('Assigned To',assigneeNamesHtml(selected),true),detailItem('Priority',labels[selected.priority]),detailItem('Due Date',formatDate(selected.due_date)),detailItem('Status',labels[selected.status]),detailItem('Created',formatDateTime(selected.created_at)),detailItem('Last Updated',formatDateTime(selected.updated_at)),detailItem('Completed',formatDateTime(selected.completed_at))].join('');$('actionDetailDescription').textContent=selected.description||'—';$('actionNoteText').value='';$('actionNoteMessage').textContent='';$('actionNoteMessage').className='admin-message';$('actionDetailModal').classList.remove('hidden');$('actionDetailModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');await loadDetailHistory();}
function closeDetail(){if(saving)return;$('actionDetailModal').classList.add('hidden');$('actionDetailModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');selected=null;}
async function adminNames(ids){const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return{};const {data}=await supabase.from('careers_admins').select('user_id,display_name,email').in('user_id',unique);return Object.fromEntries((data||[]).map(x=>[x.user_id,x.display_name||x.email||'Admin']));}
async function loadDetailHistory(){
  if(!selected)return;
  const actionItemId=selected.id;
  $('actionNotesList').innerHTML='<div class="application-activity-empty">Loading notes…</div>';
  $('actionHistoryList').innerHTML='<div class="application-activity-empty">Loading history…</div>';

  try{
    const [{data:userData},{data:notes,error:notesError},{data:history,error:historyError}]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('action_item_notes').select('id,action_item_id,note,added_by,created_at').eq('action_item_id',actionItemId).order('created_at',{ascending:false}),
      supabase.from('action_item_history').select('id,action_item_id,activity_type,description,old_value,new_value,changed_by,created_at').eq('action_item_id',actionItemId).order('created_at',{ascending:false})
    ]);

    const currentUser=userData?.user||null;
    const currentUserName=currentUser?((currentUser.user_metadata?.display_name||currentUser.user_metadata?.full_name||currentUser.email||'Admin')):'Admin';

    if(notesError){
      $('actionNotesList').innerHTML=`<div class="application-activity-empty error">Could not load notes: ${esc(notesError.message||notesError)}</div>`;
    }else{
      const noteRows=notes||[];
      const names=await adminNames(noteRows.map(x=>x.added_by));
      $('actionNotesList').innerHTML=noteRows.length
        ? `<div class="application-activity-table-wrap"><table class="application-activity-table action-history-table"><thead><tr><th>Added By</th><th>Date / Time</th><th>Note / Update</th></tr></thead><tbody>${noteRows.map(x=>`<tr data-note-id="${esc(x.id)}"><td><strong>${esc(names[x.added_by]||(x.added_by===currentUser?.id?currentUserName:'Admin'))}</strong></td><td>${formatDateTime(x.created_at)}</td><td class="application-activity-details-cell">${esc(x.note)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="application-activity-empty">No notes or updates have been added.</div>';
    }

    if(historyError){
      $('actionHistoryList').innerHTML=`<div class="application-activity-empty error">Could not load status history: ${esc(historyError.message||historyError)}</div>`;
    }else{
      const historyRows=history||[];
      const names=await adminNames(historyRows.map(x=>x.changed_by));

      // Some Action Items may have been created before the history trigger was
      // available. In that case, still show the creation event from the
      // Action Item itself rather than incorrectly showing an empty history.
      let rows=historyRows;
      if(!rows.length && selected.created_at){
        rows=[{
          id:`fallback-created-${actionItemId}`,
          action_item_id:actionItemId,
          activity_type:'created',
          description:'Action item created',
          old_value:null,
          new_value:labels[selected.status]||selected.status||'Pending',
          changed_by:selected.created_by||null,
          created_at:selected.created_at,
          _fallback:true
        }];
      }

      $('actionHistoryList').innerHTML=rows.length
        ? `<div class="application-activity-table-wrap"><table class="application-activity-table action-history-table"><thead><tr><th>Activity</th><th>Date / Time</th><th>Details</th><th>By</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.activity_type==='created'?'Created':x.description||x.activity_type)}</strong></td><td>${formatDateTime(x.created_at)}</td><td class="application-activity-details-cell">${x.old_value?`${esc(x.old_value)} <i class="fa-solid fa-arrow-right"></i> `:''}${esc(x.new_value||'—')}</td><td>${esc(names[x.changed_by]||(x.changed_by===currentUser?.id?currentUserName:'Admin'))}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="application-activity-empty">No history is available.</div>';
    }
  }catch(e){
    console.error('Load Action Item history failed:',e);
    $('actionNotesList').innerHTML=`<div class="application-activity-empty error">Could not load notes: ${esc(e.message||e)}</div>`;
    $('actionHistoryList').innerHTML=`<div class="application-activity-empty error">Could not load status history: ${esc(e.message||e)}</div>`;
  }
}
async function addNote(e){
  e.preventDefault();
  if(!selected)return;
  const note=$('actionNoteText').value.trim();
  if(!note){
    $('actionNoteMessage').textContent='Please enter a note.';
    $('actionNoteMessage').className='admin-message error';
    return;
  }
  const b=$('addActionNoteButton');
  b.disabled=true;
  b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Adding…';
  try{
    const actionItemId=selected.id;
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError)throw userError;
    if(!user)throw new Error('Your login session could not be verified. Please sign in again.');

    const {data:savedNote,error:insertError}=await supabase
      .from('action_item_notes')
      .insert({action_item_id:actionItemId,note,added_by:user.id})
      .select('id,action_item_id,note,added_by,created_at')
      .single();
    if(insertError)throw insertError;
    if(!savedNote)throw new Error('The note was not returned after saving. Please try again.');

    $('actionNoteText').value='';
    $('actionNoteMessage').textContent='Note added successfully.';
    $('actionNoteMessage').className='admin-message success';

    // First refresh from the database. If the immediate read does not return
    // the row, render the confirmed inserted row so the user still sees what
    // was just saved instead of a misleading empty history panel.
    await loadDetailHistory();

    const {data:verifyNote,error:verifyError}=await supabase
      .from('action_item_notes')
      .select('id,action_item_id,note,added_by,created_at')
      .eq('id',savedNote.id)
      .maybeSingle();

    if(verifyError){
      console.warn('Saved note verification read failed:',verifyError);
    }else if(!verifyNote){
      console.warn('Saved note was inserted but could not be read back immediately.');
    }

    // If the list read did not include the just-saved row, make the confirmed
    // inserted note visible immediately. This does not create a second record.
    const noteList=$('actionNotesList');
    if(savedNote && !noteList.querySelector(`[data-note-id=\"${savedNote.id}\"]`)){
      const name=await adminNames([savedNote.added_by]);
      const empty=noteList.querySelector('.application-activity-empty:not(.error)');
      const tableBody=noteList.querySelector('table tbody');
      const row=`<tr data-note-id=\"${esc(savedNote.id)}\"><td><strong>${esc(name[savedNote.added_by]||user.user_metadata?.display_name||user.email||'Admin')}</strong></td><td>${formatDateTime(savedNote.created_at)}</td><td class=\"application-activity-details-cell\">${esc(savedNote.note)}</td></tr>`;
      if(tableBody){
        tableBody.insertAdjacentHTML('afterbegin',row);
      }else{
        noteList.innerHTML=`<div class=\"application-activity-table-wrap\"><table class=\"application-activity-table action-history-table\"><thead><tr><th>Added By</th><th>Date / Time</th><th>Note / Update</th></tr></thead><tbody>${row}</tbody></table></div>`;
      }
    }
  }catch(e){
    console.error('Add Action Item Note failed:',e);
    $('actionNoteMessage').textContent=`Could not add note: ${e.message||e}`;
    $('actionNoteMessage').className='admin-message error';
  }finally{
    b.disabled=false;
    b.innerHTML='<i class="fa-solid fa-plus"></i> Add Note';
  }
}
function updateActionFilterHighlights(){['actionStatusFilter','actionPriorityFilter','actionAssigneeFilter','actionProjectFilter','actionDueDateFilter'].forEach(id=>{const control=$(id);if(!control)return;control.classList.toggle('action-filter-active',Boolean(control.value));});}
function updateQuickFilterButtons(){const all=$('allIncompleteItemsButton'),mine=$('myIncompleteItemsButton');if(all)all.classList.toggle('action-quick-filter-active',quickFilter==='all-incomplete');if(mine){mine.classList.toggle('action-quick-filter-active',quickFilter==='my-incomplete');mine.title=quickFilter==='my-incomplete'&&!currentUserAssigneeId?'No active Action Item Assignee record matches your logged-in account.':'Show my Pending and In Progress action items';}}
function applyQuickFilter(type){quickFilter=type;$('actionSearch').value='';$('actionStatusFilter').value='';$('actionPriorityFilter').value='';$('actionAssigneeFilter').value='';$('actionProjectFilter').value='';$('actionDueDateFilter').value='';updateActionFilterHighlights();updateQuickFilterButtons();render();}
function clearFilters(){$('actionSearch').value='';$('actionStatusFilter').value='';$('actionPriorityFilter').value='';$('actionAssigneeFilter').value='';$('actionProjectFilter').value='';$('actionDueDateFilter').value='';quickFilter='';updateActionFilterHighlights();updateQuickFilterButtons();render();}
function bind(){$('addActionItemButton').addEventListener('click',()=>openForm());$('actionPrimaryAssignee').addEventListener('change',()=>refreshSecondaryAssigneeOptions());$('allIncompleteItemsButton').addEventListener('click',()=>applyQuickFilter('all-incomplete'));$('myIncompleteItemsButton').addEventListener('click',()=>applyQuickFilter('my-incomplete'));$('closeActionModal').addEventListener('click',closeForm);$('cancelActionButton').addEventListener('click',closeForm);$('actionItemForm').addEventListener('submit',save);$('actionSearch').addEventListener('input',()=>{quickFilter='';updateQuickFilterButtons();render();});['actionStatusFilter','actionPriorityFilter','actionAssigneeFilter','actionProjectFilter','actionDueDateFilter'].forEach(id=>$(id).addEventListener('change',()=>{quickFilter='';updateActionFilterHighlights();updateQuickFilterButtons();render();}));$('clearActionFilters').addEventListener('click',clearFilters);$('refreshActionItems').addEventListener('click',load);$('actionItemsTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='view')openDetail(b.dataset.id);});$('closeActionDetail').addEventListener('click',closeDetail);$('actionDetailCloseBtn').addEventListener('click',closeDetail);$('actionDetailEditBtn').addEventListener('click',()=>{if(!selected)return;openForm(selected,true);});$('actionDetailDeleteBtn').addEventListener('click',deleteSelectedActionItem);$('actionNoteForm').addEventListener('submit',addNote);document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('actionItemModal').classList.contains('hidden'))closeForm();else if(!$('actionDetailModal').classList.contains('hidden'))closeDetail();});}
document.addEventListener('DOMContentLoaded',async()=>{bind();const allowed=await window.navodixAdminReady;if(allowed!==false)await load();});
})();
