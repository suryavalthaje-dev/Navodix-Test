(function(){
  'use strict';
  const supabase = window.navodixSupabase;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const requirementId = params.get('requirement');
  const requirementIds = [...new Set((params.get('requirements') || '').split(',').map(id => id.trim()).filter(Boolean))];
  const multipleRequirementsMode = !requirementId && requirementIds.length > 0;
  let currentPage = 1;
  const PAGE_SIZE = 20;
  let profiles = [], requirement = null, requirements = [], jobCategories = [], locationMaster = [], locationsLoaded = false, saving = false, keepExistingResume = true, selectedExistingResume = false, allExistingProfiles = [], profileToAssociate = null, interviewProfile = null, interviewRequirementId = '', interviewAssociationId = '', interviewRequirementLabel = '', interviewSaving = false, profileAssociationProfileId = '', profileAssociationEditId = '', editingOriginalStatus = '', editingEmploymentStatus = '', editingRelevantExperience = '', pendingDeleteProfileId = '', pendingDeleteProfileName = '', pendingDeleteInterviewId = '';
  let selectedProfileId = '';
  let activeProfileResumeObjectUrl = '';
  let selectedAssociationStatuses = [];
  let selectedRequirementFilters = [];
  const multiFilterWidgets = {};
  let associationPickerProfileId = '';
  const requirementStatuses = ['New','Shortlisted','Submitted','Interviewing','Selected','Offer Sent','Joined','On Hold','Future Consideration','Rejected','Withdrawn','Not Interested','Duplicate'];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function message(text,type=''){ $('profilesMessage').textContent=text||''; $('profilesMessage').className='admin-message'+(type?' '+type:''); }
  function profileDetailsMessage(text,type=''){ const el=$('profileDetailsMessage'); if(!el)return; el.textContent=text||''; el.className='admin-message'+(type?' '+type:''); el.classList.toggle('hidden',!text); }
  function formMessage(text,type=''){ $('profileFormMessage').textContent=text||''; $('profileFormMessage').className='admin-message'+(type?' '+type:''); }
  function updateProfileFormHero(){
    const name=$('fullName')?.value.trim()||''; const editing=Boolean($('profileId')?.value); const code=$('profileHeaderCode')?.value||'';
    const avatar=$('profileFormAvatar'), heroName=$('profileFormHeroName'), heroCode=$('profileFormHeroCode'), status=$('profileFormHeroStatus');
    if(heroName)heroName.textContent=name||(editing?'Candidate Profile':'New Profile');
    if(avatar)avatar.textContent=name?name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase():'+';
    if(heroCode)heroCode.textContent=editing?($('profileModalTitle')?.textContent.match(/PRO-[A-Z0-9-]+/)||['Profile details'])[0]:'Add candidate profile details';
    if(status)status.textContent=$('profileStatus')?.value||'New candidate';
    const metrics=[['profileHeroExperience',$('totalExperience')?.value],['profileHeroCurrentCtc',$('currentCtc')?.value],['profileHeroExpectedCtc',$('expectedCtc')?.value],['profileHeroNoticePeriod',$('noticePeriod')?.value]];
    metrics.forEach(([id,value])=>{const el=$(id);if(el)el.textContent=String(value||'').trim()||'—';});
  }
  function showModal(){
    const modal=$('profileModal');
    const firstTab=modal?.querySelector('#profileTabPersonalButton');
    const firstPanel=modal?.querySelector('#profileTabPersonal');
    const buttons=[...((modal?.querySelectorAll('[data-profile-tab]'))||[])];
    const panels=[...((modal?.querySelectorAll('.npp-tab-panel'))||[])];
    buttons.forEach(button=>{
      const active=button===firstTab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
      button.tabIndex=active?0:-1;
    });
    panels.forEach(panel=>{
      const active=panel===firstPanel;
      panel.hidden=!active;
      panel.classList.toggle('hidden',!active);
    });
    const scrollArea=$('profileModalScrollableBody');
    if(scrollArea)scrollArea.scrollTop=0;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
  }
  function focusProfileFormStart(){ const body=$('profileModal')?.querySelector('.npp-body'); if(body)body.scrollTop=0; requestAnimationFrame(()=>{ const field=$('fullName'); if(field){ field.focus(); if(typeof field.setSelectionRange==='function'){ const end=field.value.length; field.setSelectionRange(end,end); } } }); }
  function closeModal(){ if(saving)return; hideProfileModal(); }
  function hideProfileModal(){ $('profileModal').classList.add('hidden'); $('profileModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  function statusClass(s){ return ({'Available':'status-active','Considering':'status-warning','On Hold':'status-warning','Not Available':'status-danger','Not Suitable':'status-danger','Do Not Contact':'status-danger','Not Interested':'status-danger','Duplicate':'status-muted','Archived':'status-muted'})[s]||'status-info'; }
  function getLocationMasterLabel(row){ const candidates=[row?.name,row?.location,row?.location_name,row?.city,row?.title,row?.label]; const value=candidates.find(v=>typeof v==='string'&&v.trim()); return value?value.trim():''; }
  async function loadLocationMaster(){
    if(locationsLoaded)return;
    const {data,error}=await supabase.from('locations').select('*');
    if(error)throw error;
    locationMaster=[...new Set((data||[]).map(getLocationMasterLabel).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const buildOptions=(selectId,placeholder,selected='')=>{ const select=$(selectId); if(!select)return; select.innerHTML=`<option value="">${esc(placeholder)}</option>`+locationMaster.map(location=>`<option value="${esc(location)}">${esc(location)}</option>`).join(''); select.value=selected||''; };
    buildOptions('currentLocation','Select Current Location');
    buildOptions('preferredLocation','Select Preferred Location');
    locationsLoaded=true;
  }
  function populateLocationOptions(current='',preferred=''){ const buildOptions=(selectId,placeholder,selected='')=>{ const select=$(selectId); if(!select)return; select.innerHTML=`<option value="">${esc(placeholder)}</option>`+locationMaster.map(location=>`<option value="${esc(location)}">${esc(location)}</option>`).join(''); select.value=selected||''; }; buildOptions('currentLocation','Select Current Location',current); buildOptions('preferredLocation','Select Preferred Location',preferred); }
  function resetForm(){ clearCurrentAssociation(); editingEmploymentStatus=''; editingRelevantExperience=''; $('profileForm').reset(); renderJobCategories([]); $('profileModalTitle').textContent='Add Profile'; $('profileId').value=''; $('profileAssociationRequirementId').value=requirementId||''; $('profileStatus').value='New'; $('profileSource').value=''; $('profileRequirement').value=requirementId||''; $('existingProfileNotice').classList.add('hidden'); $('resumeReplaceNotice').classList.add('hidden'); $('resumeFile').value=''; $('existingResumeFilename').textContent=''; $('existingResumeFilename').title=''; $('existingResumeFilename').classList.add('hidden'); $('resumeExistingRow').classList.add('hidden'); $('resumeDocumentStatus').textContent='No resume attached'; $('resumeDocumentStatus').classList.remove('has-document'); $('resumeSelectedFileName').textContent='No file selected'; $('clearResumeSelectionButton').classList.add('hidden'); $('resumeHelp').textContent='Select a resume from your computer. Maximum 5 MB. PDF, DOC or DOCX.'; keepExistingResume=true; selectedExistingResume=false; formMessage(''); toggleReferrerFields(); updateProfileFormHero(); }
  function populateRequirementOptions(selectedId=''){ const select=$('profileRequirement'); const previous=selectedId||select.value||''; select.innerHTML='<option value="">Select Requirement</option>'+requirements.map(r=>`<option value="${esc(r.id)}">${esc(r.title||'Requirement')}${r.location?` - ${esc(r.location)}`:''}</option>`).join(''); select.value=previous; $('profileAssociationRequirementId').value=select.value||''; }
  function clearCurrentAssociation(){ const row=$('profileCurrentAssociationRow'), value=$('profileCurrentAssociationValue'); if(value)value.textContent='—'; if(row)row.classList.add('hidden'); }
  async function loadCurrentAssociation(profileId){
    clearCurrentAssociation();
    if(!profileId)return;
    const {data,error}=await supabase.from('profile_requirement_associations').select('requirement_id,associated_at').eq('profile_id',profileId).order('associated_at',{ascending:false});
    if(error)throw error;
    const ids=[...new Set((data||[]).map(a=>String(a.requirement_id||'')).filter(Boolean))];
    if(!ids.length)return;
    const byId=new Map(requirements.map(r=>[String(r.id),r]));
    const missing=ids.filter(id=>!byId.has(id));
    if(missing.length){ const {data:extra,error:extraError}=await supabase.from('jobs').select('id,job_code,title,location').in('id',missing); if(extraError)throw extraError; (extra||[]).forEach(r=>byId.set(String(r.id),r)); }
    const names=ids.map(id=>{const r=byId.get(id);return r?(r.title||r.job_code||'Requirement'):'Requirement';});
    const value=$('profileCurrentAssociationValue'),row=$('profileCurrentAssociationRow');
    if(value)value.textContent=names.join(', ');
    if(row)row.classList.toggle('hidden',!names.length);
  }
  function toggleReferrerFields(){ const source=$('profileSource').value; const show=['Refer a Candidate','Employee Referral','Client Reference'].includes(source); $('referrerFields').classList.toggle('hidden',!show); if(!show){$('referrerName').value='';$('referrerMobile').value='';$('referrerEmail').value='';} }
  function openAdd(){ resetForm(); populateRequirementOptions(requirementId||''); if(requirement){ $('profileRequirement').value=requirement.id; $('profileAssociationRequirementId').value=requirement.id; $('existingProfileNotice').innerHTML='<strong>Requirement:</strong> '+esc(requirement.job_code)+' — '+esc(requirement.title)+'<br><small>This profile will be automatically associated with this requirement when saved.</small>'; $('existingProfileNotice').classList.remove('hidden'); } updateProfileFormHero(); showModal(); focusProfileFormStart(); }
  async function loadJobCategories(){
    const {data,error}=await supabase.from('job_categories').select('id,category_code,category_name').order('category_name',{ascending:true});
    if(error){ console.warn('Could not load job categories:',error); jobCategories=[]; renderJobCategories([]); return; }
    jobCategories=data||[]; renderJobCategories();
  }
  function renderJobCategories(selected=[]){
    const box=$('profileCategoryList'); if(!box)return; const selectedSet=new Set((selected||[]).map(String));
    if(!jobCategories.length){ box.innerHTML='<span class="profile-category-empty">No job categories available.</span>'; return; }
    box.innerHTML=jobCategories.map(c=>`<label class="profile-category-item"><input type="checkbox" value="${esc(c.id)}" ${selectedSet.has(String(c.id))?'checked':''}> <span>${esc(c.category_name||'')}</span></label>`).join('');
  }
  function selectedJobCategories(){ return Array.from(document.querySelectorAll('#profileCategoryList input[type="checkbox"]:checked')).map(x=>x.value); }
  async function saveProfileCategories(profileId){
    if(!profileId)return;
    const selected=selectedJobCategories();
    const {error:delError}=await supabase.from('profile_categories').delete().eq('profile_id',profileId); if(delError)throw delError;
    if(selected.length){ const rows=selected.map(category_id=>({profile_id:profileId,category_id})); const {error:insError}=await supabase.from('profile_categories').insert(rows); if(insError)throw insError; }
  }
  async function getProfileCategories(profileId){
    const {data,error}=await supabase.from('profile_categories').select('category_id').eq('profile_id',profileId); if(error)throw error; return (data||[]).map(x=>x.category_id);
  }

  async function loadRequirement(){ if(!requirementId)return; const {data,error}=await supabase.from('jobs').select('id,job_code,title,location,status').eq('id',requirementId).maybeSingle(); if(error)throw error; requirement=data; if(data){ $('associateExistingButton').classList.remove('hidden'); $('backToRequirementsButton').classList.remove('hidden'); $('profilesPageSubtitle').classList.add('hidden'); const requirementContext=[data.title||'Requirement',data.location].filter(value=>String(value||'').trim()).join(' - '); $('profileRequirementContext').textContent=requirementContext; $('profileRequirementContext').style.setProperty('color','#16834A','important'); $('profileRequirementContext').style.setProperty('font-size','12px','important'); $('profileRequirementContext').style.setProperty('font-weight','500','important'); $('profileRequirementContext').classList.remove('hidden'); const listHeading=$('profilesListTitle'); if(listHeading){ const requirementName=data.title||'Requirement'; const requirementLocation=String(data.location||'').trim(); listHeading.replaceChildren(); const primaryTitle=document.createElement('span'); primaryTitle.textContent='Candidate Profiles'; primaryTitle.style.fontSize=''; primaryTitle.style.fontWeight=''; const contextTitle=document.createElement('span'); contextTitle.textContent=' - Associated with '+[requirementName,requirementLocation].filter(value=>String(value||'').trim()).join(' - '); contextTitle.style.fontSize='12px'; contextTitle.style.fontWeight='500'; listHeading.append(primaryTitle,contextTitle); const inline=listHeading.closest('.jobs-list-heading-inline'); if(inline)inline.classList.add('requirement-context'); } const listDescription=$('profilesListDescription'); if(listDescription){listDescription.textContent='';listDescription.classList.add('hidden');} } }
  async function loadRequirements(){ const {data,error}=await supabase.from('jobs').select('id,job_code,title,status,location,client_id,clients:client_id(client_name,client_code)').order('title',{ascending:true}); if(error)throw error; requirements=(data||[]).map(r=>({...r,client_name:r.clients?.client_name||'',client_code:r.clients?.client_code||''})); populateRequirementOptions(requirementId||''); populateProfileFilterOptions(); if(multipleRequirementsMode){ $('associateExistingButton')?.classList.add('hidden'); $('backToRequirementsButton')?.classList.remove('hidden'); const selected=requirements.filter(r=>requirementIds.includes(String(r.id))); const selectedLabels=selected.map(r=>[r.title||'Requirement',r.location].filter(value=>String(value||'').trim()).join(' - ')); const context=$('profileRequirementContext'); if(context){context.textContent=selectedLabels.join(' · ')||'Selected Requirements';context.style.setProperty('color','#16834A','important');context.style.setProperty('font-size','12px','important');context.style.setProperty('font-weight','500','important');context.classList.remove('hidden');} $('profilesPageSubtitle')?.classList.add('hidden'); const title=$('profilesListTitle'); if(title){title.replaceChildren();const primaryTitle=document.createElement('span');primaryTitle.textContent='Candidate Profiles';primaryTitle.style.fontSize='';primaryTitle.style.fontWeight='';const contextTitle=document.createElement('span');contextTitle.textContent=' - Associated with '+(selected.map(r=>r.title||'Requirement').join(' · ')||'Selected Requirements');contextTitle.style.fontSize='12px';contextTitle.style.fontWeight='500';title.append(primaryTitle,contextTitle);const inline=title.closest('.jobs-list-heading-inline');if(inline)inline.classList.add('requirement-context');} const description=$('profilesListDescription'); if(description){description.textContent='';description.classList.add('hidden');} } }
  async function loadProfiles(){ message('Loading profiles…'); let q=supabase.from('profiles').select('id,profile_number,full_name,email,phone,current_location,preferred_location,total_experience,current_job_title,current_company,notice_period,current_ctc,expected_ctc,availability,status,created_at,resume_file_name').order('created_at',{ascending:false}); if(requirementId) q=q.in('id', await getRequirementProfileIds([requirementId])); else if(multipleRequirementsMode) q=q.in('id', await getRequirementProfileIds(requirementIds)); const {data,error}=await q; if(error)throw error; profiles=data||[]; await attachSourcesAndAssociations(); if(multipleRequirementsMode){ const selectedSet=new Set(requirementIds.map(String)); profiles=profiles.filter(p=>Array.isArray(p.associations)&&p.associations.some(a=>selectedSet.has(String(a.requirement_id)))); } updateProfileSummary(); render(); message(''); }
  async function getRequirementProfileIds(ids=[requirementId]){ const validIds=(ids||[]).filter(Boolean); if(!validIds.length)return ['00000000-0000-0000-0000-000000000000']; const {data,error}=await supabase.from('profile_requirement_associations').select('profile_id').in('requirement_id',validIds); if(error)throw error; const profileIds=[...new Set((data||[]).map(x=>x.profile_id).filter(Boolean))]; return profileIds.length?profileIds:['00000000-0000-0000-0000-000000000000']; }
  async function attachSourcesAndAssociations(){ const ids=profiles.map(p=>p.id); if(!ids.length){populateProfileFilterOptions();return;} const [s,a,c]=await Promise.all([supabase.from('profile_sources').select('profile_id,source').in('profile_id',ids).eq('is_primary',true),supabase.from('profile_requirement_associations').select('id,profile_id,requirement_id,status,associated_at,submitted_to_client_date').in('profile_id',ids).order('associated_at',{ascending:false}),supabase.from('profile_categories').select('profile_id,category_id').in('profile_id',ids)]); if(s.error)throw s.error;if(a.error)throw a.error;if(c.error)throw c.error; const sourceMap=Object.fromEntries((s.data||[]).map(x=>[x.profile_id,x.source])); const assocMap={}; (a.data||[]).forEach(x=>{(assocMap[x.profile_id]??=[]).push(x)}); const categoryMap={}; (c.data||[]).forEach(x=>{(categoryMap[x.profile_id]??=[]).push(x.category_id)}); profiles.forEach(p=>{p.source=sourceMap[p.id]||'—';p.associations=assocMap[p.id]||[];const latestAssoc=p.associations[0];const latestReq=latestAssoc?requirements.find(r=>String(r.id)===String(latestAssoc.requirement_id)):null;p.latestRequirementName=latestReq?.title||'—';p.latestRequirementId=latestAssoc?.requirement_id||'';p.latestRequirementClientId=latestReq?.client_id||'';p.latestRequirementClientName=latestReq?.client_name||'';p.categoryIds=categoryMap[p.id]||[]}); populateProfileFilterOptions(); }
  function populateProfileFilterOptions(){
    const requirementSelect=$('profileRequirementFilter'), clientSelect=$('profileClientFilter'), locationSelect=$('profileLocationFilter');
    if(requirementSelect){
      const validSelected=new Set(selectedRequirementFilters.map(String));
      requirementSelect.innerHTML='<option value="">All Requirements</option>'+requirements.map(r=>`<option value="${esc(r.id)}">${esc(r.job_code||'')} — ${esc(r.title||'')}</option>`).join('');
      selectedRequirementFilters=[...validSelected].filter(id=>requirements.some(r=>String(r.id)===id));
      refreshMultiFilter('profileRequirementFilter');
    }
    if(clientSelect){ const selected=clientSelect.value; const clients=[...new Map(requirements.filter(r=>r.client_id&&r.client_name).map(r=>[String(r.client_id),r.client_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1])); clientSelect.innerHTML='<option value="">All Clients</option>'+clients.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join(''); clientSelect.value=selected||''; }
    if(locationSelect){ const selected=locationSelect.value; const locations=[...new Set(profiles.map(p=>String(p.preferred_location||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); locationSelect.innerHTML='<option value="">All Locations</option>'+locations.map(location=>`<option value="${esc(location)}">${esc(location)}</option>`).join(''); locationSelect.value=selected||''; }
  }
  function initMultiFilter(selectId, label, getOptions, selectedValues, onSelection){
    const select=$(selectId); if(!select)return;
    if(!multiFilterWidgets[selectId]){
      const wrapper=document.createElement('div'); wrapper.className='profile-multiselect-filter'; wrapper.dataset.filterId=selectId;
      const trigger=document.createElement('button'); trigger.type='button'; trigger.className='profile-multiselect-trigger'; trigger.setAttribute('aria-haspopup','true'); trigger.setAttribute('aria-expanded','false');
      trigger.innerHTML=`<span class="profile-multiselect-label"></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>`;
      const menu=document.createElement('div'); menu.className='profile-multiselect-menu'; menu.hidden=true; menu.setAttribute('role','group'); menu.setAttribute('aria-label',label);
      wrapper.append(trigger,menu); select.parentNode.insertBefore(wrapper,select); select.style.display='none';
      trigger.addEventListener('click',()=>{if(select.disabled)return; const open=menu.hidden; document.querySelectorAll('.profile-multiselect-menu').forEach(m=>{m.hidden=true;const t=m.parentElement?.querySelector('.profile-multiselect-trigger');if(t)t.setAttribute('aria-expanded','false');}); menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));});
      menu.addEventListener('change',e=>{const cb=e.target.closest('input[type="checkbox"]');if(!cb)return;const values=[...menu.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);onSelection(values);refreshMultiFilter(selectId);currentPage=1;render();});
      document.addEventListener('click',e=>{if(!wrapper.contains(e.target)){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}});
      multiFilterWidgets[selectId]={wrapper,trigger,menu,label,getOptions,selectedValues,onSelection};
    }
    refreshMultiFilter(selectId);
  }
  function refreshMultiFilter(selectId){
    const widget=multiFilterWidgets[selectId];if(!widget)return;
    const options=widget.getOptions();const selected=widget.selectedValues();
    widget.menu.innerHTML=options.map(o=>`<label class="profile-multiselect-option"><input type="checkbox" value="${esc(o.value)}" ${selected.map(String).includes(String(o.value))?'checked':''}><span>${esc(o.label)}</span></label>`).join('')||'<div class="profile-multiselect-option">No options available</div>';
    const text=selected.length?`${widget.label} (${selected.length})`:widget.label;
    widget.trigger.querySelector('.profile-multiselect-label').textContent=text;
    const select=$(selectId);widget.wrapper.classList.toggle('is-disabled',Boolean(select?.disabled));widget.trigger.disabled=Boolean(select?.disabled);
    widget.trigger.setAttribute('aria-label',selected.length?`${widget.label}, ${selected.length} selected`:widget.label);
  }
  function setupProfileMultiFilters(){
    initMultiFilter('profileStatusFilter','All Association Statuses',()=>[...$('profileStatusFilter').options].filter(o=>o.value).map(o=>({value:o.value,label:o.textContent})),()=>selectedAssociationStatuses,values=>{selectedAssociationStatuses=values;});
    initMultiFilter('profileRequirementFilter','All Requirements',()=>requirements.map(r=>({value:String(r.id),label:`${r.job_code||''}${r.job_code?' — ':''}${r.title||'Requirement'}`})),()=>selectedRequirementFilters,values=>{selectedRequirementFilters=values;});
  }
  function displayedAssociation(p){ const associations=Array.isArray(p.associations)?p.associations:[]; if(requirementId)return associations.find(a=>String(a.requirement_id)===String(requirementId))||null; if(multipleRequirementsMode){const selectedSet=new Set(requirementIds.map(String));return associations.find(a=>selectedSet.has(String(a.requirement_id)))||null;} return associations[0]||null; }
  function displayedAssociationStatus(p){ return displayedAssociation(p)?.status||'—'; }
  function filtered(){ const term=$('profileSearch').value.trim().toLowerCase(), profileStatus=$('profileRecordStatusFilter').value, source=$('profileSourceFilter').value, clientFilter=$('profileClientFilter').value, locationFilter=$('profileLocationFilter').value, submittedFrom=$('submittedDateFrom')?.value||'', submittedTo=$('submittedDateTo')?.value||''; const statusSet=new Set(selectedAssociationStatuses.map(String)), requirementSet=new Set(selectedRequirementFilters.map(String)); return profiles.filter(p=>{ const association=displayedAssociation(p); const submittedDate=String(association?.submitted_to_client_date||'').slice(0,10); const associations=Array.isArray(p.associations)?p.associations:[]; const requirementMatch=!requirementSet.size||associations.some(a=>requirementSet.has(String(a.requirement_id))); return (!term||[p.profile_number,p.full_name,p.email,p.phone,p.preferred_location,p.current_job_title].some(v=>String(v||'').toLowerCase().includes(term)))&&(!statusSet.size||statusSet.has(String(displayedAssociationStatus(p))))&&(!profileStatus||String(p.status||'')===profileStatus)&&(!source||p.source===source)&&requirementMatch&&(!clientFilter||String(p.latestRequirementClientId||'')===String(clientFilter))&&(!locationFilter||String(p.preferred_location||'')===String(locationFilter))&&(!submittedFrom||(submittedDate&&submittedDate>=submittedFrom))&&(!submittedTo||(submittedDate&&submittedDate<=submittedTo)); }); }
  function detailItem(label,value,wide=false){ return `<div class="profile-detail-item${wide?' profile-detail-wide':''}"><span class="profile-detail-label">${esc(label)}</span><div class="profile-detail-value">${esc(value||'—')}</div></div>`; }
  function detailLink(label,value){ const v=String(value||'').trim(); return `<div class="profile-detail-item"><span class="profile-detail-label">${esc(label)}</span><div class="profile-detail-value">${v?`<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`:'—'}</div></div>`; }
  function formatDateTime(value){ return value ? new Date(value).toLocaleString() : '—'; }
  function formatDateOnly(value){
    if(!value) return '—';
    const parts=String(value).split('-');
    if(parts.length!==3) return esc(value);
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthIndex=Number(parts[1])-1;
    return `${esc(parts[2])}-${esc(months[monthIndex]||parts[1])}-${esc(parts[0])}`;
  }
  function renderDetailTable(headers, rows, emptyText){
    if(!rows.length) return `<div class="profile-detail-table-empty">${esc(emptyText)}</div>`;
    return `<div class="profile-detail-table-wrap"><table class="profile-detail-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function uniqueSourceRows(sourceRows){
    const seen=new Set();
    return (sourceRows||[]).filter(x=>{
      const key=[x.source||'',x.source_details||'',x.referrer_name||'',x.referrer_mobile||'',x.referrer_email||''].map(v=>String(v).trim().toLowerCase()).join('|');
      if(seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  async function getProfileResumeUrl(profile){
    if(!profile?.resume_object_path) throw new Error('No resume storage path is available for this profile.');
    const path=String(profile.resume_object_path).trim();
    if(/^https?:\/\//i.test(path)) return path;
    // Profile resumes are stored in the Profile repository rather than the Careers bucket.
    // Ask the existing profile-management Edge Function for a short-lived signed URL.
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Your session has expired. Please sign in again.');
    const fd=new FormData(); fd.append('action','resume-url'); fd.append('profile_id',profile.id);
    const response=await fetch(window.NAVODIX_SUPABASE_URL+'/functions/v1/profile-management',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:fd});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||payload.message||'Could not prepare the resume.');
    const url=payload.signed_url||payload.signedUrl||payload.resume_url||payload.resumeUrl;
    if(!url) throw new Error('The Profile Management service did not return a secure resume URL.');
    return url;
  }
  async function viewProfileResume(profile){
    const viewer=$('profileResumeViewer');
    const frame=$('profileResumeFrame');
    const docxViewer=$('profileResumeDocxViewer');
    const loading=$('profileResumeLoading');
    const openBtn=$('openProfileResumeNewTabButton');
    const closeBtn=$('closeProfileResumeButton');
    if(!viewer||!frame||!docxViewer){ profileDetailsMessage('Resume viewer is not available.','error'); return; }
    try{
      profileDetailsMessage('');
      viewer.classList.remove('hidden');
      if(loading){loading.classList.remove('hidden');loading.textContent='Loading resume…';}
      frame.classList.add('hidden');
      docxViewer.classList.add('hidden');
      docxViewer.innerHTML='';
      const url=await getProfileResumeUrl(profile);
      const fileName=String(profile.resume_file_name||'').toLowerCase();
      const isPdf=/\.pdf$/i.test(fileName);
      const isDocx=/\.docx$/i.test(fileName);

      if(isPdf){
        // Fetch the signed R2 object first and display it from a browser Blob URL.
        // This avoids embedding the Cloudflare R2 host directly in the iframe.
        const response=await fetch(url,{method:'GET',credentials:'omit'});
        if(!response.ok)throw new Error(`Resume request failed (HTTP ${response.status})`);
        const pdfBlob=await response.blob();
        if(!pdfBlob.size)throw new Error('The stored PDF is empty.');
        if(activeProfileResumeObjectUrl){URL.revokeObjectURL(activeProfileResumeObjectUrl);activeProfileResumeObjectUrl='';}
        activeProfileResumeObjectUrl=URL.createObjectURL(new Blob([pdfBlob],{type:'application/pdf'}));
        frame.onload=()=>{ if(loading)loading.classList.add('hidden'); frame.classList.remove('hidden'); };
        frame.src=activeProfileResumeObjectUrl + '#toolbar=1&navpanes=0&view=FitH';
      }else if(isDocx){
        if(typeof window.docx === 'undefined' || typeof window.docx.renderAsync !== 'function'){
          throw new Error('DOCX preview support is not available. Please refresh the page and try again.');
        }
        const response=await fetch(url,{credentials:'omit'});
        if(!response.ok)throw new Error(`Resume request failed (HTTP ${response.status})`);
        const blob=await response.blob();
        await window.docx.renderAsync(blob,docxViewer,null,{breakPages:true,ignoreLastRenderedPageBreak:false,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true});
        docxViewer.classList.remove('hidden');
        if(loading)loading.classList.add('hidden');
      }else{
        frame.src=url;
        frame.onload=()=>{ if(loading)loading.classList.add('hidden'); frame.classList.remove('hidden'); };
        if(loading)loading.textContent='Preparing resume… If your browser cannot display this file inline, use Download Resume.';
      }

      if(openBtn){
        openBtn.onclick=()=>window.open(url,'_blank','noopener,noreferrer');
        openBtn.classList.remove('hidden');
      }
      if(closeBtn) closeBtn.classList.remove('hidden');
      const closeBottomBtn=$('closeProfileResumeBottomButton'); if(closeBottomBtn) closeBottomBtn.classList.remove('hidden');
    }catch(err){
      viewer.classList.add('hidden');
      if(frame)frame.src='';
      if(docxViewer)docxViewer.innerHTML='';
      if(loading)loading.classList.add('hidden');
      profileDetailsMessage(`Could not open the resume: ${err.message||String(err)}`,'error');
    }
  }
  async function downloadProfileResume(profile){
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session) throw new Error('Your session has expired. Please sign in again.');
      const fd=new FormData();
      const association=displayedAssociation(profile);
      const associatedRequirement=association?requirements.find(r=>String(r.id)===String(association.requirement_id)):null;
      const clientCode=String(associatedRequirement?.client_code||'').trim();
      const categoryId=Array.isArray(profile.categoryIds)?profile.categoryIds[0]:null;
      const categoryCode=String(jobCategories.find(c=>String(c.id)===String(categoryId))?.category_code||'').trim();
      const candidateName=String(profile.full_name||'').trim();
      const safePart=value=>String(value||'').trim().replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ');
      const extensionMatch=String(profile.resume_file_name||'').match(/\.(pdf|doc|docx)$/i);
      const extension=extensionMatch?extensionMatch[0]:'';
      const parts=['Navodix',...(associatedRequirement?[clientCode]:[]),categoryCode,candidateName].map(safePart).filter(Boolean);
      const defaultFileName=parts.join('_')+extension;
      fd.append('action','resume-download');
      fd.append('profile_id',profile.id);
      fd.append('download_file_name',defaultFileName);
      const response=await fetch(window.NAVODIX_SUPABASE_URL+'/functions/v1/profile-management',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:fd});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(payload.error||payload.message||'Could not prepare the resume download.');
      const url=payload.signed_url||payload.signedUrl;
      if(!url) throw new Error('The Profile Management service did not return a secure download URL.');
      const link=document.createElement('a');
      link.href=url;
      link.download=defaultFileName;
      link.target='_blank';
      link.rel='noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }catch(err){ profileDetailsMessage(`Could not download the resume: ${err.message||String(err)}`,'error'); }
  }
  let pendingRemoveAssociation = null;
  function closeRemoveProfileAssociationModal(){
    const modal=$('removeProfileAssociationModal'); if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
    pendingRemoveAssociation=null;
    if($('profileDetailsModal')?.classList.contains('hidden') && $('interviewRequirementPickerModal')?.classList.contains('hidden')) document.body.classList.remove('modal-open');
  }
  async function removeProfileAssociation(profileId, associationId, requirementLabel, profileName=''){
    if(!profileId || !associationId)return;
    pendingRemoveAssociation={profileId,associationId,requirementLabel:requirementLabel||'requirement',profileName:profileName||profiles.find(x=>String(x.id)===String(profileId))?.full_name||'Profile'};
    const text=$('removeProfileAssociationText');
    if(text)text.textContent=`Remove the association between ${pendingRemoveAssociation.profileName} and ${pendingRemoveAssociation.requirementLabel}? This will also remove its requirement-specific notes and interview records. The profile itself and its other requirement associations will remain.`;
    const modal=$('removeProfileAssociationModal'); modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  }
  async function confirmRemoveProfileAssociation(){
    if(!pendingRemoveAssociation)return;
    const pending={...pendingRemoveAssociation}; const btn=$('confirmRemoveProfileAssociationButton'); if(btn)btn.disabled=true;
    try{
      const fd=new FormData(); fd.append('action','remove-association'); fd.append('profile_id',pending.profileId); fd.append('association_id',pending.associationId);
      await callProfileFunction(fd);
      closeRemoveProfileAssociationModal();
      if(!$('profileDetailsModal')?.classList.contains('hidden') && String(profileAssociationCurrentProfileId)===String(pending.profileId)) await openProfileDetails(pending.profileId);
      await loadProfiles();
      message(`Association with ${pending.requirementLabel} removed successfully.`,'success');
    }catch(err){
      const msg=`Could not remove the job association: ${err.message||String(err)}`;
      if(!$('profileDetailsModal')?.classList.contains('hidden'))profileDetailsMessage(msg,'error');else message(msg,'error');
    }finally{if(btn)btn.disabled=false;}
  }

  function deleteProfile(profileId, profileName){
    if(!profileId)return;
    pendingDeleteProfileId=profileId; pendingDeleteProfileName=profileName||'this profile';
    const text=$('deleteProfileText'); if(text)text.textContent=`Profile ${pendingDeleteProfileName} and all associated information will be permanently removed. This action cannot be undone.`;
    $('deleteProfileModal').classList.remove('hidden'); $('deleteProfileModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  }
  function closeDeleteProfileModal(){
    $('deleteProfileModal').classList.add('hidden'); $('deleteProfileModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');
    pendingDeleteProfileId=''; pendingDeleteProfileName='';
  }
  async function confirmDeleteProfile(){
    if(!pendingDeleteProfileId)return; const profileId=pendingDeleteProfileId; const btn=$('confirmDeleteProfileButton'); if(btn)btn.disabled=true;
    try{ profileDetailsMessage('Deleting profile…'); const fd=new FormData(); fd.append('action','delete-profile'); fd.append('profile_id',profileId); await callProfileFunction(fd); closeDeleteProfileModal(); closeProfileDetails(); message('Profile deleted successfully.','success'); await loadProfiles(); }
    catch(err){ profileDetailsMessage(`Could not delete the profile: ${err.message||String(err)}`,'error'); }
    finally{ if(btn)btn.disabled=false; }
  }

  let profileAssociationCurrentProfileId = '';
  let profileNotesProfileId = '';
  let profileNotesRequirementId = '';
  let profileNotesEditingId = '';

  function closeProfileNotesModal(){ $('profileNotesModal').classList.remove('profile-level-notes-open','profile-association-notes-open'); $('profileNotesModal').classList.add('hidden'); $('profileNotesModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); profileNotesProfileId=''; profileNotesRequirementId=''; profileNotesEditingId=''; resetProfileNoteForm(); }
  function profileNoteFormMessage(text='',type=''){ const el=$('profileNoteFormMessage'); if(!el)return; el.textContent=text; el.className=`admin-message${type?' '+type:''}`; }
  function setProfileNoteTypeOptions(isProfileLevel){
    const select=$('profileNoteType'); if(!select)return;
    select.innerHTML=isProfileLevel
      ? '<option value="General">General</option><option value="Update">Update</option><option value="Client Feedback">Client Feedback</option>'
      : '<option value="Update">Update</option><option value="Client Feedback">Client Feedback</option>';
  }
  function resetProfileNoteForm(){ profileNotesEditingId=''; $('profileNoteId').value=''; setProfileNoteTypeOptions(!profileNotesRequirementId); $('profileNoteType').value=profileNotesRequirementId?'Update':'General'; $('profileNoteText').value=''; $('saveProfileNoteButton').innerHTML='<i class="fa-solid fa-plus"></i> Add Note'; profileNoteFormMessage(''); }
  async function loadProfileLevelNotes(){
    if(!profileNotesProfileId||profileNotesRequirementId)return;
    $('profileNotesMessage').textContent='Loading…'; $('profileNotesMessage').className='admin-message'; $('profileNotesTableBody').innerHTML=''; $('profileNotesEmpty').classList.add('hidden'); $('profileNotesTableWrap').classList.remove('hidden');
    const {data,error}=await supabase.from('profile_notes').select('id,note_type,note,created_at,created_by,updated_by').eq('profile_id',profileNotesProfileId).is('requirement_id',null).order('created_at',{ascending:false});
    if(error)throw error; const rows=data||[]; await resolveUserNames(rows.flatMap(n=>[n.updated_by,n.created_by]));
    if(!rows.length){ $('profileNotesTableBody').innerHTML='<tr class="profile-notes-empty-row"><td colspan="4">No profile notes found.</td></tr>'; }
    else $('profileNotesTableBody').innerHTML=rows.map(n=>`<tr data-profile-note-row-id="${esc(n.id)}" tabindex="0"><td>${esc(formatDateTime(n.created_at))}</td><td>${esc(noteCreatorLabel(n.updated_by||n.created_by))}</td><td>${esc(n.note_type||'General')}</td><td class="profile-note-text">${esc(n.note||'')}</td></tr>`).join('');
    $('profileNotesMessage').textContent='';
  }
  const resolvedUserNames = new Map();
  async function resolveUserNames(userIds){
    const ids=[...new Set((userIds||[]).map(v=>String(v||'').trim()).filter(v=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(v)&&!resolvedUserNames.has(v)))];
    if(ids.length){
      const fd=new FormData(); fd.append('action','resolve-user-names'); fd.append('user_ids',JSON.stringify(ids));
      try{ const result=await callProfileFunction(fd); Object.entries(result.user_names||{}).forEach(([id,name])=>resolvedUserNames.set(id,name)); }catch(err){ console.warn('Could not resolve note/history user names:',err); }
    }
    return resolvedUserNames;
  }
  function noteCreatorLabel(userId){
    if(!userId)return '—'; const value=String(userId).trim();
    if(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value))return resolvedUserNames.get(value)||'User details unavailable';
    return value;
  }
  async function openProfileLevelNotes(profileId){
    profileNotesProfileId=profileId||''; profileNotesRequirementId=''; profileNotesEditingId=''; if(!profileNotesProfileId)return;
    const profile=profiles.find(x=>String(x.id)===String(profileNotesProfileId));
    const profileName=profile?.full_name||'Profile';
    $('profileNotesTitle').textContent=`Profile Notes : ${profileName}`;
    $('profileNotesSectionBadge').textContent='PROFILE NOTES';
    $('profileNotesContext').innerHTML='<div class="interview-context-row"><span class="interview-context-label">Profile Name :</span><span class="profile-notes-profile-row-value">'+esc(profileName)+'</span></div>';
    $('profileNotesListTitle').textContent='Profile Notes'; $('profileNotesModal').classList.add('profile-level-notes-open');
    $('profileNotesModal').classList.remove('hidden'); $('profileNotesModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); resetProfileNoteForm();
    try{await loadProfileLevelNotes();}catch(err){$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}
  }
  async function loadRequirementNotes(){
    if(!profileNotesProfileId||!profileNotesRequirementId)return;
    $('profileNotesMessage').textContent='Loading…'; $('profileNotesMessage').className='admin-message'; $('profileNotesTableBody').innerHTML=''; $('profileNotesEmpty').classList.add('hidden'); $('profileNotesTableWrap').classList.remove('hidden');
    const {data,error}=await supabase.from('profile_notes').select('id,note_type,note,created_at,created_by,updated_by').eq('profile_id',profileNotesProfileId).eq('requirement_id',profileNotesRequirementId).order('created_at',{ascending:false});
    if(error)throw error; const rows=data||[]; await resolveUserNames(rows.flatMap(n=>[n.updated_by,n.created_by]));
    if(!rows.length){ $('profileNotesTableBody').innerHTML='<tr class="profile-notes-empty-row"><td colspan="4">No profile notes found.</td></tr>'; }
    else $('profileNotesTableBody').innerHTML=rows.map(n=>`<tr data-profile-note-row-id="${esc(n.id)}" tabindex="0"><td>${esc(formatDateTime(n.created_at))}</td><td>${esc(noteCreatorLabel(n.updated_by||n.created_by))}</td><td>${esc(n.note_type||'Update')}</td><td class="profile-note-text">${esc(n.note||'')}</td></tr>`).join('');
    $('profileNotesMessage').textContent='';
  }
  async function openProfileRequirementNotes(profileId,requirementId,requirementLabel='Requirement'){
    profileNotesProfileId=profileId||''; profileNotesRequirementId=requirementId||''; profileNotesEditingId=''; if(!profileNotesProfileId||!profileNotesRequirementId)return;
    $('profileNotesTitle').textContent=`Requirement Association Notes : ${requirementLabel}`; $('profileNotesSectionBadge').textContent='REQUIREMENT ASSOCIATION NOTES'; $('profileNotesListTitle').textContent='Requirement Association Notes'; $('profileNotesContext').innerHTML=`<div class="interview-context-row"><span class="interview-context-label">Profile Name :</span><span class="profile-notes-profile-row-value">${esc(profiles.find(x=>String(x.id)===String(profileId))?.full_name||'Profile')}</span></div><div class="interview-context-row"><span class="interview-context-label">Requirement :</span><span class="profile-notes-profile-row-value">${esc(requirementLabel)}</span></div>`; $('profileNotesModal').classList.remove('profile-level-notes-open'); $('profileNotesModal').classList.add('profile-association-notes-open'); $('profileNotesModal').classList.remove('hidden'); $('profileNotesModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); resetProfileNoteForm();
    try{await loadRequirementNotes();}catch(err){$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}
  }
  async function saveProfileRequirementNote(e){
    e.preventDefault(); if(!profileNotesProfileId){profileNoteFormMessage('Profile context is not available.','error');return;}
    const note=$('profileNoteText').value.trim(),noteType=$('profileNoteType').value;if(!note){profileNoteFormMessage('Please enter a note.','error');return;}
    const btn=$('saveProfileNoteButton');btn.disabled=true;profileNoteFormMessage(profileNotesEditingId?'Saving changes…':'Saving note…');
    const isProfileLevel=!profileNotesRequirementId;
    try{
      const userId=(await supabase.auth.getUser()).data.user?.id||null;
      if(profileNotesEditingId){
        let q=supabase.from('profile_notes').update({note_type:noteType,note,updated_by:userId}).eq('id',profileNotesEditingId).eq('profile_id',profileNotesProfileId);
        q=isProfileLevel?q.is('requirement_id',null):q.eq('requirement_id',profileNotesRequirementId);
        const {error}=await q;if(error)throw error;
        message(isProfileLevel?'Profile-level note updated successfully.':'Requirement-specific note updated successfully.','success');
      }else{
        const {error}=await supabase.from('profile_notes').insert({profile_id:profileNotesProfileId,requirement_id:isProfileLevel?null:profileNotesRequirementId,note_type:noteType,note,created_by:userId,updated_by:userId});if(error)throw error;
        message(isProfileLevel?'Profile-level note added successfully.':'Requirement-specific note added successfully.','success');
      }
      resetProfileNoteForm(); if(isProfileLevel)await loadProfileLevelNotes(); else await loadRequirementNotes();
    }catch(err){profileNoteFormMessage(err.message||String(err),'error');}finally{btn.disabled=false;}
  }
  async function openProfileDetails(id){
    profileAssociationCurrentProfileId=id;
    const {data:p,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error)throw error;
    const [srcRes,catRes,assocRes,notesRes,statusRes,intRes]=await Promise.all([
      supabase.from('profile_sources').select('source,source_details,referrer_name,referrer_mobile,referrer_email,is_primary,created_at').eq('profile_id',id).order('created_at',{ascending:false}),
      supabase.from('profile_categories').select('category_id').eq('profile_id',id),
      supabase.from('profile_requirement_associations').select('id,requirement_id,association_type,status,associated_at,submitted_to_client_date,notes,updated_at').eq('profile_id',id).order('associated_at',{ascending:false}),
      supabase.from('profile_notes').select('id,requirement_id,note_type,note,created_at,created_by').eq('profile_id',id).order('created_at',{ascending:false}),
      supabase.from('profile_status_history').select('status,notes,changed_at,changed_by').eq('profile_id',id).order('changed_at',{ascending:false}),
      supabase.from('profile_requirement_interviews').select('requirement_id,round_number,round_name,scheduled_date,scheduled_time,mode,interviewer,result,feedback').eq('profile_id',id).order('scheduled_date',{ascending:false})
    ]);
    const categories=(catRes.data||[]).map(x=>jobCategories.find(c=>String(c.id)===String(x.category_id))?.category_name).filter(Boolean);
    const reqIds=(assocRes.data||[]).map(x=>x.requirement_id);
    let reqMap={}; if(reqIds.length){ const {data:reqs}=await supabase.from('jobs').select('id,job_code,title,status').in('id',reqIds); (reqs||[]).forEach(r=>reqMap[r.id]=r); }
    const body=$('profileDetailsBody');
    const sourceRows=uniqueSourceRows(srcRes.data||[]);
    const primary=(srcRes.data||[]).find(x=>x.is_primary) || sourceRows[0];
    const notes=notesRes.error?[]:(notesRes.data||[]); const histories=statusRes.error?[]:(statusRes.data||[]); const interviews=intRes.error?[]:(intRes.data||[]);
    const resumeButtons=p.resume_object_path ? `<div class="profile-resume-action-row"><div class="profile-resume-actions"><button type="button" class="btn btn-primary btn-small" id="viewProfileResumeButton"><i class="fa-solid fa-eye"></i> View Resume</button><button type="button" class="btn btn-primary btn-small" id="openProfileResumeNewTabButton"><i class="fa-solid fa-up-right-from-square"></i> Open in New Tab</button><button type="button" class="btn btn-primary btn-small" id="downloadProfileResumeButton"><i class="fa-solid fa-download"></i> Download Resume</button><button type="button" class="btn btn-primary btn-small hidden" id="closeProfileResumeButton"><i class="fa-solid fa-xmark"></i> Close Resume</button></div></div><div id="profileResumeViewer" class="profile-resume-viewer hidden"><div id="profileResumeLoading" class="profile-resume-loading">Loading resume…</div><iframe id="profileResumeFrame" class="profile-resume-frame hidden" title="Profile Resume"></iframe><div id="profileResumeDocxViewer" class="profile-resume-docx hidden" aria-label="Profile Resume"></div></div>` : '<div class="profile-detail-muted">No resume available.</div>';
    const resumeLastUpdatedButton=p.resume_object_path ? `<button type="button" class="btn btn-outline btn-small hidden" id="closeProfileResumeBottomButton"><i class="fa-solid fa-xmark"></i> Close Resume</button>` : '';
    const initials=String(p.full_name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'CP';
    const viewMetric=(icon,label,value)=>`<div class="profile-premium-view-metric"><i class="${icon}"></i><div><small>${label}</small><strong>${esc(value||'—')}</strong></div></div>`;
    body.innerHTML=`
      <div class="profile-premium-view-hero"><div class="profile-premium-view-identity"><div class="profile-premium-view-avatar">${esc(initials)}</div><div><div class="profile-premium-view-name">${esc(p.full_name||'Candidate Profile')}</div><div class="profile-premium-view-code">${esc(p.profile_number||'')}</div><span class="profile-premium-view-status">${esc(p.status||'New')}</span></div></div><div class="profile-premium-view-metrics">${viewMetric('fa-solid fa-briefcase','Total Experience',p.total_experience)}${viewMetric('fa-solid fa-coins','Current CTC',p.current_ctc)}${viewMetric('fa-solid fa-chart-column','Expected CTC',p.expected_ctc)}${viewMetric('fa-regular fa-clock','Notice Period',p.notice_period)}</div></div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-user" aria-hidden="true"></i><span>Personal Information</span></div><div class="profile-personal-detail-grid">
        <div class="profile-personal-row profile-personal-row-3">${detailItem('Full Name',p.full_name)}${detailItem('Email',p.email)}${detailItem('Mobile',p.phone)}</div>
        <div class="profile-personal-row profile-personal-row-3">${detailItem('Alternate Phone',p.alternate_phone)}${detailItem('Current Location',p.current_location)}${detailItem('Preferred Location',p.preferred_location)}</div><div class="profile-personal-row profile-personal-row-3">${detailItem('Employment Status',p.employment_status)}</div>
      </div></div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-briefcase" aria-hidden="true"></i><span>Professional Information</span></div><div class="profile-detail-grid profile-professional-detail-grid">${detailItem('Current Job Title',p.current_job_title)}${detailItem('Current Company',p.current_company)}${detailItem('Total Experience',p.total_experience)}${detailItem('Relevant Experience',p.relevant_experience)}${detailItem('Notice Period',p.notice_period)}${detailItem('Current CTC',p.current_ctc)}${detailItem('Expected CTC',p.expected_ctc)}</div></div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i><span>Education & Skills</span></div><div class="profile-education-detail-grid">
        <div class="profile-education-row profile-education-row-3">${detailItem('Highest Qualification',p.highest_qualification)}${detailItem('Specialization',p.specialization)}${detailItem('Graduation Year',p.graduation_year)}</div>
        <div class="profile-education-row profile-education-row-2">${detailItem('Job Categories',categories.join(', '))}${detailLink('LinkedIn',p.linkedin_url)}</div>
        <div class="profile-education-row profile-education-row-1">${detailItem('Skills',p.skills,true)}</div>
        <div class="profile-education-row profile-education-row-1">${detailItem('Additional Information',p.additional_information,true)}</div>
      </div></div>
      <div class="profile-detail-section profile-job-associations-section">
        <div class="profile-detail-section-title profile-detail-section-title-row"><span class="profile-section-title-label"><i class="fa-solid fa-link" aria-hidden="true"></i> Job Associations</span></div>
        ${renderDetailTable(['Requirement','Status','Association Status','Associated','Submitted to Client','Notes'],(assocRes.data||[]).map(a=>{
          const r=reqMap[a.requirement_id]||{};
          return [
            `<strong>${esc(r.job_code||'—')}</strong><br><span class="profile-detail-muted">${esc(r.title||'Requirement')}</span>`,
            esc(r.status||'—'),
            `<span class="status-pill ${statusClass(a.status)}">${esc(a.status||'Associated')}</span>`,
            esc(formatDateTime(a.associated_at)),
            esc(formatDateOnly(a.submitted_to_client_date)),
            esc(a.notes||'—')
          ];
        }),'No job associations.')}
      </div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-id-card" aria-hidden="true"></i><span>Profile & Source</span></div><div class="profile-detail-grid profile-source-detail-grid">
        ${detailItem('Profile Number',p.profile_number)}${detailItem('Profile Status',p.status)}${detailItem('Date Added',formatDateTime(p.created_at))}${detailItem('Availability',p.availability)}${detailItem('Source',primary?.source)}${detailItem('Source Details',primary?.source_details)}
        ${primary?.referrer_name?detailItem('Referrer Name',primary.referrer_name):''}${primary?.referrer_mobile?detailItem('Referrer Mobile',primary.referrer_mobile):''}${primary?.referrer_email?detailItem('Referrer Email',primary.referrer_email):''}
      </div></div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Recruitment Sources</span></div>${renderDetailTable(['Source','Source Details','Referrer Name','Referrer Mobile','Referrer Email','Added'],sourceRows.map(x=>[esc(x.source||'—'),esc(x.source_details||'—'),esc(x.referrer_name||'—'),esc(x.referrer_mobile||'—'),esc(x.referrer_email||'—'),esc(formatDateTime(x.created_at))]),'No source history.')}</div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>Resume</span></div><div class="profile-resume-card">${p.resume_object_path ? `<div class="profile-resume-file-row"><i class="fa-regular fa-file-lines" aria-hidden="true"></i><span class="profile-resume-file-name" title="${esc(p.resume_file_name||'')}" >${esc(p.resume_file_name||'Resume')}</span></div>${resumeButtons}` : '<div class="profile-resume-file-row">No resume available.</div>'}<div class="profile-detail-item profile-detail-wide profile-resume-last-updated"><div class="profile-resume-last-updated-content"><span class="profile-detail-label">Last Updated</span><div class="profile-detail-value profile-resume-last-updated-value">${esc(p.resume_updated_at?formatDateTime(p.resume_updated_at):'—')}</div></div>${resumeLastUpdatedButton}</div></div></div>
      <div class="profile-detail-section profile-updates-notes-section"><div class="profile-detail-section-title profile-detail-section-title-row"><span class="profile-section-title-label"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Updates / Notes</span></div>${renderDetailTable(['Date & Time','Type','Requirement','Update / Note'],notes.map(n=>[esc(formatDateTime(n.created_at)),esc(n.note_type||'General'),esc((reqMap[n.requirement_id]?.job_code||reqMap[n.requirement_id]?.title||'Profile Level')),esc(n.note||'')]),'No profile notes found.')}</div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>Profile Status History</span></div>${renderDetailTable(['Date & Time','Status','Notes'],histories.map(h=>[esc(formatDateTime(h.changed_at)),`<span class="status-pill ${statusClass(h.status)}">${esc(h.status||'—')}</span>`,esc(h.notes||'—')]),'No status history found.')}</div>
      <div class="profile-detail-section profile-interview-rounds-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Interview Rounds</span></div>${renderDetailTable(['Round','Requirement','Result','Date','Time','Mode','Interviewer','Feedback'],interviews.map(i=>{const r=reqMap[i.requirement_id]||{};return [esc(i.round_name||('Round '+i.round_number)),esc(r.title||r.job_code||'Requirement'),esc(i.result||'Pending'),esc(i.scheduled_date||'—'),esc(formatInterviewTime(i.scheduled_time)),esc(i.mode||'—'),esc(i.interviewer||'—'),esc(i.feedback||'—')]}),'No profile requirement interviews found.')}</div>`;
    profileDetailsMessage(''); $('profileDetailsTitle').innerHTML=`View Profile : <span class="profile-header-name">${esc(p.full_name||'Profile')}</span> <span class="profile-header-code">(${esc(p.profile_number||'')})</span>`; $('profileDetailsModal').classList.remove('hidden'); $('profileDetailsModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
    const viewBtn=$('viewProfileResumeButton'), downloadBtn=$('downloadProfileResumeButton');
    if(viewBtn)viewBtn.onclick=()=>viewProfileResume(p);
    if(downloadBtn)downloadBtn.onclick=()=>downloadProfileResume(p);
  }
  function associationMessage(text,type=''){
    const el=$('profileAssociationMessage'); if(!el)return;
    el.textContent=text||''; el.className='admin-message'+(type?' '+type:'');
  }
  function closeProfileAssociationModal(){
    $('profileAssociationModal').classList.add('hidden');
    $('profileAssociationModal').setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
    profileAssociationProfileId=''; profileAssociationEditId='';
    associationMessage('');
  }
  async function openProfileAssociationModal(profileId, associationId=''){
    profileAssociationProfileId=profileId; profileAssociationEditId=associationId||'';
    const {data:p,error:pError}=await supabase.from('profiles').select('id,profile_number,full_name').eq('id',profileId).single();
    if(pError)throw pError;
    const {data:assocRows,error:aError}=await supabase.from('profile_requirement_associations')
      .select('id,requirement_id,status,notes,submitted_to_client_date').eq('profile_id',profileId);
    if(aError)throw aError;
    const associatedIds=new Set((assocRows||[]).map(x=>String(x.requirement_id)));
    const assoc=associationId ? (assocRows||[]).find(x=>String(x.id)===String(associationId)) : null;
    const profileAssociationName=p.full_name||''; $('profileAssociationProfileName').textContent=profileAssociationName; const profileAssociationDisplay=$('profileAssociationProfileNameDisplay'); if(profileAssociationDisplay) profileAssociationDisplay.textContent=profileAssociationName;
    const currentAssociationRow=$('profileAssociationCurrentRow');
    const currentAssociationValue=$('profileAssociationCurrentValue');
    const currentAssociationNames=(assocRows||[]).map(x=>requirements.find(r=>String(r.id)===String(x.requirement_id))).filter(Boolean).map(r=>{const name=r.title||r.job_code||'';const location=String(r.location||'').trim();return name?(location?`${name}: ${location}`:name):'';}).filter(Boolean);
    if(currentAssociationValue) currentAssociationValue.textContent=currentAssociationNames.length ? currentAssociationNames.join(', ') : 'Not Associated';
    if(currentAssociationRow) currentAssociationRow.classList.remove('hidden');
    const reqSelect=$('profileAssociationRequirement');
    reqSelect.innerHTML='<option value="">Select Requirement</option>'+requirements
      .filter(r=>!associationId || String(r.id)===String(assoc?.requirement_id) || !associatedIds.has(String(r.id)))
      .map(r=>`<option value="${esc(r.id)}">${esc(r.title||'')} - ${esc(String(r.location||'').trim())} - ${esc(r.client_name||'')}</option>`).join('');
    reqSelect.value=assoc?.requirement_id||'';
    reqSelect.disabled=Boolean(associationId);
    $('profileAssociationStatus').innerHTML=requirementStatuses.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('profileAssociationStatus').value=assoc?.status||'New';
    const submissionDateGroup=$('profileAssociationSubmissionDateGroup');
    const submissionDateInput=$('profileAssociationSubmissionDate');
    if(submissionDateInput){ submissionDateInput.value=assoc?.submitted_to_client_date||''; }
    if(submissionDateGroup){ submissionDateGroup.classList.toggle('hidden', $('profileAssociationStatus').value!=='Submitted'); }
    $('profileAssociationNotes').value=assoc?.notes||'';
    $('profileAssociationModalTitle').textContent=associationId?'Update Association Status':'Add Requirement Association';
    $('saveProfileAssociationButton').innerHTML=associationId
      ? '<i class="fa-solid fa-floppy-disk"></i> Save Changes'
      : '<i class="fa-solid fa-link"></i> Associate';
    associationMessage('');
    $('profileAssociationModal').classList.remove('hidden');
    $('profileAssociationModal').setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
  }
  async function saveProfileAssociation(){
    const reqId=$('profileAssociationRequirement').value;
    const status=$('profileAssociationStatus').value;
    const notes=$('profileAssociationNotes').value.trim();
    const submissionDateInput=$('profileAssociationSubmissionDate');
    const submissionDate=submissionDateInput?.value||'';
    if(!profileAssociationProfileId){ associationMessage('Profile is not available.','error'); return; }
    if(!reqId){ associationMessage('Please select a requirement.','error'); return; }
    if(status==='Submitted' && !submissionDate){ associationMessage('Please select the Submission Date.','error'); return; }
    const btn=$('saveProfileAssociationButton'); btn.disabled=true;
    associationMessage(profileAssociationEditId?'Saving changes…':'Associating profile…');
    try{
      if(profileAssociationEditId){
        const {data:current,error:currentError}=await supabase.from('profile_requirement_associations')
          .select('id,status,submitted_to_client_date').eq('id',profileAssociationEditId).eq('profile_id',profileAssociationProfileId).single();
        if(currentError)throw currentError;
        const savedSubmissionDate = status==='Submitted'
          ? (submissionDate||null)
          : (current.submitted_to_client_date||submissionDate||null);
        const {error}=await supabase.from('profile_requirement_associations')
          .update({status,notes:notes||null,submitted_to_client_date:savedSubmissionDate}).eq('id',profileAssociationEditId).eq('profile_id',profileAssociationProfileId);
        if(error)throw error;
        await recordAssociationStatusHistory(profileAssociationEditId,current.status,status,notes);
        message('Requirement association updated successfully.','success');
      }else{
        const {data:created,error}=await supabase.from('profile_requirement_associations')
          .upsert({profile_id:profileAssociationProfileId,requirement_id:reqId,status,notes:notes||null,submitted_to_client_date:submissionDate||null,association_type:'manual'},
            {onConflict:'profile_id,requirement_id'}).select('id,status').single();
        if(error)throw error;
        await recordInitialAssociationStatus(created.id,status,notes);
        message('Profile associated successfully with the requirement.','success');
      }
      const id=profileAssociationProfileId;
      closeProfileAssociationModal();
      await loadProfiles();
      selectProfileRow(id);
    }catch(err){
      associationMessage(err.message||String(err),'error');
    }finally{
      btn.disabled=false;
    }
  }
  function closeProfileDetails(){ $('profileDetailsModal').classList.add('hidden'); $('profileDetailsModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  async function recordAssociationStatusHistory(associationId, previousStatus, newStatus, notes='') {
    if(!associationId || previousStatus === newStatus) return;
    const userId=(await supabase.auth.getUser()).data.user?.id||null;
    const {error}=await supabase.from('profile_requirement_status_history').insert({
      association_id:associationId,
      previous_status:previousStatus||null,
      new_status:newStatus,
      notes:notes||null,
      changed_by:userId
    });
    if(error) throw error;
  }

  async function recordInitialAssociationStatus(associationId, status, notes='') {
    if(!associationId) return;
    const userId=(await supabase.auth.getUser()).data.user?.id||null;
    const {error}=await supabase.from('profile_requirement_status_history').insert({
      association_id:associationId,
      previous_status:null,
      new_status:status||'New',
      notes:notes||null,
      changed_by:userId
    });
    if(error) throw error;
  }

  async function openAssociationStatusHistory(associationId, requirementLabel='Requirement', profileName='—') {
    if(!associationId) return;
    $('associationHistoryTitle').textContent='Association Status History';
    $('associationHistoryProfileName').textContent=profileName||'—';
    $('associationHistoryRequirementName').textContent=requirementLabel||'—';
    $('associationHistoryMessage').textContent='Loading…';
    $('associationHistoryTableBody').innerHTML='';
    $('associationHistoryModal').classList.remove('hidden');
    $('associationHistoryModal').setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    try {
      const {data,error}=await supabase.from('profile_requirement_status_history')
        .select('previous_status,new_status,notes,changed_at,changed_by')
        .eq('association_id',associationId)
        .order('changed_at',{ascending:false});
      if(error) throw error;
      const rows=data||[]; await resolveUserNames(rows.map(x=>x.changed_by));
      // Use the shared canonical name resolver for every audit surface. Do not
      // overwrite careers_admins.display_name with Auth metadata/email here:
      // doing so corrupted the shared cache used by both notes lists.
      $('associationHistoryTableBody').innerHTML=rows.length?rows.map(x=>{const changedBy=String(x.changed_by||'').trim();const readableChangedBy=!changedBy?'—':(resolvedUserNames.get(changedBy)||'User details unavailable');return `<tr><td>${esc(formatDateTime(x.changed_at))}</td><td>${esc(x.previous_status||'—')}</td><td>${esc(x.new_status||'—')}</td><td>${esc(x.notes||'—')}</td><td>${esc(readableChangedBy)}</td></tr>`;}).join(''):'<tr class="association-history-empty-row"><td class="history-empty-state" colspan="5">No Status History found</td></tr>';
      $('associationHistoryMessage').textContent='';
      $('associationHistoryMessage').className='admin-message profile-status-history-notice';
    } catch(err) {
      $('associationHistoryTableBody').innerHTML=`<tr><td class="history-error-state" colspan="5">${esc(err.message||String(err))}</td></tr>`;
      $('associationHistoryMessage').textContent='';
    }
  }
  function closeAssociationStatusHistory(){ $('associationHistoryModal').classList.add('hidden'); $('associationHistoryModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }


  function updateProfileSummary(){ const rows=filtered(); const set=(id,val)=>{const el=$(id);if(el)el.textContent=String(val);}; const countAssociationStatus=status=>rows.filter(p=>String(displayedAssociationStatus(p)||'').trim().toLowerCase()===status.toLowerCase()).length; set('totalProfilesSummary',rows.length); set('newProfilesSummary',countAssociationStatus('New')); set('submittedProfilesSummary',countAssociationStatus('Submitted')); set('selectedProfilesSummary',countAssociationStatus('Selected')); set('offerSentProfilesSummary',countAssociationStatus('Offer Sent')); set('joinedProfilesSummary',countAssociationStatus('Joined')); set('rejectedProfilesSummary',countAssociationStatus('Rejected')); set('associatedProfilesSummary',requirementId?rows.filter(p=>Array.isArray(p.associations)&&p.associations.some(a=>String(a.requirement_id)===String(requirementId))).length:rows.filter(p=>Array.isArray(p.associations)&&p.associations.length>0).length); }

  function render(){ updateProfileSummary(); const body=$('profilesTableBody'), rows=filtered(); const totalPages=1; const start=0; const pageRows=rows; body.innerHTML=pageRows.map(p=>{const requirementName=requirementId?(requirement?.title||'—'):(p.latestRequirementName||'—');const requirementLocation=requirementId?(requirement?.location||'—'):(requirements.find(r=>String(r.id)===String(p.latestRequirementId))?.location||'—');const selected=String(selectedProfileId)===String(p.id)?' profile-row-selected':'';return `<tr class="profile-row${selected}" data-profile-row-id="${esc(p.id)}"><td><div class="profile-name-cell"><strong>${esc(p.full_name)}</strong></div></td><td>${esc(requirementName)}</td><td>${esc(requirementLocation)}</td><td>${esc(p.current_company||'—')}</td><td>${esc(p.current_location||'—')}</td><td>${esc(p.preferred_location||'—')}</td><td>${esc(p.total_experience||'—')}</td><td>${esc(p.current_ctc||'-')}</td><td>${esc(p.expected_ctc||'-')}</td><td>${esc(p.notice_period||'-')}</td><td><span class="status-pill ${statusClass(p.status)}">${esc(p.status||'—')}</span></td><td><span class="status-pill ${statusClass(displayedAssociationStatus(p))}">${esc(displayedAssociationStatus(p))}</span></td><td>${esc(formatDateOnly(displayedAssociation(p)?.submitted_to_client_date||''))}</td></tr>`}).join(''); if(!pageRows.length){ body.innerHTML='<tr class="profiles-empty-row"><td colspan="13"><div class="profiles-empty-cell"><i class="fa-solid fa-users"></i><span>No profiles found</span><small>Add a profile or associate an existing profile with a requirement.</small></div></td></tr>'; } body.parentElement.classList.remove('hidden'); updateProfilesPagination(rows.length,totalPages,start,pageRows.length); updateProfilesListHeight(); }
  function hideProfileRowContextMenu(){ const menu=$('profileRowContextMenu'); if(menu)menu.classList.add('hidden'); }
  function selectProfileRow(profileId){ selectedProfileId=profileId||''; document.querySelectorAll('.profiles-table tbody tr.profile-row').forEach(row=>row.classList.toggle('profile-row-selected',String(row.dataset.profileRowId)===String(selectedProfileId))); }
  function positionProfileRowContextMenu(x,y){ const menu=$('profileRowContextMenu'); if(!menu)return; menu.classList.remove('hidden'); const rect=menu.getBoundingClientRect(); const left=Math.min(x,window.innerWidth-rect.width-8); const top=Math.min(y,window.innerHeight-rect.height-8); menu.style.left=Math.max(8,left)+'px'; menu.style.top=Math.max(8,top)+'px'; }
  function openProfileRowContextMenu(profileId,x,y){ const p=profiles.find(item=>String(item.id)===String(profileId)); if(!p)return; selectProfileRow(profileId); const title=$('profileRowContextMenuTitle'); if(title)title.textContent=`${p.full_name||'Profile'} — Actions`; const download=$('profileContextDownloadResumeButton'); if(download)download.classList.remove('hidden'); positionProfileRowContextMenu(x,y); }
  function openUpdateProfileStatusModal(profileId){
    const p=profiles.find(item=>String(item.id)===String(profileId));
    if(!p){message('Profile could not be found.','error');return;}
    $('updateProfileStatusName').textContent=p.full_name||'Profile';
    $('updateProfileCurrentStatus').textContent=p.status||'New';
    $('updateProfileStatusSelect').value=p.status||'New';
    $('updateProfileStatusNotes').value='';
    $('updateProfileStatusMessage').textContent='';
    $('saveUpdateProfileStatusButton').disabled=false;
    $('saveUpdateProfileStatusButton').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Status';
    $('updateProfileStatusModal').classList.remove('hidden');
    $('updateProfileStatusModal').setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    $('updateProfileStatusSelect').focus();
  }
  function closeUpdateProfileStatusModal(){
    $('updateProfileStatusModal').classList.add('hidden');
    $('updateProfileStatusModal').setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
  }
  async function saveUpdatedProfileStatus(){
    const id=selectedProfileId;
    const p=profiles.find(item=>String(item.id)===String(id));
    const status=$('updateProfileStatusSelect').value;
    const notes=$('updateProfileStatusNotes').value.trim();
    const msg=$('updateProfileStatusMessage'), btn=$('saveUpdateProfileStatusButton');
    if(!p){msg.textContent='Profile could not be found. Please close this window and try again.';return;}
    if(!status){msg.textContent='Please select a profile status.';return;}
    const statusChanged=String(p.status||'')!==status;
    if(!statusChanged&&!notes){msg.textContent='The selected status is already current. Enter an optional note if you want to record a history entry.';return;}
    btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…';msg.textContent='';
    try{
      if(statusChanged){
        const {error:updateError}=await supabase.from('profiles').update({status}).eq('id',id);
        if(updateError)throw updateError;
      }
      const userId=(await supabase.auth.getUser()).data.user?.id||null;
      const {error:historyError}=await supabase.from('profile_status_history').insert({
        profile_id:id,
        status,
        notes:notes||'Profile status updated',
        changed_at:new Date().toISOString(),
        changed_by:userId
      });
      if(historyError)throw new Error(statusChanged?`Profile status was updated, but status history could not be saved: ${historyError.message||String(historyError)}`:`Status history could not be saved: ${historyError.message||String(historyError)}`);
      const current=profiles.find(item=>String(item.id)===String(id));if(current)current.status=status;
      closeUpdateProfileStatusModal();
      await loadProfiles();
      message('Profile status and history updated successfully.','success');
    }catch(err){msg.textContent=err.message||String(err);}
    finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Status';}
  }
  async function handleProfileContextAction(action){ const id=selectedProfileId; if(!id)return; hideProfileRowContextMenu(); try{ if(action==='view')await openProfileDetails(id); else if(action==='edit')await editProfile(id); else if(action==='add-association')await openProfileAssociationModal(id); else if(action==='update-profile-status')openUpdateProfileStatusModal(id); else if(action==='download-resume'){const p=profiles.find(item=>String(item.id)===String(id));if(!p){message('Profile could not be found.','error');return;}await downloadProfileResume(p);} else if(action==='interviews')await openInterviews(id); else if(action==='edit-association')await openProfileAssociationContextAction(id,'edit'); else if(action==='association-history')await openProfileAssociationContextAction(id,'history'); else if(action==='add-profile-notes'){await openProfileLevelNotes(id);$('profileNoteText')?.focus();} else if(action==='view-profile-notes')await openProfileLevelNotes(id); else if(action==='add-association-notes'){await openProfileAssociationNotes(id);$('profileNoteText')?.focus();} else if(action==='view-association-notes')await openProfileAssociationNotes(id); else if(action==='remove-association')await openProfileAssociationRemoval(id); else if(action==='delete'){ const p=profiles.find(item=>String(item.id)===String(id)); deleteProfile(id,p?.full_name||'this profile'); } }catch(err){message(err.message||String(err),'error');} }

  function updateProfilesPagination(total,totalPages,start,count){ const wrap=$('profilesPagination'); if(!wrap)return; wrap.classList.toggle('hidden',total===0); if(!total)return; $('profilesPageInfo').textContent=`Showing ${start+1}-${start+count} of ${total}`; $('profilesPageNumber').textContent=`Page ${currentPage} of ${totalPages}`; $('profilesFirst').disabled=currentPage<=1; $('profilesPrev').disabled=currentPage<=1; $('profilesNext').disabled=currentPage>=totalPages; $('profilesLast').disabled=currentPage>=totalPages; }
  function goToProfilesPage(page){ const totalPages=Math.max(1,Math.ceil(filtered().length/PAGE_SIZE)); currentPage=Math.min(Math.max(1,page),totalPages); render(); }
  async function callProfileFunction(formData){ const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('Your session has expired. Please sign in again.'); const response=await fetch(window.NAVODIX_SUPABASE_URL+'/functions/v1/profile-management',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:formData}); const payload=await response.json().catch(()=>({})); if(!response.ok){ const raw=payload.error??payload.message; let detail='Profile operation failed.'; if(typeof raw==='string'&&raw.trim()) detail=raw; else if(raw&&typeof raw==='object') detail=raw.message||raw.details||raw.hint||raw.code||JSON.stringify(raw); throw new Error(detail); } return payload; }
  function formDataFromForm(){ const fd=new FormData(); $('profileAssociationRequirementId').value=$('profileRequirement').value||''; const fields={profile_id:$('profileId').value,requirement_id:$('profileAssociationRequirementId').value,full_name:$('fullName').value.trim(),email:$('email').value.trim(),phone:$('phone').value.trim(),alternate_phone:$('alternatePhone').value.trim(),current_location:$('currentLocation').value.trim(),preferred_location:$('preferredLocation').value.trim(),employment_status:$('employmentStatus')?.value.trim()??editingEmploymentStatus,availability:$('availability').value.trim(),current_job_title:$('currentJobTitle').value.trim(),current_company:$('currentCompany').value.trim(),total_experience:$('totalExperience').value.trim(),relevant_experience:$('relevantExperience')?.value.trim()??editingRelevantExperience,notice_period:$('noticePeriod').value.trim(),current_ctc:$('currentCtc').value.trim(),expected_ctc:$('expectedCtc').value.trim(),highest_qualification:$('highestQualification').value.trim(),specialization:$('specialization').value.trim(),graduation_year:$('graduationYear').value||'',linkedin_url:$('linkedinUrl').value.trim(),status:$('profileStatus').value,source:$('profileSource').value,source_details:$('sourceDetails').value.trim(),referrer_name:$('referrerName').value.trim(),referrer_mobile:$('referrerMobile').value.trim(),referrer_email:$('referrerEmail').value.trim(),skills:$('skills').value.trim(),additional_information:$('additionalInformation').value.trim(),replace_resume:String(!keepExistingResume)}; Object.entries(fields).forEach(([k,v])=>fd.append(k,v)); const file=$('resumeFile').files[0]; if(file){const selectedCategoryIds=selectedJobCategories();const selectedCategory=selectedCategoryIds.length===1?jobCategories.find(c=>String(c.id)===String(selectedCategoryIds[0])):null;const categoryCode=String(selectedCategory?.category_code||'').trim();const fullName=String($('fullName').value||'').trim().replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ');const extensionMatch=file.name.match(/\.(pdf|doc|docx)$/i);const extension=extensionMatch?extensionMatch[0]:'';const generatedName=categoryCode&&fullName&&extension?`Navodix_${categoryCode}_${fullName}${extension}`:file.name;const renamedFile=new File([file],generatedName,{type:file.type,lastModified:file.lastModified});fd.append('resume',renamedFile,generatedName);} return fd; }

  function validateProfileRequiredFields(){
    const form=$('profileForm');
    if(!form)return true;
    const requiredFields=[...form.querySelectorAll('[required]')];
    requiredFields.forEach(field=>field.removeAttribute('aria-invalid'));
    const missing=requiredFields.find(field=>{
      const value=field.type==='checkbox'?field.checked: String(field.value||'').trim();
      return !value;
    });
    if(!missing){formMessage('');return true;}
    const label=missing.labels?.[0]?.textContent?.replace(/\*/g,'').trim()
      ||missing.closest('.field-group')?.querySelector('label')?.textContent?.replace(/\*/g,'').trim()
      ||missing.id;
    formMessage(`${label} is required.`,'error');
    const panel=missing.closest('.npp-tab-panel');
    if(panel&&panel.hidden){
      const tabButton=document.querySelector(`[data-profile-tab="${panel.id}"]`);
      if(tabButton)tabButton.click();
    }
    missing.setAttribute('aria-invalid','true');
    requestAnimationFrame(()=>{
      missing.focus({preventScroll:true});
      missing.scrollIntoView({block:'center',behavior:'smooth'});
    });
    return false;
  }
  async function saveProfile(e, closeAfterSave=false){
    if(e&&typeof e.preventDefault==='function')e.preventDefault(); if(saving)return;
    if(!validateProfileRequiredFields())return;
    const file=$('resumeFile').files[0]; if(file){if(file.size>5*1024*1024){formMessage('Resume must be 5 MB or smaller.','error');return;}if(!/\.(pdf|doc|docx)$/i.test(file.name)){formMessage('Resume must be PDF, DOC or DOCX.','error');return;}}
    const editingProfileId=$('profileId').value, newStatus=$('profileStatus').value, statusChanged=Boolean(editingProfileId&&editingOriginalStatus&&String(editingOriginalStatus)!==String(newStatus)), saveStartedAt=new Date().toISOString();
    saving=true;$('saveProfileButton').disabled=true;$('saveProfileCloseButton').disabled=true;$('saveProfileButton').innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…';$('saveProfileCloseButton').innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…';formMessage('Saving profile…');
    try{
      const result=await callProfileFunction(formDataFromForm());
      if(result.duplicate&&result.profile_id&&!editingProfileId){formMessage('An existing profile was found. Please use the existing profile instead of creating a duplicate.','error');return;}
      if(result.resume_existing&&!result.resume_replaced){$('resumeReplaceNotice').classList.remove('hidden');formMessage('An existing resume is already stored. Choose Keep Existing Resume or Replace with New Resume.','');return;}
      const savedProfileId=result.profile_id||editingProfileId; if(savedProfileId)await saveProfileCategories(savedProfileId);
      if(statusChanged&&savedProfileId){
        const userId=(await supabase.auth.getUser()).data.user?.id||null;
        const {error:historyError}=await supabase.from('profile_status_history').insert({
          profile_id:savedProfileId,
          status:newStatus,
          notes:'Profile status updated',
          changed_at:new Date().toISOString(),
          changed_by:userId
        });
        if(historyError)throw new Error(`Profile was saved, but the status history could not be recorded: ${historyError.message||String(historyError)}`);
      }
      formMessage(result.associated?'Successfully saved and automatically associated with the requirement.':'Successfully saved.','success'); message(result.associated?'Profile saved and automatically associated with the requirement.':'Profile saved successfully.','success'); editingOriginalStatus=newStatus; await loadProfiles();
      if(closeAfterSave){
        hideProfileModal();
      }else if(!editingProfileId){
        resetForm();
        populateRequirementOptions(requirementId||'');
        if(requirement){
          $('profileRequirement').value=requirement.id;
          $('profileAssociationRequirementId').value=requirement.id;
          $('existingProfileNotice').innerHTML='<strong>Requirement:</strong> '+esc(requirement.job_code)+' — '+esc(requirement.title)+'<br><small>This profile will be automatically associated with this requirement when saved.</small>';
          $('existingProfileNotice').classList.remove('hidden');
        }
        showModal();
        focusProfileFormStart();
      }
    }catch(err){console.error(err);formMessage(err.message||String(err),'error');}
    finally{saving=false;$('saveProfileButton').disabled=false;$('saveProfileButton').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Profile';$('saveProfileCloseButton').disabled=false;$('saveProfileCloseButton').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save & Close';}
  }

  function interviewMessage(text,type=''){ $('interviewMessage').textContent=text||''; $('interviewMessage').className='admin-message'+(type?' '+type:''); }
  function interviewFormMessage(text,type=''){ $('interviewFormMessage').textContent=text||''; $('interviewFormMessage').className='admin-message'+(type?' '+type:''); }
  function closeInterviewModal(){ hideInterviewRowContextMenu(); $('interviewModal').classList.add('hidden'); $('interviewModal').setAttribute('aria-hidden','true'); if(!$('interviewFormModal').classList.contains('hidden')){ $('interviewFormModal').classList.add('hidden'); $('interviewFormModal').setAttribute('aria-hidden','true'); } document.body.classList.remove('modal-open'); interviewProfile=null; interviewRequirementId=''; interviewAssociationId=''; interviewRequirementLabel=''; }
  function closeInterviewFormModal(){ if(interviewSaving)return; $('interviewFormModal').classList.add('hidden'); $('interviewFormModal').setAttribute('aria-hidden','true'); $('interviewForm').reset(); $('interviewId').value=''; $('interviewRound').dataset.roundNumber=''; interviewFormMessage(''); }
  function openInterviewForm(interview=null){ $('interviewForm').reset(); $('interviewId').value=interview?.id||''; $('interviewRound').dataset.roundNumber=interview?.round_number||''; $('interviewFormTitle').textContent=(interview?'Edit Interview Record : ':'Add Interview Record : ')+(interviewProfile?.full_name||''); $('interviewFormNumber').textContent=interview?`Round ${interview.round_number||''} details`:'Interview details'; $('interviewRound').value=interview?.round_name||''; $('interviewDate').value=interview?.scheduled_date||''; $('interviewTime').value=interview?.scheduled_time ? String(interview.scheduled_time).slice(0,5):''; $('interviewMode').value=interview?.mode||'Phone'; $('interviewInterviewer').value=interview?.interviewer||''; $('interviewResult').value=interview?.result||'Pending'; $('interviewFeedback').value=interview?.feedback||''; $('saveInterviewButton').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Interview Record'; interviewFormMessage(''); $('interviewFormModal').classList.remove('hidden'); $('interviewFormModal').setAttribute('aria-hidden','false'); }
  function interviewResultClass(result){ const v=String(result||'').toLowerCase().replace(/\s+/g,'_'); return v==='passed'?'passed':v==='failed'?'failed':v==='pending'?'pending':v==='cancelled'?'cancelled':v==='rescheduled'?'rescheduled':v==='no_show'?'no-show':''; }
  function formatInterviewTime(value){ if(!value)return '—'; const raw=String(value).slice(0,5); const parts=raw.split(':'); if(parts.length<2)return raw; const h=Number(parts[0]), m=parts[1]; if(Number.isNaN(h))return raw; const suffix=h>=12?'PM':'AM'; const hour12=(h%12)||12; return `${hour12}:${m} ${suffix}`; }
  let selectedInterviewId = '';
  function hideInterviewRowContextMenu(){ const menu=$('interviewRowContextMenu'); if(menu)menu.classList.add('hidden'); }
  function selectInterviewRow(id){ selectedInterviewId=String(id||''); $('interviewTableBody')?.querySelectorAll('tr[data-interview-row-id]').forEach(row=>row.classList.toggle('interview-row-selected',row.dataset.interviewRowId===selectedInterviewId)); }
  function openInterviewRowContextMenu(id,x,y){ const row=$('interviewTableBody')?.querySelector(`tr[data-interview-row-id="${CSS.escape(String(id))}"]`); if(!row)return; selectInterviewRow(id); const menu=$('interviewRowContextMenu'); if(!menu)return; menu.classList.remove('hidden'); const width=menu.offsetWidth||210,height=menu.offsetHeight||100; menu.style.left=Math.max(8,Math.min(x,window.innerWidth-width-8))+'px'; menu.style.top=Math.max(8,Math.min(y,window.innerHeight-height-8))+'px'; }
  function openDeleteInterviewConfirm(id){ if(!id)return; pendingDeleteInterviewId=String(id); const row=$('interviewTableBody')?.querySelector(`tr[data-interview-row-id="${CSS.escape(String(id))}"]`); const roundName=row?.children?.[1]?.textContent?.trim()||'this interview record'; const modal=$('interviewDeleteConfirmModal'); $('deleteInterviewConfirmText').textContent=`Are you sure you want to delete ${roundName}? This action cannot be undone.`; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function closeDeleteInterviewConfirm(){ const modal=$('interviewDeleteConfirmModal'); modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); pendingDeleteInterviewId=''; if($('interviewModal')?.classList.contains('hidden')&&$('interviewFormModal')?.classList.contains('hidden'))document.body.classList.remove('modal-open'); }
  async function deleteInterviewRound(){ if(!pendingDeleteInterviewId)return; const id=pendingDeleteInterviewId; const btn=$('confirmDeleteInterviewButton'); if(btn)btn.disabled=true; try{const {error}=await supabase.from('profile_requirement_interviews').delete().eq('id',id);if(error)throw error;closeDeleteInterviewConfirm();hideInterviewRowContextMenu();await loadInterviews();}catch(err){closeDeleteInterviewConfirm();interviewMessage(err.message||String(err),'error');}finally{if(btn)btn.disabled=false;} }
  async function loadInterviews(){ if(!interviewProfile||!interviewRequirementId)return; interviewMessage('Loading interviews…'); const {data,error}=await supabase.from('profile_requirement_interviews').select('id,profile_id,requirement_id,association_id,round_number,round_name,scheduled_date,scheduled_time,mode,interviewer,result,feedback,created_at,updated_at').eq('profile_id',interviewProfile.id).eq('requirement_id',interviewRequirementId).order('round_number',{ascending:true}).order('scheduled_date',{ascending:true}); if(error){interviewMessage(error.message,'error');return;} const rows=data||[]; const body=$('interviewTableBody'); body.innerHTML=rows.map((x,i)=>`<tr data-interview-row-id="${esc(x.id)}" tabindex="0"><td>${i+1}</td><td>${esc(x.round_name||('Round '+x.round_number))}</td><td><span class="profile-interview-result ${interviewResultClass(x.result)}">${esc(x.result||'—')}</span></td><td>${esc(x.scheduled_date||'—')}</td><td>${esc(formatInterviewTime(x.scheduled_time))}</td><td>${esc(x.mode||'—')}</td><td>${esc(x.interviewer||'—')}</td><td class="profile-interview-feedback-cell" title="${esc(x.feedback||'')}">${esc(x.feedback||'—')}</td></tr>`).join(''); $('noInterviews').classList.toggle('hidden',rows.length!==0); $('interviewTableWrap')?.classList.remove('hidden'); if(selectedInterviewId&&!rows.some(x=>String(x.id)===selectedInterviewId))selectedInterviewId=''; selectInterviewRow(selectedInterviewId); interviewMessage(''); }
  async function openInterviewsForAssociation(profileId, associationId, reqId, label='Requirement'){ const p=profiles.find(x=>String(x.id)===String(profileId)); if(!p||!reqId)return; interviewProfile=p; interviewRequirementId=reqId; interviewAssociationId=associationId||''; interviewRequirementLabel=label||'Requirement'; $('interviewContext').innerHTML='<div class="interview-context-row"><span class="interview-context-label">Profile :</span><span class="interview-context-value">'+esc(p.full_name)+' ('+esc(p.profile_number)+')</span></div><div class="interview-context-row"><span class="interview-context-label">Requirement :</span><span class="interview-context-value">'+esc(interviewRequirementLabel)+'</span></div>'; $('interviewModalTitle').textContent='Interview Rounds — '+interviewRequirementLabel; $('interviewModal').classList.remove('hidden'); $('interviewModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); await loadInterviews(); }
  function showInterviewRoundsInfo(text){ const modal=$('interviewRoundsInfoModal'); if(!modal)return; $('interviewRoundsInfoMessage').textContent=text||''; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function closeInterviewRoundsInfo(){ const modal=$('interviewRoundsInfoModal'); if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');} if($('interviewRequirementPickerModal')?.classList.contains('hidden')&&$('interviewModal')?.classList.contains('hidden'))document.body.classList.remove('modal-open'); }
  function preserveAssociationPickerSelection(profileId){
    associationPickerProfileId = String(profileId || selectedProfileId || '');
    if(associationPickerProfileId) selectProfileRow(associationPickerProfileId);
  }
  function restoreAssociationPickerSelection(){
    const id = associationPickerProfileId;
    if(!id) return;
    selectedProfileId = id;
    requestAnimationFrame(() => {
      if(profiles.some(p => String(p.id) === id)) selectProfileRow(id);
    });
  }

  async function openProfileAssociationNotes(id){
    preserveAssociationPickerSelection(id);
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    const associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(!associations.length){
      if(typeof showInterviewRoundsInfo==='function')showInterviewRoundsInfo('This profile is not associated with any requirement. Associate it with a requirement before adding profile association notes.');
      else message('This profile is not associated with any requirement. Associate it with a requirement before adding profile association notes.','info');
      return;
    }
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{const key=String(a.requirement_id);if(!seen.has(key)){seen.add(key);const r=requirements.find(x=>String(x.id)===key);unique.push({association:a,requirementId:key,label:r?`${r.title||'Requirement'} - ${String(r.location||'').trim()} - ${r.client_name||''}`:(a.requirement_title||a.title||'Requirement')});}});
    if(requirementId){const chosen=unique.find(x=>String(x.requirementId)===String(requirementId));if(chosen){await openProfileRequirementNotes(id,chosen.requirementId,chosen.label);return;}}
    if(unique.length===1){const x=unique[0];await openProfileRequirementNotes(id,x.requirementId,x.label);return;}
    const select=$('interviewRequirementPicker'); if(!select){message('Unable to select a requirement for profile association notes. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerTitle').textContent='Select Requirement';
    $('interviewRequirementPickerMessage').textContent=`${p.full_name} is associated with multiple requirements. Select the requirement for which you want to add profile association notes.`;
    const pickerError=$('interviewRequirementPickerError');if(pickerError)pickerError.textContent='';select.value='';
    preserveAssociationPickerSelection(id);$('interviewRequirementPickerModal').classList.remove('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{const value=select.value;if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}const x=unique[Number(value)];if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}if(pickerError)pickerError.textContent='';$('interviewRequirementPickerModal').classList.add('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');restoreAssociationPickerSelection();await openProfileRequirementNotes(id,x.requirementId,x.label);};
  }
  async function openProfileAssociationContextAction(id, action){
    preserveAssociationPickerSelection(id);
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    let associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(requirementId) associations=associations.filter(a=>String(a.requirement_id)===String(requirementId));
    if(!associations.length){
      showInterviewRoundsInfo(requirementId
        ? 'This profile has no association with the current requirement.'
        : 'This profile is not associated with any requirement. Associate it with a requirement first.');
      return;
    }
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{
      const key=String(a.requirement_id);
      if(!seen.has(key)){
        seen.add(key);
        const r=requirements.find(x=>String(x.id)===key);
        unique.push({association:a,requirementId:key,requirementName:r?(r.title||'Requirement'):(a.requirement_title||a.title||'Requirement'),label:r?`${r.title||'Requirement'} - ${String(r.location||'').trim()} - ${r.client_name||''}`:(a.requirement_title||a.title||'Requirement')});
      }
    });
    const runAction=async x=>{
      if(action==='edit') await openProfileAssociationModal(id,x.association.id);
      else await openAssociationStatusHistory(x.association.id,x.requirementName,p.full_name||'—');
    };
    if(unique.length===1){await runAction(unique[0]);return;}
    const select=$('interviewRequirementPicker');
    if(!select){message('Unable to select a requirement. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerTitle').textContent='Select Requirement';
    $('interviewRequirementPickerMessage').textContent=action==='edit'
      ? `${p.full_name} is associated with multiple requirements. Select the association you want to edit.`
      : `${p.full_name} is associated with multiple requirements. Select the requirement whose association status history you want to view.`;
    const pickerError=$('interviewRequirementPickerError'); if(pickerError)pickerError.textContent=''; select.value='';
    preserveAssociationPickerSelection(id);$('interviewRequirementPickerModal').classList.remove('hidden'); $('interviewRequirementPickerModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{
      const value=select.value;
      if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}
      const x=unique[Number(value)];
      if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}
      if(pickerError)pickerError.textContent='';
      $('interviewRequirementPickerModal').classList.add('hidden'); $('interviewRequirementPickerModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');restoreAssociationPickerSelection();
      await runAction(x);
    };
  }

  async function openProfileAssociationRemoval(id){
    preserveAssociationPickerSelection(id);
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    const associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(!associations.length){showInterviewRoundsInfo('This profile is not associated with any requirement. Associate it with a requirement before removing an association.');return;}
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{const key=String(a.requirement_id);if(!seen.has(key)){seen.add(key);const r=requirements.find(x=>String(x.id)===key);unique.push({association:a,requirementId:key,label:r?`${r.title||'Requirement'} - ${String(r.location||'').trim()} - ${r.client_name||''}`:(a.requirement_title||a.title||'Requirement')});}});
    if(requirementId){const chosen=unique.find(x=>String(x.requirementId)===String(requirementId));if(chosen){await removeProfileAssociation(id,chosen.association.id,chosen.label,p.full_name);return;}}
    if(unique.length===1){const x=unique[0];await removeProfileAssociation(id,x.association.id,x.label,p.full_name);return;}
    const select=$('interviewRequirementPicker'); if(!select){message('Unable to select a requirement. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerTitle').textContent='Select Requirement'; $('interviewRequirementPickerMessage').textContent=`${p.full_name} is associated with multiple requirements. Select the association you want to remove.`;
    const pickerError=$('interviewRequirementPickerError');if(pickerError)pickerError.textContent='';select.value='';
    preserveAssociationPickerSelection(id);$('interviewRequirementPickerModal').classList.remove('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{const value=select.value;if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}const x=unique[Number(value)];if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}if(pickerError)pickerError.textContent='';$('interviewRequirementPickerModal').classList.add('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');restoreAssociationPickerSelection();await removeProfileAssociation(id,x.association.id,x.label,p.full_name);};
  }

  async function openInterviews(id){
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    if(requirementId){ const assoc=p.associations?.find(a=>String(a.requirement_id)===String(requirementId)); await openInterviewsForAssociation(id,assoc?.id||'',requirementId,`${requirement?.job_code||''} — ${requirement?.title||'Requirement'}`); return; }
    const associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(!associations.length){ showInterviewRoundsInfo('This profile is not associated with any requirement. Associate it with a requirement before managing interview rounds.'); return; }
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{const key=String(a.requirement_id); if(!seen.has(key)){seen.add(key);const r=requirements.find(x=>String(x.id)===key); unique.push({association:a, requirementId:key, label:r?`${r.title||'Requirement'} - ${String(r.location||'').trim()} - ${r.client_name||''}`:(a.requirement_title||a.title||'Requirement')});}});
    if(unique.length===1){const x=unique[0];await openInterviewsForAssociation(id,x.association.id,x.requirementId,x.label);return;}
    const select=$('interviewRequirementPicker'); if(!select){message('Unable to select a requirement for interview rounds. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerMessage').textContent=`${p.full_name} is associated with multiple requirements. Select the requirement whose interview rounds you want to manage.`;
    const pickerError=$('interviewRequirementPickerError');if(pickerError)pickerError.textContent='';select.value='';
    preserveAssociationPickerSelection(id);$('interviewRequirementPickerModal').classList.remove('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{const value=select.value;if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}const x=unique[Number(value)];if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}if(pickerError)pickerError.textContent='';$('interviewRequirementPickerModal').classList.add('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');restoreAssociationPickerSelection();await openInterviewsForAssociation(id,x.association.id,x.requirementId,x.label);};
  }
  function closeInterviewRequirementPicker(){const modal=$('interviewRequirementPickerModal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}if($('interviewRequirementPickerError'))$('interviewRequirementPickerError').textContent='';document.body.classList.remove('modal-open');restoreAssociationPickerSelection();}
  async function saveInterview(e){ e.preventDefault(); if(interviewSaving||!interviewProfile||!interviewRequirementId)return; const round=$('interviewRound').value.trim(); if(!round||!$('interviewDate').value||!$('interviewInterviewer').value.trim()||!$('interviewMode').value){interviewFormMessage('Please complete all required interview fields.','error');return;} interviewSaving=true; const btn=$('saveInterviewButton'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; interviewFormMessage('Saving interview…'); try{ const id=$('interviewId').value; const payload={profile_id:interviewProfile.id,requirement_id:interviewRequirementId,association_id:interviewAssociationId||null,round_name:round,round_number:parseInt((id?$('interviewRound').dataset.roundNumber:'')||'0',10)||1,scheduled_date:$('interviewDate').value||null,scheduled_time:$('interviewTime').value||null,mode:$('interviewMode').value||null,interviewer:$('interviewInterviewer').value.trim()||null,result:$('interviewResult').value||null,feedback:$('interviewFeedback').value.trim()||null,updated_by:(await supabase.auth.getUser()).data.user?.id||null}; let result; if(id){ result=await supabase.from('profile_requirement_interviews').update(payload).eq('id',id); } else { const {data:existing,error:exErr}=await supabase.from('profile_requirement_interviews').select('round_number').eq('profile_id',interviewProfile.id).eq('requirement_id',interviewRequirementId).order('round_number',{ascending:false}).limit(1); if(exErr)throw exErr; payload.round_number=(existing?.[0]?.round_number||0)+1; payload.created_by=payload.updated_by; result=await supabase.from('profile_requirement_interviews').insert(payload); } if(result.error)throw result.error; interviewFormMessage('Interview saved successfully.','success'); await loadInterviews(); setTimeout(closeInterviewFormModal,500); }catch(err){console.error(err);interviewFormMessage(err.message||String(err),'error');}finally{interviewSaving=false;btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Interview Record';} }

  async function editProfile(id){ const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error)throw error; resetForm(); renderJobCategories([]); const categoryIds=await getProfileCategories(id); renderJobCategories(categoryIds); $('profileId').value=data.id; await loadCurrentAssociation(data.id); editingOriginalStatus=data.status||''; $('fullName').value=data.full_name||'';$('email').value=data.email||'';$('phone').value=data.phone||'';$('alternatePhone').value=data.alternate_phone||'';populateLocationOptions(data.current_location||'',data.preferred_location||'');editingEmploymentStatus=data.employment_status||''; if($('employmentStatus'))$('employmentStatus').value=editingEmploymentStatus;$('availability').value=data.availability||'';$('currentJobTitle').value=data.current_job_title||'';$('currentCompany').value=data.current_company||'';$('totalExperience').value=data.total_experience||'';editingRelevantExperience=data.relevant_experience||''; if($('relevantExperience'))$('relevantExperience').value=editingRelevantExperience;$('noticePeriod').value=data.notice_period||'';$('currentCtc').value=data.current_ctc||'';$('expectedCtc').value=data.expected_ctc||'';$('highestQualification').value=data.highest_qualification||'';$('specialization').value=data.specialization||'';$('graduationYear').value=data.graduation_year||'';$('linkedinUrl').value=data.linkedin_url||'';$('skills').value=data.skills||''; if(data.resume_file_name){$('existingResumeFilename').textContent=data.resume_file_name;$('existingResumeFilename').title=data.resume_file_name;$('existingResumeFilename').classList.remove('hidden');$('resumeExistingRow').classList.remove('hidden');$('resumeDocumentStatus').textContent='Resume attached';$('resumeDocumentStatus').classList.add('has-document');}$('additionalInformation').value=data.additional_information||'';$('profileStatus').value=data.status||'New'; populateRequirementOptions(requirementId||''); $('profileRequirement').value=requirementId||''; $('profileAssociationRequirementId').value=requirementId||''; const {data:src}=await supabase.from('profile_sources').select('source,source_details,referrer_name,referrer_mobile,referrer_email').eq('profile_id',id).eq('is_primary',true).maybeSingle(); if(src){$('profileSource').value=src.source||'';$('sourceDetails').value=src.source_details||'';$('referrerName').value=src.referrer_name||'';$('referrerMobile').value=src.referrer_mobile||'';$('referrerEmail').value=src.referrer_email||'';toggleReferrerFields();} $('profileModalTitle').innerHTML=`Edit Profile : <span class="profile-header-name">${esc(data.full_name||'Profile')}</span> <span class="profile-header-code">(${esc(data.profile_number||'')})</span>`; updateProfileFormHero(); if(requirement){$('existingProfileNotice').innerHTML='<strong>Requirement:</strong> '+esc(requirement.job_code)+' — '+esc(requirement.title)+'<br><small>Saving will keep this profile associated with the requirement.</small>';$('existingProfileNotice').classList.remove('hidden');} showModal(); focusProfileFormStart(); }
  function populateExistingProfileFilters(){
    const configs=[['existingProfileCurrentLocationFilter','All Cur Locations','current_location'],['existingProfilePreferredLocationFilter','All Pref Locations','preferred_location'],['existingProfileStatusFilter','All Profile Statuses','status']];
    configs.forEach(([id,placeholder,key])=>{const select=$(id);if(!select)return;const selected=select.value;const values=[...new Set(allExistingProfiles.map(p=>String(p[key]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));select.innerHTML=`<option value="">${placeholder}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');select.value=values.includes(selected)?selected:'';});
  }
  function renderExistingProfiles(){ const body=$('existingProfileTableBody'); const term=$('existingProfileSearch').value.trim().toLowerCase(); const currentLocation=$('existingProfileCurrentLocationFilter')?.value||''; const preferredLocation=$('existingProfilePreferredLocationFilter')?.value||''; const status=$('existingProfileStatusFilter')?.value||''; const rows=allExistingProfiles.filter(p=>(!term||[p.profile_number,p.full_name,p.email,p.phone,p.current_location,p.preferred_location,p.current_job_title,p.status].some(v=>String(v||'').toLowerCase().includes(term)))&&(!currentLocation||String(p.current_location||'')===currentLocation)&&(!preferredLocation||String(p.preferred_location||'')===preferredLocation)&&(!status||String(p.status||'')===status)); body.innerHTML=rows.map(p=>`<tr><td><div class="profile-name-cell"><strong>${esc(p.full_name)}</strong><span>${esc(p.profile_number)} · ${esc(p.current_job_title||'')}</span></div></td><td>${esc(p.current_location||'—')}</td><td>${esc(p.preferred_location||'—')}</td><td><span class="status-pill ${statusClass(p.status)}">${esc(p.status||'—')}</span></td><td><button class="btn btn-primary btn-small" data-existing-associate="${p.id}"><i class="fa-solid fa-link" aria-hidden="true"></i> Associate</button></td></tr>`).join(''); if(!rows.length){ body.innerHTML='<tr class="profiles-empty-row existing-profile-empty-row"><td colspan="5"><div class="profiles-empty-cell"><i class="fa-solid fa-users" aria-hidden="true"></i><span>No profiles found</span></div></td></tr>'; $('existingProfileMessage').textContent=''; } else $('existingProfileMessage').textContent=''; }
  async function openExistingProfileModal(){ if(!requirementId||!requirement)return; $('existingProfileSearch').value=''; ['existingProfileCurrentLocationFilter','existingProfilePreferredLocationFilter','existingProfileStatusFilter'].forEach(id=>{if($(id))$(id).value='';}); $('existingProfileMessage').textContent='Loading profiles…'; $('existingProfileModal').classList.remove('hidden'); $('existingProfileModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); const {data,error}=await supabase.from('profiles').select('id,profile_number,full_name,email,phone,current_location,preferred_location,current_job_title,status').order('full_name'); if(error){$('existingProfileMessage').textContent=error.message;return;} const {data:assoc,error:assocError}=await supabase.from('profile_requirement_associations').select('profile_id').eq('requirement_id',requirementId); if(assocError){$('existingProfileMessage').textContent=assocError.message;return;} const associatedIds=new Set((assoc||[]).map(x=>x.profile_id)); allExistingProfiles=(data||[]).filter(p=>!associatedIds.has(p.id)); populateExistingProfileFilters(); $('existingProfileSearch').value=''; ['existingProfileCurrentLocationFilter','existingProfilePreferredLocationFilter','existingProfileStatusFilter'].forEach(id=>{const el=$(id);if(el){el.value='';el.classList.remove('profile-filter-active');}}); renderExistingProfiles(); }
  function closeExistingProfileModal(){ $('existingProfileModal').classList.add('hidden'); $('existingProfileModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  function openAssociateRequirementModal(id){ const p=profiles.find(x=>x.id===id); profileToAssociate={id,name:p?.full_name||'Profile'}; $('associateRequirementProfileName').textContent=p?.full_name ? `${p.full_name} (${p.profile_number||''})` : id; const profileDisplay=$('associateRequirementProfileDisplay'); if(profileDisplay) profileDisplay.textContent=p?.full_name ? `${p.full_name} (${p.profile_number||''})` : id; $('associateRequirementSelect').innerHTML='<option value="">Select Requirement</option>'+requirements.map(r=>`<option value="${esc(r.id)}">${esc(r.title||'Requirement')}${r.location?` - ${esc(r.location)}`:''}</option>`).join(''); $('associateRequirementSelect').value=''; $('associateRequirementMessage').textContent=''; $('associateRequirementMessage').className='admin-message'; $('associateRequirementModal').classList.remove('hidden'); $('associateRequirementModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function closeAssociateRequirementModal(){ profileToAssociate=null; $('associateRequirementModal').classList.add('hidden'); $('associateRequirementModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  async function saveAssociateRequirement(){ if(!profileToAssociate)return; const reqId=$('associateRequirementSelect').value; if(!reqId){ $('associateRequirementMessage').textContent='Please select a requirement.'; $('associateRequirementMessage').className='admin-message error'; return; } const btn=$('saveAssociateRequirementButton'); btn.disabled=true; $('associateRequirementMessage').textContent='Associating profile…'; $('associateRequirementMessage').className='admin-message'; try{ const {data:created,error}=await supabase.from('profile_requirement_associations').upsert({profile_id:profileToAssociate.id,requirement_id:reqId,status:'New',association_type:'manual'},{onConflict:'profile_id,requirement_id'}).select('id,status').single(); if(error)throw error; await recordInitialAssociationStatus(created.id,'New',''); $('associateRequirementMessage').textContent='Profile associated successfully with the requirement.'; $('associateRequirementMessage').className='admin-message success'; message('Profile associated successfully with the requirement.','success'); await loadProfiles(); setTimeout(closeAssociateRequirementModal,500); }catch(err){ $('associateRequirementMessage').textContent=err.message||String(err); $('associateRequirementMessage').className='admin-message error'; } finally { btn.disabled=false; } }
  async function associateProfile(id){ if(requirementId){ const {data:created,error}=await supabase.from('profile_requirement_associations').upsert({profile_id:id,requirement_id:requirementId,status:'New',association_type:'manual'},{onConflict:'profile_id,requirement_id'}).select('id,status').single(); if(error)throw error; await recordInitialAssociationStatus(created.id,'New',''); message('Profile associated successfully with the requirement.','success'); await loadProfiles(); return; } openAssociateRequirementModal(id); }

  ['fullName','totalExperience','currentCtc','expectedCtc','noticePeriod','profileStatus'].forEach(id=>$(id)?.addEventListener('input',updateProfileFormHero)); $('profileStatus').addEventListener('change',updateProfileFormHero);
  $('profileRequirement').addEventListener('change',()=>{ $('profileAssociationRequirementId').value=$('profileRequirement').value||''; }); $('profileSource').addEventListener('change',toggleReferrerFields); $('resumeFile').addEventListener('change',()=>{const file=$('resumeFile').files[0];$('resumeSelectedFileName').textContent=file?file.name:'No file selected';$('clearResumeSelectionButton').classList.toggle('hidden',!file);selectedExistingResume=Boolean($('profileId').value);if(file){$('resumeDocumentStatus').textContent='Resume selected';$('resumeDocumentStatus').classList.add('has-document');}else if(!$('existingResumeFilename').textContent){$('resumeDocumentStatus').textContent='No resume attached';$('resumeDocumentStatus').classList.remove('has-document');}if(selectedExistingResume&&file)$('resumeReplaceNotice').classList.remove('hidden');}); $('clearResumeSelectionButton').addEventListener('click',()=>{$('resumeFile').value='';$('resumeSelectedFileName').textContent='No file selected';$('clearResumeSelectionButton').classList.add('hidden');$('resumeReplaceNotice').classList.add('hidden');if($('existingResumeFilename').textContent){$('resumeDocumentStatus').textContent='Resume attached';$('resumeDocumentStatus').classList.add('has-document');}else{$('resumeDocumentStatus').textContent='No resume attached';$('resumeDocumentStatus').classList.remove('has-document');}}); $('keepResumeButton').addEventListener('click',()=>{keepExistingResume=true;$('resumeFile').value='';$('resumeReplaceNotice').classList.add('hidden');formMessage('Existing resume will be kept.','');}); $('replaceResumeButton').addEventListener('click',()=>{keepExistingResume=false;$('resumeReplaceNotice').classList.add('hidden');formMessage('New resume will replace the existing resume when saved.','');}); $('addProfileButton').addEventListener('click',openAdd); $('closeProfileModal').addEventListener('click',closeModal); $('cancelProfileButton').addEventListener('click',closeModal); $('saveProfileCloseButton').addEventListener('click',()=>{ saveProfile(null,true); }); $('profileForm').addEventListener('submit',saveProfile);
    $('profileForm').querySelectorAll('[required]').forEach(field=>{
      field.addEventListener('input',()=>{field.removeAttribute('aria-invalid');});
      field.addEventListener('change',()=>{field.removeAttribute('aria-invalid');});
    });
    $('profileModal').addEventListener('keydown',event=>{
      if($('profileModal').classList.contains('hidden'))return;
      if(event.key==='Escape'){
        event.preventDefault();
        event.stopPropagation();
        $('cancelProfileButton')?.click();
        return;
      }
      if(event.key==='Enter' && event.target.tagName!=='TEXTAREA' && !event.target.isContentEditable){
        if(event.target.id==='saveProfileButton' || event.target.id==='saveProfileCloseButton')return;
        event.preventDefault();
        event.stopPropagation();
        $('saveProfileButton')?.click();
      }
    });
 $('profileSearch').addEventListener('input',()=>{currentPage=1;render();}); setupProfileMultiFilters(); $('profileRecordStatusFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileSourceFilter').addEventListener('change',()=>{currentPage=1;render();});  $('profileClientFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileLocationFilter').addEventListener('change',()=>{currentPage=1;render();});
  $('submittedDateFrom').addEventListener('change',()=>{currentPage=1;render();}); $('submittedDateTo').addEventListener('change',()=>{currentPage=1;render();});
  $('clearProfileFiltersButton').addEventListener('click',()=>{
    $('submittedDateFrom').value='';
    $('submittedDateTo').value='';
    $('profileSearch').value='';
    $('profileStatusFilter').value='';
    selectedAssociationStatuses=[];
    $('profileRecordStatusFilter').value='';
    $('profileSourceFilter').value='';
    $('profileRequirementFilter').value='';
    selectedRequirementFilters=[];
    refreshMultiFilter('profileStatusFilter');
    refreshMultiFilter('profileRequirementFilter');
    $('profileClientFilter').value='';
    $('profileLocationFilter').value='';
    currentPage=1;
    render();
  });
  $('profilesColumnsButton').addEventListener('click',e=>{
    e.stopPropagation();
    $('profilesColumnsPopover').classList.toggle('hidden');
  });
  $('profilesColumnsPopover').addEventListener('click',e=>e.stopPropagation());
  $('profilesColumnsPopover').querySelectorAll('[data-profile-col]').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const col=Number(cb.dataset.profileCol)+1;
      document.querySelectorAll('.profiles-table tr').forEach(row=>{
        const cell=row.children[col-1];
        if(cell) cell.style.display=cb.checked?'':'none';
      });
    });
  });
  document.addEventListener('click',e=>{
    const popover=$('profilesColumnsPopover');
    const button=$('profilesColumnsButton');
    if(popover&&!popover.classList.contains('hidden')&&!popover.contains(e.target)&&e.target!==button) popover.classList.add('hidden');
  });
  // Profiles Excel export: dynamic database fields, ordered columns, content-fit widths and R2-backed templates.
  const exportModal=$('profilesExportModal');
  const exportMessage=(text,type='')=>{const el=$('exportTemplateMessage');if(el){el.textContent=text||'';el.className='admin-message'+(type?' '+type:'');}};
  const exportTemplateDeleteModal=$('exportTemplateDeleteConfirmModal');let pendingExportTemplateDeleteName='';
  function openExportTemplateDeleteConfirm(name){pendingExportTemplateDeleteName=name;$('deleteExportTemplateConfirmText').textContent=`Are you sure you want to delete template “${name}”? This action cannot be undone.`;exportTemplateDeleteModal?.classList.remove('hidden');exportTemplateDeleteModal?.setAttribute('aria-hidden','false');}
  function closeExportTemplateDeleteConfirm(){exportTemplateDeleteModal?.classList.add('hidden');exportTemplateDeleteModal?.setAttribute('aria-hidden','true');pendingExportTemplateDeleteName='';}
  let profileExportFields=[];
  const exportVirtualFields=[
    ['serial_number','Serial Number',14,()=> ''],
    ['requirement','Requirement',30,p=>p.latestRequirementName],
    ['all_requirements','All Associated Requirements',45,p=>(p.associations||[]).map(a=>requirements.find(r=>String(r.id)===String(a.requirement_id))?.title||'Requirement').filter((v,i,a)=>a.indexOf(v)===i).join(', ')],
    ['association_status','Association Status',22,p=>displayedAssociationStatus(p)],
    ['submitted_date','Submitted Date',18,p=>{const a=(p.associations||[]).find(x=>x.submitted_to_client_date);return a?.submitted_to_client_date?formatDateOnly(a.submitted_to_client_date):'';}],
    ['source','Source',25,p=>p.source],
    ['association_ids','Association IDs',24,p=>(p.associations||[]).map(a=>a.id).join(', ')],
    ['requirement_ids','Associated Requirement IDs',30,p=>(p.associations||[]).map(a=>a.requirement_id).join(', ')]
  ];
  const exportLabel=k=>String(k).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const defaultExportWidth=k=>({profile_number:18,full_name:28,email:30,phone:18,current_company:26,current_job_title:28,preferred_location:24,total_experience:18,current_ctc:16,expected_ctc:16,notice_period:18,availability:18,status:24,created_at:22,updated_at:22}[k]||Math.max(14,Math.min(30,exportLabel(k).length+6)));
  async function fetchExportTemplates(action='list',name='',settings=null){
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Your session has expired. Please sign in again.');
    const response=await fetch(window.NAVODIX_SUPABASE_URL+'/functions/v1/profile-export-templates',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action,name,settings})});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||result.message||'Could not access export templates in R2.');return result;
  }
  function renderExportFieldRows(settings=null){
    const body=$('exportFieldsBody');if(!body)return;
    const savedOrder=Array.isArray(settings?.fields)?settings.fields:[];
    if(savedOrder.length){const original=new Map(profileExportFields.map((f,i)=>[f.key,i]));profileExportFields.sort((a,b)=>{const ai=savedOrder.indexOf(a.key),bi=savedOrder.indexOf(b.key);return (ai<0?999999:ai)-(bi<0?999999:bi)||original.get(a.key)-original.get(b.key);});}
    body.innerHTML=profileExportFields.map((f,i)=>`<tr data-export-row="${esc(f.key)}"><td><input type="checkbox" data-export-field="${esc(f.key)}" ${!settings||!Array.isArray(settings.fields)||settings.fields.includes(f.key)?'checked':''} aria-label="Export ${esc(f.label)}"></td><td class="export-field-name">${esc(f.label)} <small>(${esc(f.key)})</small></td><td><input type="text" class="export-header-input" data-export-header="${esc(f.key)}" value="${esc(settings?.headerNames?.[f.key]??f.label)}" aria-label="Excel column header for ${esc(f.label)}" maxlength="255"></td><td><input type="number" data-export-width="${esc(f.key)}" min="8" max="60" value="${Number(settings?.widths?.[f.key]||f.width)}" aria-label="Width for ${esc(f.label)}"></td><td><div class="export-order-buttons"><button type="button" class="export-order-btn" data-export-move="up" data-key="${esc(f.key)}" ${i===0?'disabled':''} aria-label="Move ${esc(f.label)} up">↑</button><button type="button" class="export-order-btn" data-export-move="down" data-key="${esc(f.key)}" ${i===profileExportFields.length-1?'disabled':''} aria-label="Move ${esc(f.label)} down">↓</button></div></td></tr>`).join('');
    const all=$('exportSelectAllFields');if(all){const checks=[...body.querySelectorAll('[data-export-field]')];all.checked=checks.length>0&&checks.every(x=>x.checked);all.indeterminate=checks.some(x=>x.checked)&&!checks.every(x=>x.checked);}
  }
  async function discoverExportFields(){
    const {data,error}=await supabase.from('profiles').select('*').limit(1);if(error)throw error;
    const keys=new Set(Object.keys(data?.[0]||{}));
    // Related database values and useful association fields are exposed alongside every profiles-table column.
    exportVirtualFields.forEach(([key])=>keys.add(key));
    profileExportFields=[...keys].map(key=>{const virtual=exportVirtualFields.find(x=>x[0]===key);return {key,label:virtual?virtual[1]:exportLabel(key),width:defaultExportWidth(key),getValue:virtual?virtual[3]:(p=>p[key])};});
    renderExportFieldRows();
  }
  function selectedExportFields(){return [...$('exportFieldsBody').querySelectorAll('tr')].filter(row=>row.querySelector('[data-export-field]')?.checked).map(row=>{const key=row.dataset.exportRow,f=profileExportFields.find(x=>x.key===key),customHeader=String(row.querySelector('[data-export-header]')?.value??'').trim();return {...f,label:customHeader||f.label,width:Math.max(8,Math.min(60,Number(row.querySelector('[data-export-width]')?.value)||f.width))};});}
  const exportPaletteColors=['#000000','#808080','#800000','#FF0000','#FF8000','#FFFF00','#00B050','#00B0F0','#0000FF','#7030A0','#FFFFFF','#D9D9D9','#C08060','#F4A6C1','#FFC000','#F3E5AB','#A6D91A','#8ED3E2','#7F9DB9','#B4A7D6','#FFFFFF','#F2F2F2','#D9D9D9','#BFBFBF','#A6A6A6','#8C8C8C','#737373','#595959','#404040','#262626'];
  const exportAssociationStatuses=['New','Shortlisted','Submitted','Interviewing','Selected','Offer Sent','Joined','On Hold','Future Consideration','Rejected','Withdrawn','Not Interested','Duplicate'];
  const exportStatusDefaultColors={'New':'#FFFFFF','Shortlisted':'#FFFFFF','Submitted':'#FFFFFF','Interviewing':'#FFFFFF','Selected':'#FFFFFF','Offer Sent':'#FFFFFF','Joined':'#FFFFFF','On Hold':'#FFFFFF','Future Consideration':'#FFFFFF','Rejected':'#FFFFFF','Withdrawn':'#FFFFFF','Not Interested':'#FFFFFF','Duplicate':'#FFFFFF'};
  function renderExportStatusColorPickers(settings=null){const host=$('exportAssociationStatusColors');if(!host)return;const saved=settings?.associationStatusColors||{};host.innerHTML=exportAssociationStatuses.map((status,index)=>{const color=saved[status]||'';const initial=color||exportStatusDefaultColors[status]||'#FFFFFF';return `<div class="export-status-color-item"><span title="${esc(status)}">${esc(status)}</span><div class="export-color-picker"><button type="button" class="export-color-trigger" data-color-target="exportStatusColor${index}" aria-label="Choose row highlight colour for ${esc(status)}" aria-haspopup="true"><span class="export-color-preview" style="background:${initial}"></span></button><input type="color" id="exportStatusColor${index}" data-status-color="${esc(status)}" data-configured="${color?'true':'false'}" value="${initial}"><div class="export-color-palette" role="dialog" aria-label="Select ${esc(status)} row colour"></div></div></div>`;}).join('');}

  function syncExportColorPicker(input){if(!input)return;const picker=input.closest('.export-color-picker');if(!picker)return;const preview=picker.querySelector('.export-color-preview');if(preview)preview.style.background=input.value;picker.querySelectorAll('.export-color-swatch').forEach(b=>{const selected=b.dataset.color.toLowerCase()===input.value.toLowerCase();b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
  function initExportColorPickers(){
    document.querySelectorAll('#profilesExportModal .export-color-picker').forEach(picker=>{const input=picker.querySelector('input[type="color"]'),trigger=picker.querySelector('.export-color-trigger'),panel=picker.querySelector('.export-color-palette');if(!input||!trigger||!panel||panel.dataset.ready)return;panel.dataset.ready='1';panel.innerHTML='<h4 class="export-color-palette-title">Colours</h4><div class="export-color-swatches"></div><div class="export-color-palette-hint"><button type="button" class="export-color-custom"><span class="export-color-custom-wheel" aria-hidden="true"></span>More colours…</button></div>';const grid=panel.querySelector('.export-color-swatches');exportPaletteColors.forEach((color,index)=>{const b=document.createElement('button');b.type='button';b.className='export-color-swatch';b.style.backgroundColor=color;b.dataset.color=color;b.setAttribute('aria-label',color);b.title=color;if(index===10||index>=20)b.classList.add('light-check');b.addEventListener('click',()=>{input.value=color;if(input.hasAttribute('data-status-color'))input.dataset.configured='true';syncExportColorPicker(input);panel.classList.remove('open');trigger.setAttribute('aria-expanded','false');});grid.appendChild(b);});panel.querySelector('.export-color-custom').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();panel.classList.remove('open');trigger.setAttribute('aria-expanded','false');input.click();});trigger.setAttribute('aria-expanded','false');trigger.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();document.querySelectorAll('#profilesExportModal .export-color-palette.open').forEach(other=>{if(other!==panel)other.classList.remove('open');});panel.classList.toggle('open');trigger.setAttribute('aria-expanded',String(panel.classList.contains('open')));});input.addEventListener('input',()=>{if(input.hasAttribute('data-status-color'))input.dataset.configured='true';syncExportColorPicker(input);});input.addEventListener('change',()=>{if(input.hasAttribute('data-status-color'))input.dataset.configured='true';syncExportColorPicker(input);});syncExportColorPicker(input);});
  }
  document.addEventListener('click',e=>{if(e.target.closest('#profilesExportModal .export-color-picker'))return;document.querySelectorAll('#profilesExportModal .export-color-palette.open').forEach(panel=>{panel.classList.remove('open');panel.closest('.export-color-picker')?.querySelector('.export-color-trigger')?.setAttribute('aria-expanded','false');});});
  function exportSettings(){return {fields:[...$('exportFieldsBody').querySelectorAll('tr')].filter(r=>r.querySelector('[data-export-field]')?.checked).map(r=>r.dataset.exportRow),headerNames:Object.fromEntries([...$('exportFieldsBody').querySelectorAll('[data-export-header]')].map(i=>[i.dataset.exportHeader,String(i.value||'').trim()||profileExportFields.find(f=>f.key===i.dataset.exportHeader)?.label||exportLabel(i.dataset.exportHeader)])),widths:Object.fromEntries([...$('exportFieldsBody').querySelectorAll('[data-export-width]')].map(i=>[i.dataset.exportWidth,Number(i.value)||defaultExportWidth(i.dataset.exportWidth)])),fitToColumnWidth:$('exportFitColumnWidth').checked,headerColor:$('exportHeaderColor').value,headerTextColor:$('exportHeaderTextColor').value,fontName:$('exportFontName').value,fontSize:$('exportFontSize').value,headerTextWeight:$('exportHeaderTextWeight').value,headerAlignment:$('exportHeaderAlignment').value,rowColor:$('exportRowColor').value,rowTextColor:$('exportRowTextColor').value,rowFontName:$('exportRowFontName').value,rowFontSize:$('exportRowFontSize').value,rowTextWeight:$('exportRowTextWeight').value,rowAlignment:$('exportRowAlignment').value,mainHeaderColor:$('exportMainHeaderColor').value,mainHeaderTextColor:$('exportMainHeaderTextColor').value,mainHeaderFontName:$('exportMainHeaderFontName').value,mainHeaderFontSize:$('exportMainHeaderFontSize').value,mainHeaderTextWeight:$('exportMainHeaderTextWeight').value,mainHeaderAlignment:$('exportMainHeaderAlignment').value,mainHeaderText:$('exportMainHeaderText').value,mainHeaderRowHeight:Math.max(15,Math.min(300,Number($('exportMainHeaderRowHeight').value)||30)),sheetName:$('exportSheetName').value,fileName:$('exportFileName').value,scope:$('exportScope').value,wrapText:$('exportWrapText').checked,autoFilter:$('exportAutoFilter').checked,freezeHeader:$('exportFreezeHeader').checked,cellBorders:$('exportCellBorders').checked,includeLogo:$('exportIncludeLogo').checked,logoSizePercent:Math.max(1,Math.min(500,Number($('exportLogoSizePercent').value)||50)),sortByRequirement:$('exportSortByRequirement').checked,requirementSortOrder:$('exportRequirementSortOrder').value,sortBySubmittedDate:$('exportSortBySubmittedDate').checked,submittedDateSortOrder:$('exportSubmittedDateSortOrder').value,sortPriority:$('exportSortPriority').value,associationStatusColors:Object.fromEntries([...document.querySelectorAll('#exportAssociationStatusColors [data-status-color]')].filter(i=>i.dataset.configured==='true').map(i=>[i.dataset.statusColor,i.value]))};}
  function applyExportSettings(settings){if(!settings)return;renderExportFieldRows(settings);if(settings.fitToColumnWidth!=null)$('exportFitColumnWidth').checked=!!settings.fitToColumnWidth;[['headerColor','exportHeaderColor'],['headerTextColor','exportHeaderTextColor'],['fontName','exportFontName'],['fontSize','exportFontSize'],['headerTextWeight','exportHeaderTextWeight'],['headerAlignment','exportHeaderAlignment'],['rowColor','exportRowColor'],['rowTextColor','exportRowTextColor'],['rowFontName','exportRowFontName'],['rowFontSize','exportRowFontSize'],['rowTextWeight','exportRowTextWeight'],['rowAlignment','exportRowAlignment'],['mainHeaderColor','exportMainHeaderColor'],['mainHeaderTextColor','exportMainHeaderTextColor'],['mainHeaderFontName','exportMainHeaderFontName'],['mainHeaderFontSize','exportMainHeaderFontSize'],['mainHeaderTextWeight','exportMainHeaderTextWeight'],['mainHeaderAlignment','exportMainHeaderAlignment'],['mainHeaderText','exportMainHeaderText'],['mainHeaderRowHeight','exportMainHeaderRowHeight'],['sheetName','exportSheetName'],['fileName','exportFileName'],['scope','exportScope']].forEach(([key,id])=>{if(settings[key]!=null&&$(id)){$(id).value=settings[key];if(id==='exportHeaderColor'||id==='exportHeaderTextColor'||id==='exportRowColor'||id==='exportRowTextColor'||id==='exportMainHeaderColor'||id==='exportMainHeaderTextColor')syncExportColorPicker($(id));}});[['wrapText','exportWrapText'],['autoFilter','exportAutoFilter'],['freezeHeader','exportFreezeHeader'],['cellBorders','exportCellBorders'],['includeLogo','exportIncludeLogo']].forEach(([key,id])=>{if(settings[key]!=null&&$(id))$(id).checked=!!settings[key];});if(settings.logoSizePercent!=null&&$('exportLogoSizePercent'))$('exportLogoSizePercent').value=Math.max(1,Math.min(500,Number(settings.logoSizePercent)||10));[['sortByRequirement','exportSortByRequirement'],['sortBySubmittedDate','exportSortBySubmittedDate']].forEach(([key,id])=>{if(settings[key]!=null&&$(id))$(id).checked=!!settings[key];});[['requirementSortOrder','exportRequirementSortOrder'],['submittedDateSortOrder','exportSubmittedDateSortOrder']].forEach(([key,id])=>{if(settings[key]&&$(id))$(id).value=settings[key]==='desc'?'desc':'asc';});if(settings.sortPriority&&$('exportSortPriority'))$('exportSortPriority').value=settings.sortPriority==='submitted_date_first'?'submitted_date_first':'requirement_first';renderExportStatusColorPickers(settings);initExportColorPickers();}
  async function refreshExportTemplateSelect(selected=''){const select=$('exportTemplateSelect');if(!select)return;select.disabled=true;try{const result=await fetchExportTemplates('list');const templates=result.templates||[];select.innerHTML='<option value="">Choose saved template</option>'+templates.map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');select.value=selected;$('deleteExportTemplateButton').disabled=!selected;}finally{select.disabled=false;}}
  async function openProfilesExport(){if(!exportModal)return;exportMessage('Loading database fields and shared templates…');exportModal.classList.remove('hidden');exportModal.setAttribute('aria-hidden','false');try{await discoverExportFields();await refreshExportTemplateSelect();exportMessage('');}catch(err){console.error(err);exportMessage(err.message||String(err),'error');}}
  function closeProfilesExport(){if(!exportModal)return;exportModal.classList.add('hidden');exportModal.setAttribute('aria-hidden','true');}
  const xmlEsc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const excelCol=n=>{let s='';while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;};
  function rgbExcel(hex){return 'FF'+String(hex||'#2878E8').replace('#','').padEnd(6,'0').slice(0,6).toUpperCase();}
  async function createProfilesWorkbook(rows,fields,settings){
    if(!window.JSZip)throw new Error('The Excel export library did not load. Refresh the page and try again.');
    const zip=new JSZip(),sheetName=String(settings.sheetName||'Profiles').replace(/[\\/*?:\[\]]/g,' ').trim().slice(0,31)||'Profiles';
    const includeLogo=!!settings.includeLogo;
    const logoPercent=Math.max(1,Math.min(500,Number(settings.logoSizePercent)||10));
    let logoBytes=null,logoWidth=0,logoHeight=0,logoExt='png';
    if(includeLogo){
      const response=await fetch('../assets/images/logo.png?v=19',{cache:'no-cache'});
      if(!response.ok)throw new Error('Could not load /assets/images/logo.png. Verify the logo file is available at that path.');
      logoBytes=await response.arrayBuffer();
      const bytes=new Uint8Array(logoBytes);
      if(bytes.length<24||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw new Error('The Navodix logo is not a valid PNG image.');
      logoWidth=((bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19])>>>0;
      logoHeight=((bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23])>>>0;
      if(!logoWidth||!logoHeight)throw new Error('Could not determine the original Navodix logo dimensions.');
    }
    const logoScale=includeLogo?logoPercent/100:0;
    const logoCx=Math.round(logoWidth*logoScale*9525),logoCy=Math.round(logoHeight*logoScale*9525);
    const logoRowHeight=includeLogo?Math.max(15,logoHeight*logoScale*0.75+4):0;
    const mainHeaderRowNumber=includeLogo?2:1,columnHeaderRowNumber=mainHeaderRowNumber+1,dataStartRow=columnHeaderRowNumber+1;
    // Sorting is applied only to the exported copy, never to the on-screen Profiles list.
    // The saved priority determines the primary and secondary keys when both are enabled.
    const exportRows=rows.slice();
    const sortCriteria=[];
    const sortDefinitions={requirement:{key:'requirement',direction:settings.requirementSortOrder==='desc'?-1:1},submittedDate:{key:'submittedDate',direction:settings.submittedDateSortOrder==='desc'?-1:1}};
    const priorityKeys=settings.sortPriority==='submitted_date_first'?['submittedDate','requirement']:['requirement','submittedDate'];
    priorityKeys.forEach(key=>{if(key==='requirement'&&settings.sortByRequirement)sortCriteria.push(sortDefinitions.requirement);if(key==='submittedDate'&&settings.sortBySubmittedDate)sortCriteria.push(sortDefinitions.submittedDate);});
    const sortValue=(profile,key)=>{
      if(key==='requirement')return String(profile.latestRequirementName||'').replace(/^—$/,'').trim();
      const association=(profile.associations||[]).find(a=>a.submitted_to_client_date);
      return String(association?.submitted_to_client_date||'').slice(0,10);
    };
    if(sortCriteria.length)exportRows.sort((a,b)=>{
      for(const criterion of sortCriteria){
        const av=sortValue(a,criterion.key),bv=sortValue(b,criterion.key);
        // Empty values remain at the end in either direction.
        if(!av&&!bv)continue;
        if(!av)return 1;
        if(!bv)return -1;
        const comparison=criterion.key==='submittedDate'?av.localeCompare(bv):av.localeCompare(bv,undefined,{sensitivity:'base',numeric:true});
        if(comparison)return comparison*criterion.direction;
      }
      return 0;
    });
    const columnHeaderRow=fields.map(f=>f.label);
    const dataRows=exportRows.map((p,rowIndex)=>fields.map(f=>f.key==='serial_number'?rowIndex+1:(f.getValue(p)??'')));
    const cellRows=[columnHeaderRow,...dataRows];
    const widths=fields.map((f,idx)=>{let width=Number(settings.widths?.[f.key]||f.width)||f.width;if(settings.fitToColumnWidth){const max=cellRows.reduce((m,row)=>Math.max(m,String(row[idx]??'').length),0);width=Math.max(8,Math.min(60,max+2));}return `<col min="${idx+1}" max="${idx+1}" width="${width}" customWidth="1"/>`;}).join('');
    const borders=settings.cellBorders
      ? '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>'
      : '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>';
    const wrapAlignment=settings.wrapText?' wrapText="1"':'';
    const statusColorEntries=exportAssociationStatuses.filter(status=>/^#[0-9A-F]{6}$/i.test(String(settings.associationStatusColors?.[status]||''))).map(status=>({status,color:settings.associationStatusColors[status]}));
    const statusFills=statusColorEntries.map(entry=>`<fill><patternFill patternType="solid"><fgColor rgb="${rgbExcel(entry.color)}"/><bgColor indexed="64"/></patternFill></fill>`).join('');
    const statusCellStyles=statusColorEntries.map((entry,index)=>`<xf numFmtId="0" fontId="0" fillId="${5+index}" borderId="${settings.cellBorders?1:0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${settings.rowAlignment||'left'}" vertical="top"${wrapAlignment}/></xf>`).join('');
    const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font>${settings.rowTextWeight==='bold'?'<b/>':''}<sz val="${Number(settings.rowFontSize||settings.fontSize)||11}"/><color rgb="${rgbExcel(settings.rowTextColor||'#000000')}"/><name val="${xmlEsc(settings.rowFontName||settings.fontName||'Aptos')}"/><family val="2"/></font><font>${settings.headerTextWeight==='normal'?'':'<b/>'}<color rgb="${rgbExcel(settings.headerTextColor||'#FFFFFF')}"/><sz val="${Number(settings.fontSize)||11}"/><name val="${xmlEsc(settings.fontName||'Aptos')}"/><family val="2"/></font><font>${settings.mainHeaderTextWeight==='normal'?'':'<b/>'}<sz val="${Number(settings.mainHeaderFontSize)||11}"/><color rgb="${rgbExcel(settings.mainHeaderTextColor||'#FFFFFF')}"/><name val="${xmlEsc(settings.mainHeaderFontName||'Aptos')}"/><family val="2"/></font></fonts><fills count="${5+statusColorEntries.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${rgbExcel(settings.headerColor)}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="${rgbExcel(settings.rowColor||'#FFFFFF')}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="${rgbExcel(settings.mainHeaderColor||'#2878E8')}"/><bgColor indexed="64"/></patternFill></fill>${statusFills}</fills>${borders}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${4+statusColorEntries.length}"><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${settings.rowAlignment||'left'}" vertical="top"${wrapAlignment}/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="${settings.cellBorders?1:0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${settings.headerAlignment||'left'}" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="${settings.cellBorders?1:0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${settings.rowAlignment||'left'}" vertical="top"${wrapAlignment}/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="${settings.cellBorders?1:0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${settings.mainHeaderAlignment||'center'}" vertical="center" wrapText="1"/></xf>${statusCellStyles}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const mainHeaderText=String(settings.mainHeaderText??'Main Header');
    const mainHeaderRowHeight=Math.max(15,Math.min(300,Number(settings.mainHeaderRowHeight)||30));
    const mainHeaderRow=`<row r="${mainHeaderRowNumber}" ht="${mainHeaderRowHeight}" customHeight="1">${fields.map((f,ci)=>`<c r="${excelCol(ci+1)}${mainHeaderRowNumber}" t="inlineStr" s="3"><is><t xml:space="preserve">${ci===0?xmlEsc(mainHeaderText):''}</t></is></c>`).join('')}</row>`;
    const sheetRows=cellRows.map((row,ri)=>{const rowNum=columnHeaderRowNumber+ri;let style=ri===0?1:(settings.cellBorders?2:0);if(ri>0){const status=String(displayedAssociationStatus(exportRows[ri-1])||'').trim();const statusIndex=statusColorEntries.findIndex(entry=>entry.status===status);if(statusIndex>=0)style=4+statusIndex;}return `<row r="${rowNum}">${row.map((value,ci)=>{const ref=excelCol(ci+1)+rowNum;return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;}).join('')}</row>`;}).join('');
    const logoWorksheetRow=includeLogo?`<row r="1" ht="${logoRowHeight.toFixed(2)}" customHeight="1"></row>`:'';
    const lastCol=excelCol(fields.length),lastRow=Math.max(columnHeaderRowNumber,cellRows.length+columnHeaderRowNumber-1),pane=settings.freezeHeader?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${columnHeaderRowNumber}" topLeftCell="A${dataStartRow}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`:'<sheetViews><sheetView workbookViewId="0"/></sheetViews>',filter=settings.autoFilter&&fields.length?`<autoFilter ref="A${columnHeaderRowNumber}:${lastCol}${lastRow}"/>`:'';
    const mergeCells=fields.length?`<mergeCells count="1"><mergeCell ref="A${mainHeaderRowNumber}:${lastCol}${mainHeaderRowNumber}"/></mergeCells>`:'';
    const ignoredErrors=fields.length?`<ignoredErrors><ignoredError numberStoredAsText="1" sqref="A1:${lastCol}${lastRow}"/></ignoredErrors>`:"";
    const drawingTag=includeLogo?'<drawing r:id="rId1"/>':'';
    const worksheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<cols>${widths}</cols><sheetData>${logoWorksheetRow}${mainHeaderRow}${sheetRows}</sheetData>${filter}${mergeCells}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>${ignoredErrors}${drawingTag}</worksheet>`;
    zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${includeLogo?'<Default Extension="png" ContentType="image/png"/> <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
    zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.folder('xl').file('workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.folder('xl').folder('_rels').file('workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.folder('xl').file('styles.xml',styles);zip.folder('xl').folder('worksheets').file('sheet1.xml',worksheet);
    if(includeLogo){
      zip.folder('xl').folder('media').file('logo.png',logoBytes);
      zip.folder('xl').folder('drawings').file('drawing1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${logoCx}" cy="${logoCy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Navodix Logo" descr="Navodix IT Solutions logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${logoCx}" cy="${logoCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      zip.folder('xl').folder('drawings').folder('_rels').file('drawing1.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>');
      zip.folder('xl').folder('worksheets').folder('_rels').file('sheet1.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    }
    return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
  }
  renderExportStatusColorPickers();
  initExportColorPickers();
  if($('exportProfilesButton'))$('exportProfilesButton').addEventListener('click',openProfilesExport);
  ['closeProfilesExportModal','cancelProfilesExportButton'].forEach(id=>$(id)?.addEventListener('click',closeProfilesExport));// Keep the export modal open when the user clicks outside its panel.
  $('exportSelectAllFields')?.addEventListener('change',e=>document.querySelectorAll('#exportFieldsBody [data-export-field]').forEach(cb=>cb.checked=e.target.checked));
  $('exportFieldsBody')?.addEventListener('click',e=>{const b=e.target.closest('[data-export-move]');if(!b)return;const rows=[...$('exportFieldsBody').querySelectorAll('tr')],i=rows.findIndex(r=>r.dataset.exportRow===b.dataset.key),j=b.dataset.exportMove==='up'?i-1:i+1;if(j<0||j>=rows.length)return;if(j<i)$('exportFieldsBody').insertBefore(rows[i],rows[j]);else $('exportFieldsBody').insertBefore(rows[j],rows[i]);[...$('exportFieldsBody').querySelectorAll('tr')].forEach((r,n)=>r.querySelectorAll('[data-export-move]').forEach(x=>x.disabled=(x.dataset.exportMove==='up'?n===0:n===rows.length-1)));});
  $('exportTemplateSelect')?.addEventListener('change',async e=>{const name=e.target.value;if(!name){$('deleteExportTemplateButton').disabled=true;return;}try{const result=await fetchExportTemplates('get',name);applyExportSettings(result.settings?.settings||result.settings);$('exportTemplateName').value=name;$('deleteExportTemplateButton').disabled=false;exportMessage(`Loaded shared template “${name}”.`,'success');}catch(err){exportMessage(err.message||String(err),'error');}});
  $('saveExportTemplateButton')?.addEventListener('click',async()=>{const name=$('exportTemplateName').value.trim();if(!name){exportMessage('Enter a template name first.','error');$('exportTemplateName').focus();return;}const button=$('saveExportTemplateButton');button.disabled=true;try{await fetchExportTemplates('save',name,exportSettings());await refreshExportTemplateSelect(name);exportMessage(`Template “${name}” saved to database.`,'success');}catch(err){console.error(err);exportMessage(err.message||String(err),'error');}finally{button.disabled=false;}});
  $('deleteExportTemplateButton')?.addEventListener('click',()=>{const name=$('exportTemplateSelect').value;if(!name)return;openExportTemplateDeleteConfirm(name);});
  $('cancelDeleteExportTemplateButton')?.addEventListener('click',closeExportTemplateDeleteConfirm);
  exportTemplateDeleteModal?.addEventListener('click',e=>{if(e.target===exportTemplateDeleteModal)closeExportTemplateDeleteConfirm();});
  $('confirmDeleteExportTemplateButton')?.addEventListener('click',async()=>{const name=pendingExportTemplateDeleteName;if(!name)return;const button=$('confirmDeleteExportTemplateButton');button.disabled=true;try{await fetchExportTemplates('delete',name);closeExportTemplateDeleteConfirm();$('exportTemplateName').value='';await refreshExportTemplateSelect();exportMessage(`Template “${name}” deleted from database.`,'success');}catch(err){closeExportTemplateDeleteConfirm();exportMessage(err.message||String(err),'error');}finally{button.disabled=false;}});
  $('exportProfilesNowButton')?.addEventListener('click',async()=>{const button=$('exportProfilesNowButton');button.disabled=true;exportMessage('Preparing Excel workbook…');try{const settings=exportSettings(),fields=selectedExportFields();if(!fields.length)throw new Error('Select at least one field to export.');const selected=settings.scope==='all'?profiles.slice():filtered().slice();if(!selected.length)throw new Error('There are no profiles to export for the selected scope.');const {data:dbRows,error}=await supabase.from('profiles').select('*').in('id',selected.map(p=>p.id));if(error)throw error;const byId=new Map((dbRows||[]).map(p=>[String(p.id),p]));const rows=selected.map(p=>({...p,...(byId.get(String(p.id))||{})}));const blob=await createProfilesWorkbook(rows,fields,settings);const url=URL.createObjectURL(blob),link=document.createElement('a'),filename=(settings.fileName||'Navodix_Profiles').trim().replace(/[\\/:*?"<>|]/g,'_').replace(/\.xlsx$/i,'')||'Navodix_Profiles';link.href=url;link.download=filename+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);exportMessage(`Exported ${rows.length} profile(s) to ${filename}.xlsx.`,'success');}catch(err){console.error('Profiles Excel export failed:',err);exportMessage(err.message||String(err),'error');}finally{button.disabled=false;}});

  $('refreshProfilesButton').addEventListener('click',()=>{currentPage=1;loadProfiles();}); $('associateExistingButton').addEventListener('click',openExistingProfileModal); $('closeExistingProfileModal').addEventListener('click',closeExistingProfileModal); $('closeAssociateRequirementModal').addEventListener('click',closeAssociateRequirementModal); $('cancelAssociateRequirementButton').addEventListener('click',closeAssociateRequirementModal); $('saveAssociateRequirementButton').addEventListener('click',saveAssociateRequirement); $('existingProfileSearch').addEventListener('input',renderExistingProfiles); ['existingProfileCurrentLocationFilter','existingProfilePreferredLocationFilter','existingProfileStatusFilter'].forEach(id=>$(id)?.addEventListener('change',renderExistingProfiles)); $('clearExistingProfileFiltersButton')?.addEventListener('click',()=>{ $('existingProfileSearch').value=''; ['existingProfileCurrentLocationFilter','existingProfilePreferredLocationFilter','existingProfileStatusFilter'].forEach(id=>{const el=$(id);if(el){el.value='';el.classList.remove('profile-filter-active');}}); renderExistingProfiles(); }); ['existingProfileCurrentLocationFilter','existingProfilePreferredLocationFilter','existingProfileStatusFilter'].forEach(id=>$(id)?.addEventListener('change',()=>$(id)?.classList.toggle('profile-filter-active',!!$(id)?.value))); $('existingProfileTableBody').addEventListener('click',async e=>{const b=e.target.closest('[data-existing-associate]');if(!b)return; b.disabled=true; try{await associateProfile(b.dataset.existingAssociate);}catch(err){$('existingProfileMessage').textContent=err.message||String(err);}finally{b.disabled=false;}}); $('profilesTableBody').addEventListener('click',e=>{ const row=e.target.closest('tr.profile-row'); if(!row)return; selectProfileRow(row.dataset.profileRowId); hideProfileRowContextMenu(); }); $('profilesTableBody').addEventListener('dblclick',async e=>{ const row=e.target.closest('tr.profile-row'); if(!row)return; selectProfileRow(row.dataset.profileRowId); hideProfileRowContextMenu(); try{ await openProfileDetails(row.dataset.profileRowId); }catch(err){ message(err.message||String(err),'error'); } });
  $('profilesTableBody').addEventListener('contextmenu',e=>{ const row=e.target.closest('tr.profile-row'); if(!row)return; e.preventDefault(); openProfileRowContextMenu(row.dataset.profileRowId,e.clientX,e.clientY); });
  $('profileRowContextMenu').addEventListener('click',async e=>{ const button=e.target.closest('[data-context-action]'); if(!button)return; await handleProfileContextAction(button.dataset.contextAction); });
  $('closeUpdateProfileStatusModal').addEventListener('click',closeUpdateProfileStatusModal); $('cancelUpdateProfileStatusButton').addEventListener('click',closeUpdateProfileStatusModal); $('saveUpdateProfileStatusButton').addEventListener('click',saveUpdatedProfileStatus); $('updateProfileStatusModal').addEventListener('click',e=>{if(e.target===$('updateProfileStatusModal'))closeUpdateProfileStatusModal();});
  document.addEventListener('click',e=>{ const menu=$('profileRowContextMenu'); if(menu&&!menu.contains(e.target))hideProfileRowContextMenu(); });
  window.addEventListener('resize',hideProfileRowContextMenu);
  window.addEventListener('scroll',hideProfileRowContextMenu,true); $('cancelRemoveProfileAssociationButton').addEventListener('click',closeRemoveProfileAssociationModal); $('confirmRemoveProfileAssociationButton').addEventListener('click',confirmRemoveProfileAssociation); $('closeProfileDetailsModal').addEventListener('click',closeProfileDetails); $('closeProfileDetailsButton').addEventListener('click',closeProfileDetails); $('editProfileFromDetailsButton')?.addEventListener('click',async()=>{const id=profileAssociationCurrentProfileId;if(!id)return;closeProfileDetails();try{await editProfile(id);}catch(err){message(err.message||String(err),'error');}}); $('cancelDeleteProfileButton').addEventListener('click',closeDeleteProfileModal); $('confirmDeleteProfileButton').addEventListener('click',confirmDeleteProfile); $('closeAssociationHistoryModal').addEventListener('click',closeAssociationStatusHistory); $('closeAssociationHistoryButton').addEventListener('click',closeAssociationStatusHistory); $('profileDetailsBody').addEventListener('click',async e=>{
    if(e.target.closest('#closeProfileResumeButton') || e.target.closest('#closeProfileResumeBottomButton')){
      const viewer=$('profileResumeViewer'); const frame=$('profileResumeFrame'); const docxViewer=$('profileResumeDocxViewer'); const loading=$('profileResumeLoading');
      if(frame)frame.src=''; if(activeProfileResumeObjectUrl){URL.revokeObjectURL(activeProfileResumeObjectUrl);activeProfileResumeObjectUrl='';} if(docxViewer)docxViewer.innerHTML=''; if(loading){loading.classList.remove('hidden'); loading.textContent='Loading resume…';}
      if(viewer)viewer.classList.add('hidden');
      const openBtn=$('openProfileResumeNewTabButton'); if(openBtn)openBtn.classList.add('hidden');
      const closeBtn=$('closeProfileResumeButton'); if(closeBtn)closeBtn.classList.add('hidden');
      const closeBottomBtn=$('closeProfileResumeBottomButton'); if(closeBottomBtn)closeBottomBtn.classList.add('hidden');
      return;
    }
  }); $('closeProfileAssociationModal').addEventListener('click',closeProfileAssociationModal);
  $('cancelProfileAssociationButton').addEventListener('click',closeProfileAssociationModal);
  $('saveProfileAssociationButton').addEventListener('click',saveProfileAssociation);
  $('profileAssociationStatus').addEventListener('change',()=>{
    const status=$('profileAssociationStatus').value;
    const group=$('profileAssociationSubmissionDateGroup');
    const input=$('profileAssociationSubmissionDate');
    if(!group||!input)return;
    const isSubmitted=status==='Submitted';
    group.classList.toggle('hidden',!isSubmitted);
    if(isSubmitted && !input.value){
      const now=new Date();
      const localDate=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
      input.value=localDate;
    }
  });
  $('closeProfileNotesModal').addEventListener('click',closeProfileNotesModal);
  $('cancelProfileNoteButton').addEventListener('click',closeProfileNotesModal);
  $('profileNoteForm').addEventListener('submit',saveProfileRequirementNote);
  let selectedProfileNoteId='';
  function hideProfileNotesRowContextMenu(){ $('profileNotesRowContextMenu')?.classList.add('hidden'); }
  function selectProfileNoteRow(id){ selectedProfileNoteId=String(id||''); $('profileNotesTableBody')?.querySelectorAll('tr[data-profile-note-row-id]').forEach(row=>row.classList.toggle('profile-note-row-selected',row.dataset.profileNoteRowId===selectedProfileNoteId)); }
  function openProfileNotesRowContextMenu(id,x,y){ const row=$('profileNotesTableBody')?.querySelector(`tr[data-profile-note-row-id="${CSS.escape(String(id))}"]`); if(!row)return; selectProfileNoteRow(id); const menu=$('profileNotesRowContextMenu'); if(!menu)return; menu.classList.remove('hidden'); const width=menu.offsetWidth||210,height=menu.offsetHeight||90; menu.style.left=Math.max(8,Math.min(x,window.innerWidth-width-8))+'px'; menu.style.top=Math.max(8,Math.min(y,window.innerHeight-height-8))+'px'; }
  async function editProfileNote(id){
    try{let q=supabase.from('profile_notes').select('id,note_type,note').eq('id',id).eq('profile_id',profileNotesProfileId);q=profileNotesRequirementId?q.eq('requirement_id',profileNotesRequirementId):q.is('requirement_id',null);const {data,error}=await q.single();if(error)throw error;profileNotesEditingId=data.id;$('profileNoteId').value=data.id;setProfileNoteTypeOptions(!profileNotesRequirementId);$('profileNoteType').value=data.note_type||(!profileNotesRequirementId?'General':'Update');$('profileNoteText').value=data.note||'';$('saveProfileNoteButton').innerHTML='<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save Changes';profileNoteFormMessage('Editing note…');$('profileNoteText').focus();}
    catch(err){$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}
  }
  let pendingDeleteProfileNoteId='';
  function openDeleteProfileNoteConfirm(id){
    if(!id)return; pendingDeleteProfileNoteId=String(id);
    const modal=$('profileNoteDeleteConfirmModal');
    $('profileNoteDeleteConfirmText').textContent=profileNotesRequirementId?'Are you sure you want to delete this requirement-specific note? This action cannot be undone.':'Are you sure you want to delete this profile note? This action cannot be undone.';
    modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  }
  function closeDeleteProfileNoteConfirm(){
    const modal=$('profileNoteDeleteConfirmModal'); modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); pendingDeleteProfileNoteId='';
    if($('profileNotesModal')?.classList.contains('hidden')&&$('interviewModal')?.classList.contains('hidden')&&$('interviewFormModal')?.classList.contains('hidden'))document.body.classList.remove('modal-open');
  }
  async function deleteProfileNote(){
    if(!pendingDeleteProfileNoteId)return; const id=pendingDeleteProfileNoteId; const btn=$('confirmDeleteProfileNoteButton'); if(btn)btn.disabled=true;
    try{let q=supabase.from('profile_notes').delete().eq('id',id).eq('profile_id',profileNotesProfileId);q=profileNotesRequirementId?q.eq('requirement_id',profileNotesRequirementId):q.is('requirement_id',null);const {error}=await q;if(error)throw error;closeDeleteProfileNoteConfirm();message(profileNotesRequirementId?'Requirement-specific note deleted successfully.':'Profile-level note deleted successfully.','success');resetProfileNoteForm();if(profileNotesRequirementId)await loadRequirementNotes();else await loadProfileLevelNotes();}
    catch(err){closeDeleteProfileNoteConfirm();$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}
    finally{if(btn)btn.disabled=false;}
  }
  $('profileNotesTableBody').addEventListener('click',e=>{const row=e.target.closest('tr[data-profile-note-row-id]');if(!row)return;selectProfileNoteRow(row.dataset.profileNoteRowId);hideProfileNotesRowContextMenu();});
  $('profileNotesTableBody').addEventListener('contextmenu',e=>{const row=e.target.closest('tr[data-profile-note-row-id]');if(!row)return;e.preventDefault();openProfileNotesRowContextMenu(row.dataset.profileNoteRowId,e.clientX,e.clientY);});
  $('profileNotesTableBody').addEventListener('keydown',e=>{const row=e.target.closest('tr[data-profile-note-row-id]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectProfileNoteRow(row.dataset.profileNoteRowId);}});
  $('profileNotesRowContextMenu').addEventListener('click',async e=>{const button=e.target.closest('[data-profile-note-context-action]');if(!button||!selectedProfileNoteId)return;const id=selectedProfileNoteId;const action=button.dataset.profileNoteContextAction;hideProfileNotesRowContextMenu();if(action==='edit')await editProfileNote(id);else if(action==='delete')openDeleteProfileNoteConfirm(id);});
  $('cancelDeleteProfileNoteButton').addEventListener('click',closeDeleteProfileNoteConfirm); $('confirmDeleteProfileNoteButton').addEventListener('click',deleteProfileNote); $('profileNoteDeleteConfirmModal').addEventListener('click',e=>{if(e.target===$('profileNoteDeleteConfirmModal'))closeDeleteProfileNoteConfirm();});
  $('profileNotesModal').addEventListener('click',e=>{if(e.target===$('profileNotesModal')){hideProfileNotesRowContextMenu();selectProfileNoteRow('');return;}if(!e.target.closest('#profileNotesTableWrap')){hideProfileNotesRowContextMenu();selectProfileNoteRow('');}});
  document.addEventListener('click',e=>{const menu=$('profileNotesRowContextMenu');if(menu&&!menu.contains(e.target)&&!e.target.closest('#profileNotesTableBody tr'))hideProfileNotesRowContextMenu();});
  window.addEventListener('resize',hideProfileNotesRowContextMenu);window.addEventListener('scroll',hideProfileNotesRowContextMenu,true);
  $('interviewRoundsInfoOk')?.addEventListener('click',closeInterviewRoundsInfo); $('closeInterviewRoundsInfo')?.addEventListener('click',closeInterviewRoundsInfo); $('interviewRoundsInfoModal')?.addEventListener('click',e=>{if(e.target===$('interviewRoundsInfoModal'))closeInterviewRoundsInfo();}); $('closeInterviewRequirementPicker')?.addEventListener('click',closeInterviewRequirementPicker); $('cancelInterviewRequirementPicker')?.addEventListener('click',closeInterviewRequirementPicker); $('closeInterviewModal').addEventListener('click',closeInterviewModal); $('cancelInterviewModalButton').addEventListener('click',closeInterviewModal); $('cancelDeleteInterviewButton')?.addEventListener('click',closeDeleteInterviewConfirm); $('confirmDeleteInterviewButton')?.addEventListener('click',deleteInterviewRound); $('interviewDeleteConfirmModal')?.addEventListener('click',e=>{if(e.target===$('interviewDeleteConfirmModal'))closeDeleteInterviewConfirm();}); $('addInterviewButton').addEventListener('click',()=>openInterviewForm()); $('closeInterviewFormModal').addEventListener('click',closeInterviewFormModal); $('cancelInterviewButton').addEventListener('click',closeInterviewFormModal); $('interviewForm').addEventListener('submit',saveInterview); $('interviewTableBody').addEventListener('click',e=>{const row=e.target.closest('tr[data-interview-row-id]');if(!row)return;selectInterviewRow(row.dataset.interviewRowId);hideInterviewRowContextMenu();}); $('interviewTableBody').addEventListener('dblclick',async e=>{const row=e.target.closest('tr[data-interview-row-id]');if(!row)return;selectInterviewRow(row.dataset.interviewRowId);hideInterviewRowContextMenu();const {data,error}=await supabase.from('profile_requirement_interviews').select('*').eq('id',row.dataset.interviewRowId).single();if(error){interviewMessage(error.message,'error');return;}openInterviewForm(data);}); $('interviewTableBody').addEventListener('contextmenu',e=>{const row=e.target.closest('tr[data-interview-row-id]');if(!row)return;e.preventDefault();openInterviewRowContextMenu(row.dataset.interviewRowId,e.clientX,e.clientY);}); $('interviewRowContextMenu').addEventListener('click',async e=>{const button=e.target.closest('[data-interview-context-action]');if(!button||!selectedInterviewId)return;const id=selectedInterviewId;const action=button.dataset.interviewContextAction;hideInterviewRowContextMenu();if(action==='delete'){openDeleteInterviewConfirm(id);return;}if(action==='edit'){const {data,error}=await supabase.from('profile_requirement_interviews').select('*').eq('id',id).single();if(error){interviewMessage(error.message,'error');return;}openInterviewForm(data);}}); $('interviewModal').addEventListener('click',e=>{if(e.target===$('interviewModal')){hideInterviewRowContextMenu();selectInterviewRow('');return;}if(!e.target.closest('#interviewTableWrap')){hideInterviewRowContextMenu();selectInterviewRow('');}}); document.addEventListener('click',e=>{const menu=$('interviewRowContextMenu');if(menu&&!menu.contains(e.target)&&!e.target.closest('#interviewTableBody tr'))hideInterviewRowContextMenu();}); window.addEventListener('resize',hideInterviewRowContextMenu); window.addEventListener('scroll',hideInterviewRowContextMenu,true); $('profileModal').addEventListener('click',e=>{if(e.target===$('profileModal'))return;});
  function updateProfilesListHeight(){
    const card=document.querySelector('.profiles-list-card');
    const wrap=card?.querySelector('.table-wrap');
    const table=card?.querySelector('.profiles-table');
    if(!card||!wrap||!table)return;
    wrap.style.height='auto';
    wrap.style.maxHeight='500px';
    wrap.style.overflowY='hidden';
    const naturalHeight=table.scrollHeight;
    const maxHeight=500;
    wrap.style.height=Math.min(naturalHeight,maxHeight)+'px';
    wrap.style.overflowY=naturalHeight>maxHeight?'auto':'hidden';
  }

  function applyProfilesListScrollLayout(){
    const card=document.querySelector('.profiles-list-card');
    const wrap=card?.querySelector('.table-wrap');
    const table=card?.querySelector('.profiles-table');
    const pagination=$('profilesPagination');
    if(!card||!wrap||!table)return;
    wrap.style.width='100%';
    wrap.style.maxWidth='100%';
    wrap.style.height='auto';
    wrap.style.maxHeight='500px';
    wrap.style.overflowY='auto';
    wrap.style.overflowX='hidden';
    wrap.style.boxSizing='border-box';
    wrap.style.scrollbarGutter='stable';
    table.style.width='100%';
    table.style.maxWidth='100%';
    table.style.minWidth='0';
    table.style.tableLayout='fixed';
    table.style.borderRight='1px solid #D7E0EA';
    table.style.boxSizing='border-box';
    table.querySelectorAll('thead th').forEach(th=>{
      th.style.position='sticky';
      th.style.top='0';
      th.style.zIndex='3';
    });
    table.querySelectorAll('th:last-child, td:last-child').forEach(cell=>{
      cell.style.borderRight='1px solid #D7E0EA';
      cell.style.boxSizing='border-box';
    });
    if(!document.getElementById('profiles-list-scrollbar-v33-style')){
      const style=document.createElement('style');
      style.id='profiles-list-scrollbar-v33-style';
      style.textContent=`
        .profiles-list-card .table-wrap{scrollbar-width:thin;scrollbar-color:#8FA4BA #EEF3F8;position:relative;}
        .profiles-list-card .table-wrap::after{content:'';position:absolute;top:0;bottom:0;right:4px;width:1px;background:#D7E0EA;pointer-events:none;z-index:4;}
        .profiles-list-card .table-wrap::-webkit-scrollbar{width:4px;height:4px;}
        .profiles-list-card .table-wrap::-webkit-scrollbar-track{background:#EEF3F8;}
        .profiles-list-card .table-wrap::-webkit-scrollbar-thumb{background:#8FA4BA;border-radius:4px;border:0;}
        .profiles-list-card .table-wrap::-webkit-scrollbar-thumb:hover{background:#91A8BE;}
      `;
      document.head.appendChild(style);
    }
    updateProfilesListHeight();
    if(pagination)pagination.remove();
}

function applyManageCandidatesFilterLock(){
  // Lock these filters only when Profiles Management is opened from Manage Candidates.
  // The existing URL context uses ?requirement=<id> or ?requirements=<id,id,...>.
  const fromManageCandidates=Boolean(requirementId || requirementIds.length);
  if(!fromManageCandidates)return;
  ['profileRequirementFilter','profileClientFilter','profileLocationFilter'].forEach(id=>{
    const select=$(id);
    if(!select)return;
    select.disabled=true;
    select.setAttribute('aria-disabled','true');
    select.title='This filter is unavailable when opened from Manage Candidates.';
    refreshMultiFilter(id);
  });
  if(!document.getElementById('manage-candidates-disabled-filters-style')){
    const style=document.createElement('style');
    style.id='manage-candidates-disabled-filters-style';
    style.textContent=`#profileRequirementFilter:disabled,#profileClientFilter:disabled,#profileLocationFilter:disabled{background:#E9EDF2!important;color:#8A96A5!important;border-color:#D2D9E2!important;opacity:1!important;cursor:not-allowed!important;-webkit-text-fill-color:#8A96A5!important;} #profileRequirementFilter:disabled option,#profileClientFilter:disabled option,#profileLocationFilter:disabled option{color:#8A96A5!important;}`;
    document.head.appendChild(style);
  }
}

function applyManageCandidatesNavigationHighlight(){
  const params=new URLSearchParams(window.location.search);
  if(!params.get('requirement')&&!params.get('requirements'))return;
  const navLink=document.querySelector('.admin-section-nav-link.active[href*="profiles.html"]');
  const heading=document.querySelector('.jobs-heading h1');
  if(navLink){
    navLink.style.setProperty('background','#16834A','important');
    navLink.style.setProperty('border-color','#16834A','important');
    navLink.style.setProperty('color','#FFFFFF','important');
    navLink.style.setProperty('box-shadow','0 2px 5px rgba(22,131,74,.20)','important');
    const underline=document.createElement('style');
    underline.id='manage-candidates-nav-green-highlight';
    underline.textContent='.admin-section-nav-link.active.manage-candidates-green:after{background:#FFFFFF!important;}';
    if(!document.getElementById(underline.id))document.head.appendChild(underline);
    navLink.classList.add('manage-candidates-green');
  }
  if(heading){
    heading.style.setProperty('color','#16834A','important');
  }
}

function setupProfileEntryTabs(){
  const modal=document.getElementById('profileModal');
  if(!modal||modal.dataset.profileTabsReady==='true')return;
  modal.dataset.profileTabsReady='true';
  const buttons=[...modal.querySelectorAll('[data-profile-tab]')];
  const panels=[...modal.querySelectorAll('.npp-tab-panel')];
  function activateProfileTab(panelId){
    buttons.forEach(button=>{
      const active=button.dataset.profileTab===panelId;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
      button.tabIndex=active?0:-1;
    });
    panels.forEach(panel=>{
      const active=panel.id===panelId;
      panel.hidden=!active;
      panel.classList.toggle('hidden',!active);
    });
    const scrollArea=document.getElementById('profileModalScrollableBody');
    if(scrollArea)scrollArea.scrollTop=0;
  }
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>activateProfileTab(button.dataset.profileTab));
    button.addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();
      const next=(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[next].focus();
      activateProfileTab(buttons[next].dataset.profileTab);
    });
  });
  activateProfileTab('profileTabPersonal');
}

document.addEventListener('DOMContentLoaded',async()=>{setupProfileEntryTabs();applyManageCandidatesFilterLock();applyManageCandidatesNavigationHighlight();const allowed=await window.navodixAdminReady;if(allowed===false)return;applyProfilesListScrollLayout();window.addEventListener('resize',updateProfilesListHeight);try{await loadLocationMaster();await loadJobCategories();await loadRequirement();await loadRequirements();await loadProfiles();}catch(err){console.error(err);message('Could not load Profiles Management. Run the Profile Management database migration and deploy the profile-management Edge Function first.','error');}});
})();
