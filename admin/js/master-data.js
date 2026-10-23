(function(){
'use strict';
const supabase=window.navodixSupabase;
const type=document.body.dataset.masterType;
const isClient=type==='clients';
let records=[],editingId=null,deleteTarget=null,dirty=false,saving=false,currentPage=1;
const PAGE_SIZE=20;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const table=isClient?'clients':'job_categories';
const codeField=isClient?'client_code':'category_code';
const nameField=isClient?'client_name':'category_name';
const searchId=isClient?'clientSearch':'categorySearch';
const filterId=isClient?'clientStatusFilter':'categoryStatusFilter';
const bodyId=isClient?'clientsTableBody':'categoriesTableBody';
const emptyId=isClient?'emptyClients':'emptyCategories';
const addButtonId=isClient?'addClientButton':'addCategoryButton';
const refreshId=isClient?'refreshClientsButton':'refreshCategoriesButton';
function msg(t,type=''){ $('masterMessage').textContent=t||''; $('masterMessage').className='admin-message'+(type?' '+type:''); }
function fmsg(t,type=''){ $('masterFormMessage').textContent=t||''; $('masterFormMessage').className='admin-message'+(type?' '+type:''); }
function setModal(open){ const el=$('masterModal'); el.classList.toggle('hidden',!open); el.style.display=open?'flex':'none'; el.setAttribute('aria-hidden',String(!open)); document.body.classList.toggle('modal-open',open||!$('deleteMasterModal').classList.contains('hidden')); }
function setDeleteModal(open){ const el=$('deleteMasterModal'); el.classList.toggle('hidden',!open); el.style.display=open?'flex':'none'; el.setAttribute('aria-hidden',String(!open)); document.body.classList.toggle('modal-open',open||!$('masterModal').classList.contains('hidden')); }
function statusPill(active){return `<span class="status-pill ${active?'status-published':'status-closed'}">${active?'Active':'Inactive'}</span>`;}
async function load(){msg(`Loading ${isClient?'clients':'job categories'}…`);try{const {data,error}=await supabase.from(table).select('*').order('display_order').order(nameField);if(error)throw error;records=data||[];render();msg('');return true;}catch(e){console.error(e);msg(`Could not load records: ${e.message||e}`,'error');return false;}}
function render(){const q=$(searchId).value.trim().toLowerCase(),f=$(filterId).value;const rows=records.filter(x=>(!q||`${x[codeField]} ${x[nameField]}`.toLowerCase().includes(q))&&(!f||(f==='active'?x.is_active:!x.is_active)));const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));if(currentPage>totalPages)currentPage=totalPages;const start=isClient?0:(currentPage-1)*PAGE_SIZE;const pageRows=rows;$(bodyId).innerHTML=pageRows.map(x=>isClient?`<tr data-record-id="${x.id}"><td><span class="client-name-value"><i class="fa-solid fa-building" aria-hidden="true"></i><span>${esc(x[nameField])}</span></span></td><td><strong class="master-code">${esc(x[codeField])}</strong></td><td>${esc(x.display_order)}</td><td>${statusPill(x.is_active)}</td></tr>`:`<tr data-record-id="${x.id}"><td><span class="md-name-value"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>${esc(x[nameField])}</span></span></td><td><strong class="master-code">${esc(x[codeField])}</strong></td><td>${esc(x.display_order)}</td><td>${statusPill(x.is_active)}</td></tr>`).join('');const hasRows=pageRows.length>0;const emptyState=$(emptyId);const tableWrap=$(bodyId).closest('.table-wrap');
// Keep the table header visible in both states. Show the empty-state only when the current filtered page has no rows.
emptyState.classList.toggle('hidden',hasRows);emptyState.style.display=hasRows?'none':'flex';
tableWrap.classList.remove('hidden');tableWrap.style.display='';
const wrap=$('masterPagination');if(wrap)wrap.remove();}
function resetForm(){editingId=null;dirty=false;$('masterForm').reset();$('masterId').value='';$('masterStatus').value='true';$('masterDisplayOrder').value='0';$('masterCode').value='';$('masterCode').readOnly=true;fmsg('');}
function generatePreviewCode(name){
  const clean=String(name||'').trim().toUpperCase().replace(/[^A-Z0-9 ]/g,'');
  if(!clean)return '';
  const words=clean.split(/\s+/).filter(Boolean);
  let base=(words[0]||'').slice(0,4);
  if(base.length<4)base=clean.replace(/[^A-Z0-9]/g,'').slice(0,4);
  if(base.length<4)return '';
  let code=base;
  const used=new Set(records.map(x=>String(x[codeField]||'').toUpperCase()).filter(Boolean));
  if(editingId){
    const current=records.find(x=>x.id===editingId);
    if(current && current[codeField]) return String(current[codeField]).toUpperCase();
  }
  if(!used.has(code))return code;
  for(let i=0;i<26;i++){
    code=base.slice(0,3)+String.fromCharCode(65+i);
    if(!used.has(code))return code;
  }
  return '';
}
function updateCodePreview(){
  if(editingId)return;
  $('masterCode').value=generatePreviewCode($('masterName').value);
  $('masterCode').setAttribute('aria-label', isClient ? 'Auto-generated Client Code' : 'Auto-generated Category Code');
}
function updatePagination(total,totalPages,start,count){const wrap=$('masterPagination');if(!wrap)return;wrap.classList.toggle('hidden',total===0);if(!total)return;$('masterPageInfo').textContent=`Showing ${start+1}-${start+count} of ${total}`;$('masterPageNumber').textContent=`Page ${currentPage} of ${totalPages}`;$('masterFirst').disabled=currentPage<=1;$('masterPrev').disabled=currentPage<=1;$('masterNext').disabled=currentPage>=totalPages;$('masterLast').disabled=currentPage>=totalPages;}function goToPage(page){const totalPages=Math.max(1,Math.ceil(records.filter(x=>{const q=$(searchId).value.trim().toLowerCase(),f=$(filterId).value;return (!q||`${x[codeField]} ${x[nameField]}`.toLowerCase().includes(q))&&(!f||(f==='active'?x.is_active:!x.is_active));}).length/PAGE_SIZE));currentPage=Math.min(Math.max(1,page),totalPages);render();}
function openForm(item=null){resetForm();editingId=item?.id||null;$('masterModalTitle').textContent=item?`Edit ${isClient?'Client':'Job Category'}`:`Add ${isClient?'Client':'Job Category'}`;$('masterCodeLabel').textContent=isClient?'Client Code':'Category Code';$('masterNameLabel').innerHTML=(isClient?'Client Name':'Category Name')+' <span>*</span>';$('masterCode').placeholder=isClient?'Auto-generated Client Code':'Auto-generated Category Code';$('masterCode').readOnly=true;$('masterName').placeholder=isClient?'e.g. ABC Technologies':'e.g. Infrastructure';if(item){$('masterCode').value=item[codeField]||'';$('masterName').value=item[nameField]||'';$('masterStatus').value=String(item.is_active);$('masterDisplayOrder').value=item.display_order??0;}$('masterModal').classList.remove('hidden');$('masterModal').style.display='flex';$('masterModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');$('masterName').focus();if(!item)updateCodePreview();}
function closeForm(force=false){if(!force&&dirty&&!confirm('You have entered information. Are you sure you want to close without saving?'))return false;dirty=false;setModal(false);return true;}
async function save(e){e.preventDefault();if(saving)return;const name=$('masterName').value.trim(),active=$('masterStatus').value==='true',order=Math.max(0,parseInt($('masterDisplayOrder').value||'0',10));if(!name){fmsg('Please complete all required fields.','error');return;}if(!editingId&&!$('masterCode').value){fmsg('A unique code could not be generated from this name. Please use a longer or different name.','error');return;}saving=true;const b=$('saveMasterButton');b.disabled=true;b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…';try{let q;if(editingId){const payload=isClient?{client_name:name,is_active:active,display_order:order,updated_at:new Date().toISOString()}:{category_name:name,is_active:active,display_order:order,updated_at:new Date().toISOString()};q=supabase.from(table).update(payload).eq('id',editingId);}else{const payload=isClient?{client_name:name,is_active:active,display_order:order}:{category_name:name,is_active:active,display_order:order};q=supabase.from(table).insert(payload);}const {error}=await q;if(error)throw error;dirty=false;setModal(false);msg(editingId?'Record updated successfully.':'Record added successfully.','success');await load();}catch(err){console.error(err);fmsg(`Could not save record: ${err.message||err}`,'error');}finally{saving=false;b.disabled=false;b.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save';}}
function askDelete(id){const item=records.find(x=>String(x.id)===String(id));if(!item)return;deleteTarget=id;$('deleteMasterText').textContent=`“${item[nameField]}” will be permanently removed if it has not been used by a job.`;setDeleteModal(true);}
async function del(){if(!deleteTarget)return;const b=$('confirmMasterDeleteButton');b.disabled=true;b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';try{const {error}=await supabase.from(table).delete().eq('id',deleteTarget);if(error)throw error;setDeleteModal(false);msg('Record deleted successfully.','success');deleteTarget=null;await load();}catch(e){console.error(e);setDeleteModal(false);msg(`Could not delete record. If it is already used by a job, make it Inactive instead. ${e.message||e}`,'error');}finally{b.disabled=false;b.innerHTML='<i class="fa-solid fa-trash"></i> Delete';}}
function bind(){document.addEventListener('navodix-master-context-action',e=>{if(!isClient&&type!=='categories')return;const item=records.find(x=>String(x.id)===String(e.detail.id));if(!item)return;if(e.detail.action==='edit')openForm(item);else if(e.detail.action==='delete')askDelete(item.id);});$(addButtonId).addEventListener('click',()=>openForm());$('closeMasterModal').addEventListener('click',()=>closeForm());$('cancelMasterButton').addEventListener('click',()=>closeForm());$('masterForm').addEventListener('submit',save);$('masterForm').addEventListener('input',e=>{dirty=true;if(e.target.id==='masterName')updateCodePreview();});$('masterForm').addEventListener('change',()=>dirty=true);$(searchId).addEventListener('input',()=>{currentPage=1;render();});$(filterId).addEventListener('change',()=>{currentPage=1;render();});$(refreshId).addEventListener('click',()=>{currentPage=1;load();});/* Pagination was removed from the Navodix Master Data list standard. Do not bind pagination controls that are no longer present; a missing control previously threw here and prevented initial loading and later modal handlers from binding. */$(bodyId).addEventListener('click',e=>{const b=e.target.closest('button[data-action][data-id]');if(!b)return;const item=records.find(x=>String(x.id)===String(b.dataset.id));if(!item)return;if(b.dataset.action==='edit')openForm(item);else if(b.dataset.action==='delete')askDelete(item.id);});if(isClient){const columnsButton=$('clientsColumnsButton'),columnsPopover=$('clientsColumnsPopover');if(columnsButton&&columnsPopover){columnsButton.addEventListener('click',e=>{e.stopPropagation();columnsPopover.classList.toggle('hidden');});columnsPopover.addEventListener('click',e=>e.stopPropagation());columnsPopover.querySelectorAll('[data-client-col]').forEach(cb=>cb.addEventListener('change',()=>{const col=Number(cb.dataset.clientCol);document.querySelectorAll('#clientsTableBody').forEach(body=>{const table=body.closest('table');if(!table)return;table.querySelectorAll('tr').forEach(row=>{const cell=row.children[col];if(cell)cell.style.display=cb.checked?'':'none';});});}));document.addEventListener('click',e=>{if(!columnsPopover.classList.contains('hidden')&&!columnsPopover.contains(e.target)&&e.target!==columnsButton)columnsPopover.classList.add('hidden');});}$(bodyId).addEventListener('contextmenu',e=>{const row=e.target.closest('tr[data-record-id]');if(!row)return;e.preventDefault();const item=records.find(x=>String(x.id)===row.dataset.recordId);if(!item)return;const menu=document.getElementById('clientRowContextMenu');if(!menu)return;menu.dataset.recordId=String(item.id);menu.style.left=Math.min(e.clientX,window.innerWidth-190)+'px';menu.style.top=Math.min(e.clientY,window.innerHeight-100)+'px';menu.classList.remove('hidden');});document.addEventListener('click',e=>{const menu=document.getElementById('clientRowContextMenu');if(menu&&!menu.contains(e.target))menu.classList.add('hidden');});const menu=document.getElementById('clientRowContextMenu');if(menu)menu.addEventListener('click',e=>{const action=e.target.closest('[data-client-action]')?.dataset.clientAction;if(!action)return;const item=records.find(x=>String(x.id)===menu.dataset.recordId);menu.classList.add('hidden');if(action==='edit')openForm(item);else if(action==='delete')askDelete(menu.dataset.recordId);});}$('cancelMasterDeleteButton').addEventListener('click',()=>{deleteTarget=null;setDeleteModal(false);});$('confirmMasterDeleteButton').addEventListener('click',del);$('masterModal').addEventListener('click',e=>{if(e.target===$('masterModal'))return;});$('deleteMasterModal').addEventListener('click',e=>{if(e.target===$('deleteMasterModal'))return;});document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('masterModal').classList.contains('hidden'))closeForm();else if(!$('deleteMasterModal').classList.contains('hidden'))setDeleteModal(false);});}
document.addEventListener('DOMContentLoaded',async()=>{
  try{
    bind();
    if(window.navodixAdminReady && typeof window.navodixAdminReady.then==='function'){
      const allowed=await window.navodixAdminReady;
      if(allowed===false)return;
    }
    // Let auth/session restoration finish before the first data query.
    if(supabase?.auth?.getSession){
      const sessionResult=await supabase.auth.getSession();
      if(sessionResult?.error)throw sessionResult.error;
    }
    await new Promise(resolve=>setTimeout(resolve,700));
    let ok=false;
    for(const delay of [0,800,1600]){
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      ok=await load();
      if(ok && records.length>0)break;
      if(ok && records.length===0 && delay===1600)break;
    }
  }catch(err){
    console.error('Job Categories initial load failed:',err);
    msg('Could not load job categories. Use Refresh to try again.','error');
  }
});
})();