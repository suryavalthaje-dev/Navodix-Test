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
function setModal(open){ $('masterModal').classList.toggle('hidden',!open); $('masterModal').setAttribute('aria-hidden',String(!open)); document.body.classList.toggle('modal-open',open||!$('deleteMasterModal').classList.contains('hidden')); }
function setDeleteModal(open){ $('deleteMasterModal').classList.toggle('hidden',!open); $('deleteMasterModal').setAttribute('aria-hidden',String(!open)); document.body.classList.toggle('modal-open',open||!$('masterModal').classList.contains('hidden')); }
function statusPill(active){return `<span class="status-pill ${active?'status-published':'status-closed'}">${active?'Active':'Inactive'}</span>`;}
async function load(){msg(`Loading ${isClient?'clients':'job categories'}…`);try{const {data,error}=await supabase.from(table).select('*').order('display_order').order(nameField);if(error)throw error;records=data||[];render();msg('');}catch(e){console.error(e);msg(`Could not load records: ${e.message||e}`,'error');}}
function render(){const q=$(searchId).value.trim().toLowerCase(),f=$(filterId).value;const rows=records.filter(x=>(!q||`${x[codeField]} ${x[nameField]}`.toLowerCase().includes(q))&&(!f||(f==='active'?x.is_active:!x.is_active)));const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));if(currentPage>totalPages)currentPage=totalPages;const start=(currentPage-1)*PAGE_SIZE;const pageRows=rows.slice(start,start+PAGE_SIZE);$(bodyId).innerHTML=pageRows.map(x=>`<tr><td><strong class="master-code">${esc(x[codeField])}</strong></td><td>${esc(x[nameField])}</td><td>${statusPill(x.is_active)}</td><td>${esc(x.display_order)}</td><td><div class="row-actions"><button class="icon-button" data-action="edit" data-id="${x.id}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button><button class="icon-button danger-icon" data-action="delete" data-id="${x.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td></tr>`).join('');const hasRows=pageRows.length>0;$(emptyId).classList.toggle('hidden',!hasRows);$(bodyId).closest('.table-wrap').classList.toggle('hidden',!hasRows);updatePagination(rows.length,totalPages,start,pageRows.length);}
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
function openForm(item=null){resetForm();editingId=item?.id||null;$('masterModalTitle').textContent=item?`Edit ${isClient?'Client':'Job Category'}`:`Add ${isClient?'Client':'Job Category'}`;$('masterCodeLabel').textContent=isClient?'Client Code':'Category Code';$('masterNameLabel').innerHTML=(isClient?'Client Name':'Category Name')+' <span>*</span>';$('masterCode').placeholder=isClient?'Auto-generated Client Code':'Auto-generated Category Code';$('masterCode').readOnly=true;$('masterName').placeholder=isClient?'e.g. ABC Technologies':'e.g. Infrastructure';if(item){$('masterCode').value=item[codeField]||'';$('masterName').value=item[nameField]||'';$('masterStatus').value=String(item.is_active);$('masterDisplayOrder').value=item.display_order??0;}$('masterModal').classList.remove('hidden');$('masterModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');$('masterName').focus();if(!item)updateCodePreview();}
function closeForm(force=false){if(!force&&dirty&&!confirm('You have entered information. Are you sure you want to close without saving?'))return false;dirty=false;setModal(false);return true;}
async function save(e){e.preventDefault();if(saving)return;const name=$('masterName').value.trim(),active=$('masterStatus').value==='true',order=Math.max(0,parseInt($('masterDisplayOrder').value||'0',10));if(!name){fmsg('Please complete all required fields.','error');return;}if(!editingId&&!$('masterCode').value){fmsg('A unique code could not be generated from this name. Please use a longer or different name.','error');return;}saving=true;const b=$('saveMasterButton');b.disabled=true;b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…';try{let q;if(editingId){const payload=isClient?{client_name:name,is_active:active,display_order:order,updated_at:new Date().toISOString()}:{category_name:name,is_active:active,display_order:order,updated_at:new Date().toISOString()};q=supabase.from(table).update(payload).eq('id',editingId);}else{const payload=isClient?{client_name:name,is_active:active,display_order:order}:{category_name:name,is_active:active,display_order:order};q=supabase.from(table).insert(payload);}const {error}=await q;if(error)throw error;dirty=false;setModal(false);msg(editingId?'Record updated successfully.':'Record added successfully.','success');await load();}catch(err){console.error(err);fmsg(`Could not save record: ${err.message||err}`,'error');}finally{saving=false;b.disabled=false;b.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save';}}
function askDelete(id){const item=records.find(x=>x.id===id);if(!item)return;deleteTarget=id;$('deleteMasterText').textContent=`“${item[nameField]}” will be permanently removed if it has not been used by a job.`;setDeleteModal(true);}
async function del(){if(!deleteTarget)return;const b=$('confirmMasterDeleteButton');b.disabled=true;b.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Deleting…';try{const {error}=await supabase.from(table).delete().eq('id',deleteTarget);if(error)throw error;setDeleteModal(false);msg('Record deleted successfully.','success');deleteTarget=null;await load();}catch(e){console.error(e);setDeleteModal(false);msg(`Could not delete record. If it is already used by a job, make it Inactive instead. ${e.message||e}`,'error');}finally{b.disabled=false;b.innerHTML='<i class="fa-solid fa-trash"></i> Delete';}}
function bind(){$(addButtonId).addEventListener('click',()=>openForm());$('closeMasterModal').addEventListener('click',()=>closeForm());$('cancelMasterButton').addEventListener('click',()=>closeForm());$('masterForm').addEventListener('submit',save);$('masterForm').addEventListener('input',e=>{dirty=true;if(e.target.id==='masterName')updateCodePreview();});$('masterForm').addEventListener('change',()=>dirty=true);$(searchId).addEventListener('input',()=>{currentPage=1;render();});$(filterId).addEventListener('change',()=>{currentPage=1;render();});$(refreshId).addEventListener('click',()=>{currentPage=1;load();});$('masterFirst').addEventListener('click',()=>goToPage(1));$('masterPrev').addEventListener('click',()=>goToPage(currentPage-1));$('masterNext').addEventListener('click',()=>goToPage(currentPage+1));$('masterLast').addEventListener('click',()=>goToPage(999999));$(bodyId).addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const item=records.find(x=>x.id===b.dataset.id);if(b.dataset.action==='edit')openForm(item);else askDelete(b.dataset.id);});$('cancelMasterDeleteButton').addEventListener('click',()=>setDeleteModal(false));$('confirmMasterDeleteButton').addEventListener('click',del);$('masterModal').addEventListener('click',e=>{if(e.target===$('masterModal'))return;});$('deleteMasterModal').addEventListener('click',e=>{if(e.target===$('deleteMasterModal'))return;});document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('masterModal').classList.contains('hidden'))closeForm();else if(!$('deleteMasterModal').classList.contains('hidden'))setDeleteModal(false);});}
document.addEventListener('DOMContentLoaded',async()=>{bind();const allowed=await window.navodixAdminReady;if(allowed===false)return;await load();});
})();