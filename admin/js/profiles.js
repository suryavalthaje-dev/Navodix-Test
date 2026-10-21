(function(){
  'use strict';
  const supabase = window.navodixSupabase;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const requirementId = params.get('requirement');
  const requirementIds = [...new Set((params.get('requirements') || (requirementId || '')).split(',').map(id => id.trim()).filter(Boolean))];
  const multiRequirementContext = !requirementId && requirementIds.length > 1;
  let currentPage = 1;
  const PAGE_SIZE = 20;
  let profiles = [], requirement = null, requirements = [], jobCategories = [], locationMaster = [], locationsLoaded = false, saving = false, keepExistingResume = true, selectedExistingResume = false, allExistingProfiles = [], profileToAssociate = null, interviewProfile = null, interviewRequirementId = '', interviewAssociationId = '', interviewRequirementLabel = '', interviewSaving = false, profileAssociationProfileId = '', profileAssociationEditId = '', editingOriginalStatus = '', pendingDeleteProfileId = '', pendingDeleteProfileName = '';
  let pendingInterviewDeleteId = '', pendingInterviewDeleteButton = null;
  let selectedProfileId = '';
  const requirementStatuses = ['New','Shortlisted','Submitted','Interviewing','Selected','Offer Sent','Joined','On Hold','Future Consideration','Rejected','Withdrawn'];
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
  function showModal(){ $('profileModal').classList.remove('hidden'); $('profileModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function focusProfileFormStart(){ const body=$('profileModal')?.querySelector('.npp-body'); if(body)body.scrollTop=0; requestAnimationFrame(()=>{ const field=$('fullName'); if(field){ field.focus(); if(typeof field.setSelectionRange==='function'){ const end=field.value.length; field.setSelectionRange(end,end); } } }); }
  function closeModal(){ if(saving)return; hideProfileModal(); }
  function hideProfileModal(){ $('profileModal').classList.add('hidden'); $('profileModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  function statusClass(s){ return ({'Available':'status-active','Considering':'status-warning','On Hold':'status-warning','Not Available':'status-danger','Not Suitable':'status-danger','Do Not Contact':'status-danger','Archived':'status-muted'})[s]||'status-info'; }
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
  function resetForm(){ clearCurrentAssociation(); $('profileForm').reset(); renderJobCategories([]); $('profileModalTitle').textContent='Add Profile'; $('profileId').value=''; $('profileAssociationRequirementId').value=requirementId||''; $('profileStatus').value='New'; $('profileSource').value=''; $('profileRequirement').value=requirementId||''; $('existingProfileNotice').classList.add('hidden'); $('resumeReplaceNotice').classList.add('hidden'); $('resumeFile').value=''; $('existingResumeFilename').textContent=''; $('existingResumeFilename').title=''; $('existingResumeFilename').classList.add('hidden'); $('resumeExistingRow').classList.add('hidden'); $('resumeDocumentStatus').textContent='No resume attached'; $('resumeDocumentStatus').classList.remove('has-document'); $('resumeSelectedFileName').textContent='No file selected'; $('clearResumeSelectionButton').classList.add('hidden'); $('resumeHelp').textContent='Select a resume from your computer. Maximum 5 MB. PDF, DOC or DOCX.'; keepExistingResume=true; selectedExistingResume=false; formMessage(''); toggleReferrerFields(); updateProfileFormHero(); }
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
    const {data,error}=await supabase.from('job_categories').select('id,category_name').order('category_name',{ascending:true});
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
  async function loadRequirements(){ const {data,error}=await supabase.from('jobs').select('id,job_code,title,status,location,client_id,clients:client_id(client_name)').order('title',{ascending:true}); if(error)throw error; requirements=(data||[]).map(r=>({...r,client_name:r.clients?.client_name||''})); populateRequirementOptions(requirementId||''); populateProfileFilterOptions(); if(multiRequirementContext){ const chosen=requirements.filter(r=>requirementIds.includes(String(r.id))); const labels=chosen.map(r=>r.title||r.job_code||'Requirement'); const context=$('profileRequirementContext'); if(context){context.textContent='Selected requirements: '+labels.join(', ');context.style.setProperty('color','#16834A','important');context.style.setProperty('font-size','12px','important');context.style.setProperty('font-weight','500','important');context.classList.remove('hidden');} const heading=$('profilesListTitle'); if(heading){heading.replaceChildren();const primary=document.createElement('span');primary.textContent='Candidate Profiles';const suffix=document.createElement('span');suffix.textContent=' - Associated with '+labels.join(', ');suffix.style.fontSize='12px';suffix.style.fontWeight='500';heading.append(primary,suffix);const inline=heading.closest('.jobs-list-heading-inline');if(inline)inline.classList.add('requirement-context');} const desc=$('profilesListDescription');if(desc){desc.textContent='';desc.classList.add('hidden');} const subtitle=$('profilesPageSubtitle');if(subtitle)subtitle.classList.add('hidden');} }
  async function loadProfiles(){ message('Loading profiles…'); let q=supabase.from('profiles').select('id,profile_number,full_name,email,phone,preferred_location,total_experience,current_job_title,current_company,notice_period,current_ctc,expected_ctc,availability,status,created_at').order('created_at',{ascending:false}); if(requirementId || multiRequirementContext) q=q.in('id', await getContextRequirementProfileIds()); const {data,error}=await q; if(error)throw error; profiles=data||[]; await attachSourcesAndAssociations(); if(multiRequirementContext){ const selected=new Set(requirementIds.map(String)); profiles=profiles.filter(p=>(p.associations||[]).some(a=>selected.has(String(a.requirement_id)))); } updateProfileSummary(); render(); message(''); }
  async function getContextRequirementProfileIds(){ const ids=requirementIds.length?requirementIds:(requirementId?[requirementId]:[]); if(!ids.length)return []; const {data,error}=await supabase.from('profile_requirement_associations').select('profile_id').in('requirement_id',ids); if(error)throw error; const profileIds=[...new Set((data||[]).map(x=>x.profile_id).filter(Boolean))]; return profileIds.length?profileIds:['00000000-0000-0000-0000-000000000000']; }
  async function getRequirementProfileIds(){ return getContextRequirementProfileIds(); }
  async function attachSourcesAndAssociations(){ const ids=profiles.map(p=>p.id); if(!ids.length){populateProfileFilterOptions();return;} const [s,a,c]=await Promise.all([supabase.from('profile_sources').select('profile_id,source').in('profile_id',ids).eq('is_primary',true),supabase.from('profile_requirement_associations').select('id,profile_id,requirement_id,status,associated_at').in('profile_id',ids).order('associated_at',{ascending:false}),supabase.from('profile_categories').select('profile_id,category_id').in('profile_id',ids)]); if(s.error)throw s.error;if(a.error)throw a.error;if(c.error)throw c.error; const sourceMap=Object.fromEntries((s.data||[]).map(x=>[x.profile_id,x.source])); const assocMap={}; (a.data||[]).forEach(x=>{(assocMap[x.profile_id]??=[]).push(x)}); const categoryMap={}; (c.data||[]).forEach(x=>{(categoryMap[x.profile_id]??=[]).push(x.category_id)}); profiles.forEach(p=>{p.source=sourceMap[p.id]||'—';p.associations=assocMap[p.id]||[];const latestAssoc=p.associations[0];const latestReq=latestAssoc?requirements.find(r=>String(r.id)===String(latestAssoc.requirement_id)):null;p.latestRequirementName=latestReq?.title||'—';p.latestRequirementId=latestAssoc?.requirement_id||'';p.latestRequirementClientId=latestReq?.client_id||'';p.latestRequirementClientName=latestReq?.client_name||'';p.categoryIds=categoryMap[p.id]||[]}); populateProfileFilterOptions(); }
  function setRequirementContextFilterStyle(select, disabled){
    if(!select)return;
    if(disabled){
      select.style.setProperty('background-color','#f1f3f5','important');
      select.style.setProperty('border-color','#cbd5e1','important');
      select.style.setProperty('color','#64748b','important');
      select.style.setProperty('cursor','not-allowed','important');
      select.style.setProperty('box-shadow','none','important');
    }else{
      ['background-color','border-color','color','cursor','box-shadow'].forEach(property=>select.style.removeProperty(property));
    }
  }
  function populateProfileFilterOptions(){
    const requirementSelect=$('profileRequirementFilter'), clientSelect=$('profileClientFilter'), locationSelect=$('profileLocationFilter');
    if(requirementSelect){ const selected=requirementSelect.value; requirementSelect.innerHTML='<option value="">All Requirements</option>'+requirements.map(r=>`<option value="${esc(r.id)}">${esc(r.job_code||'')} — ${esc(r.title||'')}</option>`).join(''); requirementSelect.value=selected||''; }
    if(clientSelect){ const selected=clientSelect.value; const clients=[...new Map(requirements.filter(r=>r.client_id&&r.client_name).map(r=>[String(r.client_id),r.client_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1])); clientSelect.innerHTML='<option value="">All Clients</option>'+clients.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join(''); clientSelect.value=selected||''; }
    if(requirementId){
      const contextRequirement=requirements.find(r=>String(r.id)===String(requirementId));
      if(requirementSelect){ requirementSelect.innerHTML=`<option value="${esc(requirementId)}">${esc(contextRequirement ? `${contextRequirement.job_code||''}${contextRequirement.job_code?' — ':''}${contextRequirement.title||'Selected Requirement'}` : 'Selected Requirement')}</option>`; requirementSelect.value=String(requirementId); requirementSelect.disabled=true; requirementSelect.title='Fixed to the requirement selected in Manage Requirements'; setRequirementContextFilterStyle(requirementSelect,true); }
      if(clientSelect){ const clientId=String(contextRequirement?.client_id||''); const clientName=contextRequirement?.client_name||'No client assigned'; clientSelect.innerHTML=`<option value="${esc(clientId)}">${esc(clientName)}</option>`; clientSelect.value=clientId; clientSelect.disabled=true; clientSelect.title='Fixed to the client of the selected requirement'; setRequirementContextFilterStyle(clientSelect,true); }
    }else{
      if(requirementSelect){ requirementSelect.disabled=false; requirementSelect.removeAttribute('title'); setRequirementContextFilterStyle(requirementSelect,false); }
      if(clientSelect){ clientSelect.disabled=false; clientSelect.removeAttribute('title'); setRequirementContextFilterStyle(clientSelect,false); }
    }
    if(locationSelect){ const selected=locationSelect.value; const locations=[...new Set(profiles.map(p=>String(p.preferred_location||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); locationSelect.innerHTML='<option value="">All Locations</option>'+locations.map(location=>`<option value="${esc(location)}">${esc(location)}</option>`).join(''); locationSelect.value=selected||''; if(requirementId){ locationSelect.disabled=true; locationSelect.title='Location filter is disabled while viewing profiles for a selected requirement'; setRequirementContextFilterStyle(locationSelect,true); }else{ locationSelect.disabled=false; locationSelect.removeAttribute('title'); setRequirementContextFilterStyle(locationSelect,false); } }
  }
  function displayedAssociation(p){ const associations=Array.isArray(p.associations)?p.associations:[]; if(requirementId)return associations.find(a=>String(a.requirement_id)===String(requirementId))||null; if(multiRequirementContext)return associations.find(a=>requirementIds.includes(String(a.requirement_id)))||null; return associations[0]||null; }
  function displayedAssociationStatus(p){ return displayedAssociation(p)?.status||'—'; }
  const EXPORT_FIELDS = [
    ['profile_number','Profile Number',18,p=>p.profile_number],['full_name','Profile Name',28,p=>p.full_name],['email','Email',30,p=>p.email],['phone','Phone',18,p=>p.phone],
    ['requirement','Requirement',30,p=>requirementId?(requirement?.title||'—'):(p.latestRequirementName||'—')],
    ['all_requirements','All Associated Requirements',45,p=>[...new Set((p.associations||[]).map(a=>requirements.find(r=>String(r.id)===String(a.requirement_id))?.title).filter(Boolean))].join('; ')],
    ['current_company','Current Company',26,p=>p.current_company],['current_job_title','Current Job Title',28,p=>p.current_job_title],['preferred_location','Preferred Location',24,p=>p.preferred_location],
    ['total_experience','Total Experience',18,p=>p.total_experience],['current_ctc','Current CTC',16,p=>p.current_ctc],['expected_ctc','Expected CTC',16,p=>p.expected_ctc],
    ['notice_period','Notice Period',18,p=>p.notice_period],['availability','Availability',18,p=>p.availability],['status','Profile Status',28,p=>p.status],['source','Source',25,p=>p.source],['association_status','Association Status',22,p=>displayedAssociationStatus(p)]
  ];
  const EXPORT_TEMPLATE_KEY='navodix_profiles_export_templates_v1';
  let exportSelectedFields=EXPORT_FIELDS.map(f=>f[0]);
  function exportDefaultConfig(){return {fields:EXPORT_FIELDS.map(f=>({id:f[0],width:f[2]})),headerColor:'2878E8',fontName:'Aptos',fontSize:11,headerBold:true,title:'Navodix-SC_Oracle F & R_Resource_Tracker-Oct 2026',logoData:'data:image/jpeg;base64,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AAn2IKnAyCBXgOi/8EjvgbZ6/wD2hq/jnxHfWCyBo7AvDEWAP3XkVMkdjtCH0IrTPs9zTMcsp4emryjFR36RSS/BH8b+IvgLxfmPGOIx2SqE6GIm5+9NRcJSd5XT3XM2043dtGtNfiP4Dfs7/E39oHxIvhr4b+G5Lkxsv22/kBS2s1JPzyyYwo4JA5ZtpCqxGK/Rn9lz9hH4Vfs7wW3iG+tk17xQiHdrN3H8luTjIt4jkJjAG85c/NyobaPWfAHw38C/CzwxB4N+Hnhi10nTbf8A1dtaoRk4ALMxyzscDLMSx7k1t9K+Jy7hrDYav9ZxP7yr3e0f8K7+b17WP13w38Dsh4M5MbmFsTjFrzNe5Tf/AE7i+q/nkubqlHVBgdMUUUV9MfuYV80f8FEv+Cbfw0/bm8F/2jbm30Hx9pVsV0DxSkORIoy32S6CjMkDEkg/fiY7lyDJHJ9L0VlWo0sRTcKiumcOZZbgs2wcsLi4KcJbp/muzXRrVH8137Rv7Pnxq/ZP+I1z8Mvjl4IutJ1CHLW8xG+2vYj0mt5R8ssZ9VPynKsFZWUebS+IZVl+U7QT0r+mf45/s9/Bj9pXwLL8N/jn8PLDxJo8jiRbW9DK0MgBAkilQrJDJgkb42VsMwzgkV+d3xv/AODazwTreqTap+z/APtG3+jW7jMekeKNHW92sTzi5heIhR0AMTH1Y9aMuwWFw1X3nofged+E2Y4Ou55d+9pvZNpSXreyfqreh+Udz4pKt/rc8fhVXTNR8R+K/Edn4V8JaNe6pqmp3cdrp2m6dbNNPdTSMFSKONAWd2YgBQCSTgZr9JfCP/Bsd8UdRuyvxH/as0Gwtw2Q2i+HZ7yRx6fvJYQp9/m/GvvL9iL/AIJU/slfsJ/8T/4Z+GLnWfFMilZfGPiZ0uL5FKlSkG1FjtkIZwRGoZlbDs+Bj76lnGUZdQvD359Ek0vm2Z5P4XZviqy+tQVKHVtpv5JN6+tkcl/wSF/4J03v7D/wauPE3xVs7N/iR4vWOXxAbaQSrpVuuTFYJIPlYqWLSsnytIdoLrEjt9gUiqF4FLXx2KxVbG4iVaq7yf8AX4H7/lmW4TKMDDCYaNoQVl+rfm3qwooornO8MD0ooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==',wrapText:true,autoFilter:true,freezeHeader:true,cellBorders:true,sheetName:'Profiles',fileName:'Navodix_Profiles',scope:'filtered'};}
  function readExportConfig(){
    const cfg=exportDefaultConfig();
    const checked=[...document.querySelectorAll('[data-export-field]:checked')].map(el=>el.dataset.exportField);
    cfg.fields=checked.map(id=>{const def=EXPORT_FIELDS.find(f=>f[0]===id);return def?{id,width:Math.max(8,Math.min(60,Number($('exportWidth_'+id)?.value)||def[2]))}:null;}).filter(Boolean);
    cfg.headerColor=($('exportHeaderColor')?.value||'2878E8').replace('#','').toUpperCase();
    cfg.fontName=$('exportFontName')?.value||'Aptos';cfg.fontSize=Math.max(8,Math.min(16,Number($('exportFontSize')?.value)||11));cfg.headerBold=$('exportHeaderBold')?.checked!==false;cfg.title=($('exportMainTitle')?.value||'').trim();cfg.logoData=window.__profilesExportLogoData!==undefined?window.__profilesExportLogoData:(window.__profilesExportLogoData===null?'':(window.__profilesExportLogoData||exportDefaultConfig().logoData));
    cfg.wrapText=!!$('exportWrapText')?.checked;cfg.autoFilter=!!$('exportAutoFilter')?.checked;cfg.freezeHeader=!!$('exportFreezeHeader')?.checked;cfg.cellBorders=$('exportCellBorders')?.checked!==false;
    cfg.sheetName=($('exportSheetName')?.value||'Profiles').trim().slice(0,31)||'Profiles';
    cfg.fileName=($('exportFileName')?.value||'Navodix_Profiles').trim().replace(/[\\/:*?"<>|]/g,'_')||'Navodix_Profiles';
    cfg.scope=$('exportScope')?.value==='all'?'all':'filtered';return cfg;
  }
  function setExportConfig(cfg){
    const fields=new Set((cfg?.fields||exportDefaultConfig().fields).map(f=>typeof f==='string'?f:f.id));
    document.querySelectorAll('[data-export-field]').forEach(el=>el.checked=fields.has(el.dataset.exportField));
    (cfg?.fields||exportDefaultConfig().fields).forEach(f=>{const id=typeof f==='string'?f:f.id;const width=typeof f==='string'?null:f.width;const input=$('exportWidth_'+id);if(input&&width)input.value=width;});
    if($('exportHeaderColor'))$('exportHeaderColor').value='#'+(cfg?.headerColor||'2878E8').replace('#','');
    if($('exportFontName'))$('exportFontName').value=cfg?.fontName||'Aptos';if($('exportFontSize'))$('exportFontSize').value=String(cfg?.fontSize||11);if($('exportHeaderBold'))$('exportHeaderBold').checked=cfg?.headerBold!==false;if($('exportMainTitle'))$('exportMainTitle').value=cfg?.title??'Navodix-SC_Oracle F & R_Resource_Tracker-Oct 2026';window.__profilesExportLogoData=cfg?.logoData!==undefined?cfg.logoData:exportDefaultConfig().logoData;const lp=$('exportLogoPreview');if(lp)lp.src=window.__profilesExportLogoData||'';if(lp)lp.style.display=window.__profilesExportLogoData?'block':'none';
    if($('exportWrapText'))$('exportWrapText').checked=cfg?.wrapText!==false;
    if($('exportAutoFilter'))$('exportAutoFilter').checked=cfg?.autoFilter!==false;
    if($('exportFreezeHeader'))$('exportFreezeHeader').checked=cfg?.freezeHeader!==false;
    if($('exportCellBorders'))$('exportCellBorders').checked=cfg?.cellBorders!==false;
    if($('exportSheetName'))$('exportSheetName').value=cfg?.sheetName||'Profiles';
    if($('exportFileName'))$('exportFileName').value=cfg?.fileName||'Navodix_Profiles';
    if($('exportScope'))$('exportScope').value=cfg?.scope||'filtered';
  }
  function getExportTemplates(){try{const v=JSON.parse(localStorage.getItem(EXPORT_TEMPLATE_KEY)||'[]');return Array.isArray(v)?v:[];}catch(_){return [];}}
  function refreshExportTemplates(selected=''){
    const select=$('exportTemplateSelect');if(!select)return;const templates=getExportTemplates();select.innerHTML='<option value="">Choose saved template</option>'+templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');if(selected)select.value=selected;
    const del=$('deleteExportTemplateButton');if(del)del.disabled=!select.value;
  }
  function openExportModal(){
    const modal=$('profilesExportModal');if(!modal)return;
    setExportConfig(exportDefaultConfig());refreshExportTemplates();modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  }
  function closeExportModal(){const modal=$('profilesExportModal');if(!modal)return;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');}
  function exportConfigMessage(text,type=''){const el=$('exportTemplateMessage');if(el){el.textContent=text;el.className='admin-message'+(type?' '+type:'');}}
  async function exportProfilesToExcel(config=readExportConfig()){
    const rows=config.scope==='all'?profiles:filtered();
    if(!rows.length){exportConfigMessage(config.scope==='all'?'There are no profiles available to export.':'There are no profiles to export for the current filters.','error');return;}
    if(!config.fields.length){exportConfigMessage('Select at least one field to export.','error');return;}
    const defs=config.fields.map(f=>EXPORT_FIELDS.find(d=>d[0]===f.id)).filter(Boolean);
    const data=[defs.map(d=>d[1]),...rows.map(p=>defs.map(d=>String((typeof d[3]==='function'?d[3](p):p[d[3]])??'')))];
    const xmlEscape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    const colName=n=>{let name='';while(n){const rem=(n-1)%26;name=String.fromCharCode(65+rem)+name;n=Math.floor((n-1)/26);}return name;};
    const lastCol=colName(data[0].length), lastRow=data.length+3;
    const titleRow=`<row r="2" ht="30" customHeight="1"><c r="A2" t="inlineStr" s="3"><is><t xml:space="preserve">${xmlEscape(config.title||'')}</t></is></c></row>`;
    const headerRow=`<row r="4" ht="24" customHeight="1">${data[0].map((value,ci)=>`<c r="${colName(ci+1)}4" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('')}</row>`;
    const dataRows=data.slice(1).map((row,ri)=>`<row r="${ri+5}">${row.map((value,ci)=>`<c r="${colName(ci+1)}${ri+5}" t="inlineStr" s="${config.cellBorders!==false?'2':'0'}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('');
    const sheetRows=titleRow+headerRow+dataRows;
    const cols=config.fields.map((f,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.max(8,Math.min(60,Number(f.width)||defs[i][2]))}" customWidth="1"/>`).join('');
    const color=config.headerColor.replace(/[^0-9A-F]/gi,'').padStart(6,'0').slice(-6);
    const fontName=xmlEscape(config.fontName||'Aptos');const fontSize=Math.max(8,Math.min(16,Number(config.fontSize)||11));
    const zip=new JSZip();
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.folder('xl').file('workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(config.sheetName.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.folder('xl').folder('_rels').file('workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.folder('xl').file('styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="${fontSize}"/><name val="${fontName}"/></font><font>${config.headerBold!==false?'<b/>':''}<color rgb="FFFFFFFF"/><sz val="${fontSize}"/><name val="${fontName}"/></font><font><b/><color rgb="FF1F3A5F"/><sz val="16"/><name val="${fontName}"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF8A8A8A"/></left><right style="thin"><color rgb="FF8A8A8A"/></right><top style="thin"><color rgb="FF8A8A8A"/></top><bottom style="thin"><color rgb="FF8A8A8A"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="${config.cellBorders!==false?'1':'0'}" xfId="0" applyAlignment="1" applyBorder="1"><alignment vertical="top"${config.wrapText?' wrapText="1"':''}/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="${config.cellBorders!==false?'1':'0'}" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment vertical="center" horizontal="center"${config.wrapText?' wrapText="1"':''}/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="${config.cellBorders!==false?'1':'0'}" xfId="0" applyAlignment="1" applyBorder="1"><alignment vertical="top"${config.wrapText?' wrapText="1"':''}/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    const pane=config.freezeHeader?'<sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'<sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>';
    const autoFilter=config.autoFilter?`<autoFilter ref="A4:${lastCol}${lastRow}"/>`:'';
    const logoData=String(config.logoData||'');let drawingMarkup='', drawingParts='';
    if(/^data:image\/(png|jpeg|jpg);base64,/i.test(logoData)){
      const match=logoData.match(/^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/i);const ext=match[1].toLowerCase()==='png'?'png':'jpeg';const mime=ext==='png'?'image/png':'image/jpeg';
      zip.folder('xl').folder('media').file('export-logo.'+ext,match[2],{base64:true});
      drawingMarkup='<drawing r:id="rId2"/>';
      zip.folder('xl').folder('worksheets').folder('_rels').file('sheet1.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
      zip.folder('xl').folder('drawings').file('drawing1.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>50000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>50000</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Export Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1524000" cy="400050"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>');
      zip.folder('xl').folder('drawings').folder('_rels').file('drawing1.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/export-logo.${ext}"/></Relationships>`);
      drawingParts=`<Default Extension="${ext}" ContentType="${mime}"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
    }
    zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${drawingParts}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
    zip.folder('xl').folder('worksheets').file('sheet1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<cols>${cols}</cols><sheetData><row r="1" ht="52" customHeight="1"/><row r="3" ht="8" customHeight="1"/>${sheetRows}</sheetData>${autoFilter}<mergeCells count="1"><mergeCell ref="A2:${lastCol}2"/></mergeCells>${drawingMarkup}</worksheet>`);
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');const date=new Date().toISOString().slice(0,10);link.href=url;link.download=`${config.fileName}_${date}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    closeExportModal();message(`Exported ${rows.length} profile${rows.length===1?'':'s'} to Excel.`, 'success');
  }
  function filtered(){ const term=$('profileSearch').value.trim().toLowerCase(), status=$('profileStatusFilter').value, profileStatus=$('profileRecordStatusFilter').value, source=$('profileSourceFilter').value, requirementFilter=$('profileRequirementFilter').value, clientFilter=$('profileClientFilter').value, locationFilter=$('profileLocationFilter').value; return profiles.filter(p=>(!term||[p.profile_number,p.full_name,p.email,p.phone,p.preferred_location,p.current_job_title].some(v=>String(v||'').toLowerCase().includes(term)))&&(!status||displayedAssociationStatus(p)===status)&&(!profileStatus||String(p.status||'')===profileStatus)&&(!source||p.source===source)&&((requirementId||multiRequirementContext)||!requirementFilter||String(p.latestRequirementId||'')===String(requirementFilter))&&((requirementId||multiRequirementContext)||!clientFilter||String(p.latestRequirementClientId||'')===String(clientFilter))&&(!locationFilter||String(p.preferred_location||'')===String(locationFilter))); }
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
        frame.src=url + '#toolbar=1&navpanes=0&view=FitH';
        frame.onload=()=>{ if(loading)loading.classList.add('hidden'); frame.classList.remove('hidden'); };
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
      fd.append('action','resume-download');
      fd.append('profile_id',profile.id);
      const response=await fetch(window.NAVODIX_SUPABASE_URL+'/functions/v1/profile-management',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:fd});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(payload.error||payload.message||'Could not prepare the resume download.');
      const url=payload.signed_url||payload.signedUrl;
      if(!url) throw new Error('The Profile Management service did not return a secure download URL.');
      const link=document.createElement('a');
      link.href=url;
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

  function closeProfileNotesModal(){ $('profileNotesModal').classList.add('hidden'); $('profileNotesModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); profileNotesProfileId=''; profileNotesRequirementId=''; profileNotesEditingId=''; resetProfileNoteForm(); }
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
    const {data,error}=await supabase.from('profile_notes').select('id,note_type,note,created_at,created_by').eq('profile_id',profileNotesProfileId).is('requirement_id',null).order('created_at',{ascending:false});
    if(error)throw error; const rows=data||[];
    if(!rows.length){ $('profileNotesTableWrap').classList.add('hidden'); $('profileNotesEmpty').textContent='No profile-level notes have been added.'; $('profileNotesEmpty').classList.remove('hidden'); }
    else $('profileNotesTableBody').innerHTML=rows.map(n=>`<tr><td>${esc(formatDateTime(n.created_at))}</td><td>${esc(n.note_type||'General')}</td><td class="profile-note-text">${esc(n.note||'')}</td><td class="profile-notes-actions"><button type="button" class="icon-button" data-profile-note-edit="${esc(n.id)}" title="Edit note"><i class="fa-solid fa-pen-to-square"></i></button> <button type="button" class="icon-button association-delete-button" data-profile-note-delete="${esc(n.id)}" title="Delete note"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
    $('profileNotesMessage').textContent='';
  }
  async function openProfileLevelNotes(profileId){
    profileNotesProfileId=profileId||''; profileNotesRequirementId=''; profileNotesEditingId=''; if(!profileNotesProfileId)return;
    $('profileNotesTitle').textContent='Profile Notes'; $('profileNotesSectionBadge').textContent='PROFILE NOTES'; $('profileNotesContext').innerHTML='<strong>Scope:</strong> Candidate profile (not requirement-specific)'; $('profileNotesModal').classList.remove('hidden'); $('profileNotesModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); resetProfileNoteForm();
    try{await loadProfileLevelNotes();}catch(err){$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}
  }
  async function loadRequirementNotes(){
    if(!profileNotesProfileId||!profileNotesRequirementId)return;
    $('profileNotesMessage').textContent='Loading…'; $('profileNotesMessage').className='admin-message'; $('profileNotesTableBody').innerHTML=''; $('profileNotesEmpty').classList.add('hidden'); $('profileNotesTableWrap').classList.remove('hidden');
    const {data,error}=await supabase.from('profile_notes').select('id,note_type,note,created_at,created_by').eq('profile_id',profileNotesProfileId).eq('requirement_id',profileNotesRequirementId).order('created_at',{ascending:false});
    if(error)throw error; const rows=data||[];
    if(!rows.length){ $('profileNotesTableWrap').classList.add('hidden'); $('profileNotesEmpty').classList.remove('hidden'); }
    else $('profileNotesTableBody').innerHTML=rows.map(n=>`<tr><td>${esc(formatDateTime(n.created_at))}</td><td>${esc(n.note_type||'Update')}</td><td class="profile-note-text">${esc(n.note||'')}</td><td class="profile-notes-actions"><button type="button" class="icon-button" data-profile-note-edit="${esc(n.id)}" title="Edit note"><i class="fa-solid fa-pen-to-square"></i></button> <button type="button" class="icon-button association-delete-button" data-profile-note-delete="${esc(n.id)}" title="Delete note"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
    $('profileNotesMessage').textContent='';
  }
  async function openProfileRequirementNotes(profileId,requirementId,requirementLabel='Requirement'){
    profileNotesProfileId=profileId||''; profileNotesRequirementId=requirementId||''; profileNotesEditingId=''; if(!profileNotesProfileId||!profileNotesRequirementId)return;
    $('profileNotesTitle').textContent=`Notes — ${requirementLabel}`; $('profileNotesSectionBadge').textContent='REQUIREMENT NOTES'; $('profileNotesContext').innerHTML=`<strong>Requirement:</strong> ${esc(requirementLabel)}`; $('profileNotesModal').classList.remove('hidden'); $('profileNotesModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); resetProfileNoteForm();
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
        let q=supabase.from('profile_notes').update({note_type:noteType,note}).eq('id',profileNotesEditingId).eq('profile_id',profileNotesProfileId);
        q=isProfileLevel?q.is('requirement_id',null):q.eq('requirement_id',profileNotesRequirementId);
        const {error}=await q;if(error)throw error;
        message(isProfileLevel?'Profile-level note updated successfully.':'Requirement-specific note updated successfully.','success');
      }else{
        const {error}=await supabase.from('profile_notes').insert({profile_id:profileNotesProfileId,requirement_id:isProfileLevel?null:profileNotesRequirementId,note_type:noteType,note,created_by:userId});if(error)throw error;
        message(isProfileLevel?'Profile-level note added successfully.':'Requirement-specific note added successfully.','success');
      }
      resetProfileNoteForm(); await openProfileDetails(profileNotesProfileId); if(isProfileLevel)await loadProfileLevelNotes(); else await loadRequirementNotes();
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
        <div class="profile-personal-row profile-personal-row-3">${detailItem('Alternate Phone',p.alternate_phone)}${detailItem('Current Location',p.current_location)}${detailItem('Preferred Location',p.preferred_location)}</div>
      </div></div>
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-briefcase" aria-hidden="true"></i><span>Professional Information</span></div><div class="profile-detail-grid profile-professional-detail-grid">${detailItem('Current Job Title',p.current_job_title)}${detailItem('Current Company',p.current_company)}${detailItem('Total Experience',p.total_experience)}${detailItem('Notice Period',p.notice_period)}${detailItem('Current CTC',p.current_ctc)}${detailItem('Expected CTC',p.expected_ctc)}</div></div>
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
      <div class="profile-detail-section"><div class="profile-detail-section-title"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>Resume</span></div><div class="profile-resume-card"><div class="profile-resume-card-heading">RESUME</div>${p.resume_object_path ? `<div class="profile-resume-file-row"><i class="fa-regular fa-file-lines" aria-hidden="true"></i><span class="profile-resume-file-name" title="${esc(p.resume_file_name||'')}" >${esc(p.resume_file_name||'Resume')}</span></div>${resumeButtons}` : '<div class="profile-resume-file-row">No resume available.</div>'}<div class="profile-detail-item profile-detail-wide profile-resume-last-updated"><div class="profile-resume-last-updated-content"><span class="profile-detail-label">LAST UPDATED</span><div class="profile-detail-value profile-resume-last-updated-value">${esc(p.resume_updated_at?formatDateTime(p.resume_updated_at):'—')}</div></div>${resumeLastUpdatedButton}</div></div></div>
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
    const profileAssociationName=`${p.full_name||''} (${p.profile_number||''})`; $('profileAssociationProfileName').textContent=profileAssociationName; const profileAssociationDisplay=$('profileAssociationProfileNameDisplay'); if(profileAssociationDisplay) profileAssociationDisplay.textContent=profileAssociationName;
    const reqSelect=$('profileAssociationRequirement');
    reqSelect.innerHTML='<option value="">Select Requirement</option>'+requirements
      .filter(r=>!associationId || String(r.id)===String(assoc?.requirement_id) || !associatedIds.has(String(r.id)))
      .map(r=>`<option value="${esc(r.id)}">${esc(r.job_code||'')} — ${esc(r.title||'')}${r.status?` (${esc(r.status)})`:''}</option>`).join('');
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
      await openProfileDetails(id);
      await loadProfiles();
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
    $('associationHistoryTitle').textContent=`${requirementLabel} — ${profileName}`;
    $('associationHistoryProfileName').textContent=profileName||'—';
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
      const rows=data||[];
      $('associationHistoryTableBody').innerHTML=rows.length
        ? rows.map(x=>`<tr><td>${esc(formatDateTime(x.changed_at))}</td><td>${esc(x.previous_status||'—')}</td><td>${esc(x.new_status||'—')}</td><td>${esc(x.notes||'—')}</td><td>${esc(x.changed_by||'—')}</td></tr>`).join('')
        : '<tr><td class="history-empty-state" colspan="5">No status history found.</td></tr>';
      $('associationHistoryMessage').textContent='';
      $('associationHistoryMessage').className='admin-message';
    } catch(err) {
      $('associationHistoryTableBody').innerHTML='<tr><td class="history-error-state" colspan="5">Unable to load status history.</td></tr>';
      $('associationHistoryMessage').textContent=err.message||String(err);
      $('associationHistoryMessage').className='admin-message error';
    }
  }
  function closeAssociationStatusHistory(){ $('associationHistoryModal').classList.add('hidden'); $('associationHistoryModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }


  function updateProfileSummary(){ const rows=filtered(); const set=(id,val)=>{const el=$(id);if(el)el.textContent=String(val);}; set('totalProfilesSummary',rows.length); set('newProfilesSummary',rows.filter(p=>String(p.status||'').trim().toLowerCase()==='new').length); set('availableProfilesSummary',rows.filter(p=>String(p.status||'').trim().toLowerCase()==='available').length); set('associatedProfilesSummary',requirementId?rows.filter(p=>Array.isArray(p.associations)&&p.associations.some(a=>String(a.requirement_id)===String(requirementId))).length:rows.filter(p=>Array.isArray(p.associations)&&p.associations.length>0).length); }

  function render(){ updateProfileSummary(); const body=$('profilesTableBody'), rows=filtered(); const totalPages=1; const start=0; const pageRows=rows; body.innerHTML=pageRows.map(p=>{const selectedAssociation=multiRequirementContext?displayedAssociation(p):null; const selectedRequirement=requirements.find(r=>String(r.id)===String(selectedAssociation?.requirement_id)); const requirementName=requirementId?(requirement?.title||'—'):(multiRequirementContext?(selectedRequirement?.title||'—'):(p.latestRequirementName||'—'));const selected=String(selectedProfileId)===String(p.id)?' profile-row-selected':'';return `<tr class="profile-row${selected}" data-profile-row-id="${esc(p.id)}"><td><div class="profile-name-cell"><strong>${esc(p.full_name)}</strong></div></td><td>${esc(requirementName)}</td><td>${esc(p.current_company||'—')}</td><td>${esc(p.preferred_location||'—')}</td><td>${esc(p.total_experience||'—')}</td><td>${esc(p.current_ctc||'-')}</td><td>${esc(p.expected_ctc||'-')}</td><td>${esc(p.notice_period||'-')}</td><td><span class="status-pill ${statusClass(displayedAssociationStatus(p))}">${esc(displayedAssociationStatus(p))}</span></td></tr>`}).join(''); if(!pageRows.length){ body.innerHTML='<tr class="profiles-empty-row"><td colspan="9"><div class="profiles-empty-cell"><i class="fa-solid fa-users"></i><span>No profiles found</span><small>Add a profile or associate an existing profile with a requirement.</small></div></td></tr>'; } body.parentElement.classList.remove('hidden'); updateProfilesPagination(rows.length,totalPages,start,pageRows.length); updateProfilesListHeight(); }
  function hideProfileRowContextMenu(){ const menu=$('profileRowContextMenu'); if(menu)menu.classList.add('hidden'); }
  function selectProfileRow(profileId){ selectedProfileId=profileId||''; document.querySelectorAll('.profiles-table tbody tr.profile-row').forEach(row=>row.classList.toggle('profile-row-selected',String(row.dataset.profileRowId)===String(selectedProfileId))); }
  function positionProfileRowContextMenu(x,y){ const menu=$('profileRowContextMenu'); if(!menu)return; menu.classList.remove('hidden'); const rect=menu.getBoundingClientRect(); const left=Math.min(x,window.innerWidth-rect.width-8); const top=Math.min(y,window.innerHeight-rect.height-8); menu.style.left=Math.max(8,left)+'px'; menu.style.top=Math.max(8,top)+'px'; }
  function openProfileRowContextMenu(profileId,x,y){ const p=profiles.find(item=>String(item.id)===String(profileId)); if(!p)return; selectProfileRow(profileId); const title=$('profileRowContextMenuTitle'); if(title)title.textContent=`${p.full_name||'Profile'} — Actions`; const download=$('profileContextDownloadResumeButton'); if(download)download.classList.remove('hidden'); positionProfileRowContextMenu(x,y); }
  function openUpdateProfileStatusModal(profileId){
    const p=profiles.find(item=>String(item.id)===String(profileId));
    if(!p){message('Profile could not be found.','error');return;}
    $('updateProfileStatusName').textContent=p.full_name||'Profile';
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
  async function handleProfileContextAction(action){ const id=selectedProfileId; if(!id)return; hideProfileRowContextMenu(); try{ if(action==='view')await openProfileDetails(id); else if(action==='edit')await editProfile(id); else if(action==='update-profile-status')openUpdateProfileStatusModal(id); else if(action==='download-resume'){const p=profiles.find(item=>String(item.id)===String(id));if(!p){message('Profile could not be found.','error');return;}await downloadProfileResume(p);} else if(action==='interviews')await openInterviews(id); else if(action==='edit-association')await openProfileAssociationContextAction(id,'edit'); else if(action==='association-history')await openProfileAssociationContextAction(id,'history'); else if(action==='add-profile-notes'){await openProfileLevelNotes(id);$('profileNoteText')?.focus();} else if(action==='view-profile-notes')await openProfileLevelNotes(id); else if(action==='add-association-notes'){await openProfileAssociationNotes(id);$('profileNoteText')?.focus();} else if(action==='view-association-notes')await openProfileAssociationNotes(id); else if(action==='remove-association')await openProfileAssociationRemoval(id); else if(action==='delete'){ const p=profiles.find(item=>String(item.id)===String(id)); deleteProfile(id,p?.full_name||'this profile'); } }catch(err){message(err.message||String(err),'error');} }

  function updateProfilesPagination(total,totalPages,start,count){ const wrap=$('profilesPagination'); if(!wrap)return; wrap.classList.toggle('hidden',total===0); if(!total)return; $('profilesPageInfo').textContent=`Showing ${start+1}-${start+count} of ${total}`; $('profilesPageNumber').textContent=`Page ${currentPage} of ${totalPages}`; $('profilesFirst').disabled=currentPage<=1; $('profilesPrev').disabled=currentPage<=1; $('profilesNext').disabled=currentPage>=totalPages; $('profilesLast').disabled=currentPage>=totalPages; }
  function goToProfilesPage(page){ const totalPages=Math.max(1,Math.ceil(filtered().length/PAGE_SIZE)); currentPage=Math.min(Math.max(1,page),totalPages); render(); }
  async function callProfileFunction(formData){ const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('Your session has expired. Please sign in again.'); const response=await fetch(window.NAVODIX_SUPABASE_URL+'/functions/v1/profile-management',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:formData}); const payload=await response.json().catch(()=>({})); if(!response.ok){ const raw=payload.error??payload.message; let detail='Profile operation failed.'; if(typeof raw==='string'&&raw.trim()) detail=raw; else if(raw&&typeof raw==='object') detail=raw.message||raw.details||raw.hint||raw.code||JSON.stringify(raw); throw new Error(detail); } return payload; }
  function formDataFromForm(){ const fd=new FormData(); $('profileAssociationRequirementId').value=$('profileRequirement').value||''; const fields={profile_id:$('profileId').value,requirement_id:$('profileAssociationRequirementId').value,full_name:$('fullName').value.trim(),email:$('email').value.trim(),phone:$('phone').value.trim(),alternate_phone:$('alternatePhone').value.trim(),current_location:$('currentLocation').value.trim(),preferred_location:$('preferredLocation').value.trim(),availability:$('availability').value.trim(),current_job_title:$('currentJobTitle').value.trim(),current_company:$('currentCompany').value.trim(),total_experience:$('totalExperience').value.trim(),notice_period:$('noticePeriod').value.trim(),current_ctc:$('currentCtc').value.trim(),expected_ctc:$('expectedCtc').value.trim(),highest_qualification:$('highestQualification').value.trim(),specialization:$('specialization').value.trim(),graduation_year:$('graduationYear').value||'',linkedin_url:$('linkedinUrl').value.trim(),status:$('profileStatus').value,source:$('profileSource').value,source_details:$('sourceDetails').value.trim(),referrer_name:$('referrerName').value.trim(),referrer_mobile:$('referrerMobile').value.trim(),referrer_email:$('referrerEmail').value.trim(),skills:$('skills').value.trim(),additional_information:$('additionalInformation').value.trim(),replace_resume:String(!keepExistingResume)}; Object.entries(fields).forEach(([k,v])=>fd.append(k,v)); const file=$('resumeFile').files[0]; if(file)fd.append('resume',file,file.name); return fd; }
  async function saveProfile(e, closeAfterSave=false){
    if(e&&typeof e.preventDefault==='function')e.preventDefault(); if(saving)return;
    if(!$('fullName').value.trim()||!$('phone').value.trim()||!$('profileSource').value){formMessage('Full Name, Phone and Source are required.','error');return;}
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
  function closeInterviewModal(){ $('interviewModal').classList.add('hidden'); $('interviewModal').setAttribute('aria-hidden','true'); if(!$('interviewFormModal').classList.contains('hidden')){ $('interviewFormModal').classList.add('hidden'); $('interviewFormModal').setAttribute('aria-hidden','true'); } document.body.classList.remove('modal-open'); interviewProfile=null; interviewRequirementId=''; interviewAssociationId=''; interviewRequirementLabel=''; }
  function closeInterviewFormModal(){ if(interviewSaving)return; $('interviewFormModal').classList.add('hidden'); $('interviewFormModal').setAttribute('aria-hidden','true'); $('interviewForm').reset(); $('interviewId').value=''; $('interviewRound').dataset.roundNumber=''; interviewFormMessage(''); }
  function openInterviewForm(interview=null){ $('interviewForm').reset(); $('interviewId').value=interview?.id||''; $('interviewRound').dataset.roundNumber=interview?.round_number||''; $('interviewFormTitle').textContent=interview?'Edit Interview Round':'Add Interview Round'; $('interviewFormNumber').textContent=interview?`Round ${interview.round_number||''} details`:'Interview details'; $('interviewRound').value=interview?.round_name||''; $('interviewDate').value=interview?.scheduled_date||''; $('interviewTime').value=interview?.scheduled_time ? String(interview.scheduled_time).slice(0,5):''; $('interviewMode').value=interview?.mode||'Phone'; $('interviewInterviewer').value=interview?.interviewer||''; $('interviewResult').value=interview?.result||'Pending'; $('interviewFeedback').value=interview?.feedback||''; $('saveInterviewButton').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Interview Round'; interviewFormMessage(''); $('interviewFormModal').classList.remove('hidden'); $('interviewFormModal').setAttribute('aria-hidden','false'); }
  function interviewResultClass(result){ const v=String(result||'').toLowerCase().replace(/\s+/g,'_'); return v==='passed'?'passed':v==='failed'?'failed':v==='pending'?'pending':v==='cancelled'?'cancelled':v==='rescheduled'?'rescheduled':v==='no_show'?'no-show':''; }
  function formatInterviewTime(value){ if(!value)return '—'; const raw=String(value).slice(0,5); const parts=raw.split(':'); if(parts.length<2)return raw; const h=Number(parts[0]), m=parts[1]; if(Number.isNaN(h))return raw; const suffix=h>=12?'PM':'AM'; const hour12=(h%12)||12; return `${hour12}:${m} ${suffix}`; }
  async function loadInterviews(){ if(!interviewProfile||!interviewRequirementId)return; interviewMessage('Loading interviews…'); const {data,error}=await supabase.from('profile_requirement_interviews').select('id,profile_id,requirement_id,association_id,round_number,round_name,scheduled_date,scheduled_time,mode,interviewer,result,feedback,created_at,updated_at').eq('profile_id',interviewProfile.id).eq('requirement_id',interviewRequirementId).order('round_number',{ascending:true}).order('scheduled_date',{ascending:true}); if(error){interviewMessage(error.message,'error');return;} const rows=data||[]; const body=$('interviewTableBody'); body.innerHTML=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.round_name||('Round '+x.round_number))}</td><td><span class="profile-interview-result ${interviewResultClass(x.result)}">${esc(x.result||'—')}</span></td><td>${esc(x.scheduled_date||'—')}</td><td>${esc(formatInterviewTime(x.scheduled_time))}</td><td>${esc(x.mode||'—')}</td><td>${esc(x.interviewer||'—')}</td><td class="profile-interview-feedback-cell">${esc(x.feedback||'—')}</td><td class="profile-interview-actions"><button class="interview-icon-action" type="button" data-interview-edit="${x.id}" title="Edit interview" aria-label="Edit interview"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button><button class="interview-icon-action interview-icon-delete" type="button" data-interview-delete="${x.id}" title="Delete interview" aria-label="Delete interview"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></td></tr>`).join(''); $('noInterviews').classList.toggle('hidden',rows.length!==0); $('interviewTableWrap')?.classList.toggle('hidden',rows.length===0); interviewMessage(''); }
  async function openInterviewsForAssociation(profileId, associationId, reqId, label='Requirement'){ const p=profiles.find(x=>String(x.id)===String(profileId)); if(!p||!reqId)return; interviewProfile=p; interviewRequirementId=reqId; interviewAssociationId=associationId||''; interviewRequirementLabel=label||'Requirement'; $('interviewContext').innerHTML='<strong>Profile:</strong> '+esc(p.full_name)+' ('+esc(p.profile_number)+')<br><strong>Requirement:</strong> '+esc(interviewRequirementLabel); $('interviewModalTitle').textContent='Interview Rounds — '+interviewRequirementLabel; $('interviewModal').classList.remove('hidden'); $('interviewModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); await loadInterviews(); }
  function closeInterviewDeleteConfirm(){const m=$('interviewDeleteConfirmModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}pendingInterviewDeleteId='';pendingInterviewDeleteButton=null;}
  function showInterviewRoundsInfo(text){ const modal=$('interviewRoundsInfoModal'); if(!modal)return; $('interviewRoundsInfoMessage').textContent=text||''; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function closeInterviewRoundsInfo(){ const modal=$('interviewRoundsInfoModal'); if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');} if($('interviewRequirementPickerModal')?.classList.contains('hidden')&&$('interviewModal')?.classList.contains('hidden'))document.body.classList.remove('modal-open'); }
  async function openProfileAssociationNotes(id){
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    const associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(!associations.length){
      if(typeof showInterviewRoundsInfo==='function')showInterviewRoundsInfo('This profile is not associated with any requirement. Associate it with a requirement before adding profile association notes.');
      else message('This profile is not associated with any requirement. Associate it with a requirement before adding profile association notes.','info');
      return;
    }
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{const key=String(a.requirement_id);if(!seen.has(key)){seen.add(key);const r=requirements.find(x=>String(x.id)===key);unique.push({association:a,requirementId:key,label:r?`${r.job_code?`${r.job_code} — `:''}${r.title||'Requirement'}${r.location?` - ${r.location}`:''}`:(a.requirement_title||a.title||'Requirement')});}});
    if(requirementId){const chosen=unique.find(x=>String(x.requirementId)===String(requirementId));if(chosen){await openProfileRequirementNotes(id,chosen.requirementId,chosen.label);return;}}
    if(unique.length===1){const x=unique[0];await openProfileRequirementNotes(id,x.requirementId,x.label);return;}
    const select=$('interviewRequirementPicker'); if(!select){message('Unable to select a requirement for profile association notes. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerTitle').textContent='Select Requirement';
    $('interviewRequirementPickerMessage').textContent=`${p.full_name} is associated with multiple requirements. Select the requirement for which you want to add profile association notes.`;
    const pickerError=$('interviewRequirementPickerError');if(pickerError)pickerError.textContent='';select.value='';
    $('interviewRequirementPickerModal').classList.remove('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{const value=select.value;if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}const x=unique[Number(value)];if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}if(pickerError)pickerError.textContent='';$('interviewRequirementPickerModal').classList.add('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');await openProfileRequirementNotes(id,x.requirementId,x.label);};
  }
  async function openProfileAssociationContextAction(id, action){
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
        unique.push({association:a,requirementId:key,label:r?`${r.job_code?`${r.job_code} — `:''}${r.title||'Requirement'}${r.location?` - ${r.location}`:''}`:(a.requirement_title||a.title||'Requirement')});
      }
    });
    const runAction=async x=>{
      if(action==='edit') await openProfileAssociationModal(id,x.association.id);
      else await openAssociationStatusHistory(x.association.id,x.label,p.full_name||'—');
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
    $('interviewRequirementPickerModal').classList.remove('hidden'); $('interviewRequirementPickerModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{
      const value=select.value;
      if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}
      const x=unique[Number(value)];
      if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}
      if(pickerError)pickerError.textContent='';
      $('interviewRequirementPickerModal').classList.add('hidden'); $('interviewRequirementPickerModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');
      await runAction(x);
    };
  }

  async function openProfileAssociationRemoval(id){
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    const associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(!associations.length){showInterviewRoundsInfo('This profile is not associated with any requirement. Associate it with a requirement before removing an association.');return;}
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{const key=String(a.requirement_id);if(!seen.has(key)){seen.add(key);const r=requirements.find(x=>String(x.id)===key);unique.push({association:a,requirementId:key,label:r?`${r.job_code?`${r.job_code} — `:''}${r.title||'Requirement'}${r.location?` - ${r.location}`:''}`:(a.requirement_title||a.title||'Requirement')});}});
    if(requirementId){const chosen=unique.find(x=>String(x.requirementId)===String(requirementId));if(chosen){await removeProfileAssociation(id,chosen.association.id,chosen.label,p.full_name);return;}}
    if(unique.length===1){const x=unique[0];await removeProfileAssociation(id,x.association.id,x.label,p.full_name);return;}
    const select=$('interviewRequirementPicker'); if(!select){message('Unable to select a requirement. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerTitle').textContent='Select Requirement'; $('interviewRequirementPickerMessage').textContent=`${p.full_name} is associated with multiple requirements. Select the association you want to remove.`;
    const pickerError=$('interviewRequirementPickerError');if(pickerError)pickerError.textContent='';select.value='';
    $('interviewRequirementPickerModal').classList.remove('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{const value=select.value;if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}const x=unique[Number(value)];if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}if(pickerError)pickerError.textContent='';$('interviewRequirementPickerModal').classList.add('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');await removeProfileAssociation(id,x.association.id,x.label,p.full_name);};
  }

  async function openInterviews(id){
    const p=profiles.find(x=>String(x.id)===String(id)); if(!p)return;
    if(requirementId){ const assoc=p.associations?.find(a=>String(a.requirement_id)===String(requirementId)); await openInterviewsForAssociation(id,assoc?.id||'',requirementId,`${requirement?.job_code||''} — ${requirement?.title||'Requirement'}`); return; }
    const associations=(p.associations||[]).filter(a=>a.requirement_id);
    if(!associations.length){ showInterviewRoundsInfo('This profile is not associated with any requirement. Associate it with a requirement before managing interview rounds.'); return; }
    const unique=[]; const seen=new Set();
    associations.forEach(a=>{const key=String(a.requirement_id); if(!seen.has(key)){seen.add(key);const r=requirements.find(x=>String(x.id)===key); unique.push({association:a, requirementId:key, label:r?`${r.title||r.job_code||'Requirement'}${r.location?` - ${r.location}`:''}`:(a.requirement_title||a.title||'Requirement')});}});
    if(unique.length===1){const x=unique[0];await openInterviewsForAssociation(id,x.association.id,x.requirementId,x.label);return;}
    const select=$('interviewRequirementPicker'); if(!select){message('Unable to select a requirement for interview rounds. Please refresh the page.','error');return;}
    select.innerHTML='<option value="">Select a requirement</option>'+unique.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('');
    $('interviewRequirementPickerMessage').textContent=`${p.full_name} is associated with multiple requirements. Select the requirement whose interview rounds you want to manage.`;
    const pickerError=$('interviewRequirementPickerError');if(pickerError)pickerError.textContent='';select.value='';
    $('interviewRequirementPickerModal').classList.remove('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    select.onchange=()=>{if(pickerError)pickerError.textContent='';};
    $('confirmInterviewRequirementPicker').onclick=async()=>{const value=select.value;if(value===''){if(pickerError)pickerError.textContent='Please select a requirement.';return;}const x=unique[Number(value)];if(!x){if(pickerError)pickerError.textContent='Please select a valid requirement.';return;}if(pickerError)pickerError.textContent='';$('interviewRequirementPickerModal').classList.add('hidden');$('interviewRequirementPickerModal').setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');await openInterviewsForAssociation(id,x.association.id,x.requirementId,x.label);};
  }
  function closeInterviewRequirementPicker(){const modal=$('interviewRequirementPickerModal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}if($('interviewRequirementPickerError'))$('interviewRequirementPickerError').textContent='';document.body.classList.remove('modal-open');}
  async function saveInterview(e){ e.preventDefault(); if(interviewSaving||!interviewProfile||!interviewRequirementId)return; const round=$('interviewRound').value.trim(); if(!round||!$('interviewDate').value||!$('interviewInterviewer').value.trim()||!$('interviewMode').value){interviewFormMessage('Please complete all required interview fields.','error');return;} interviewSaving=true; const btn=$('saveInterviewButton'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; interviewFormMessage('Saving interview…'); try{ const id=$('interviewId').value; const payload={profile_id:interviewProfile.id,requirement_id:interviewRequirementId,association_id:interviewAssociationId||null,round_name:round,round_number:parseInt((id?$('interviewRound').dataset.roundNumber:'')||'0',10)||1,scheduled_date:$('interviewDate').value||null,scheduled_time:$('interviewTime').value||null,mode:$('interviewMode').value||null,interviewer:$('interviewInterviewer').value.trim()||null,result:$('interviewResult').value||null,feedback:$('interviewFeedback').value.trim()||null,updated_by:(await supabase.auth.getUser()).data.user?.id||null}; let result; if(id){ result=await supabase.from('profile_requirement_interviews').update(payload).eq('id',id); } else { const {data:existing,error:exErr}=await supabase.from('profile_requirement_interviews').select('round_number').eq('profile_id',interviewProfile.id).eq('requirement_id',interviewRequirementId).order('round_number',{ascending:false}).limit(1); if(exErr)throw exErr; payload.round_number=(existing?.[0]?.round_number||0)+1; payload.created_by=payload.updated_by; result=await supabase.from('profile_requirement_interviews').insert(payload); } if(result.error)throw result.error; interviewFormMessage('Interview saved successfully.','success'); await loadInterviews(); setTimeout(closeInterviewFormModal,500); }catch(err){console.error(err);interviewFormMessage(err.message||String(err),'error');}finally{interviewSaving=false;btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Interview Round';} }

  async function editProfile(id){ const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error)throw error; resetForm(); renderJobCategories([]); const categoryIds=await getProfileCategories(id); renderJobCategories(categoryIds); $('profileId').value=data.id; await loadCurrentAssociation(data.id); editingOriginalStatus=data.status||''; $('fullName').value=data.full_name||'';$('email').value=data.email||'';$('phone').value=data.phone||'';$('alternatePhone').value=data.alternate_phone||'';populateLocationOptions(data.current_location||'',data.preferred_location||'');$('availability').value=data.availability||'';$('currentJobTitle').value=data.current_job_title||'';$('currentCompany').value=data.current_company||'';$('totalExperience').value=data.total_experience||'';$('noticePeriod').value=data.notice_period||'';$('currentCtc').value=data.current_ctc||'';$('expectedCtc').value=data.expected_ctc||'';$('highestQualification').value=data.highest_qualification||'';$('specialization').value=data.specialization||'';$('graduationYear').value=data.graduation_year||'';$('linkedinUrl').value=data.linkedin_url||'';$('skills').value=data.skills||''; if(data.resume_file_name){$('existingResumeFilename').textContent=data.resume_file_name;$('existingResumeFilename').title=data.resume_file_name;$('existingResumeFilename').classList.remove('hidden');$('resumeExistingRow').classList.remove('hidden');$('resumeDocumentStatus').textContent='Resume attached';$('resumeDocumentStatus').classList.add('has-document');}$('additionalInformation').value=data.additional_information||'';$('profileStatus').value=data.status||'New'; populateRequirementOptions(requirementId||''); $('profileRequirement').value=requirementId||''; $('profileAssociationRequirementId').value=requirementId||''; const {data:src}=await supabase.from('profile_sources').select('source,source_details,referrer_name,referrer_mobile,referrer_email').eq('profile_id',id).eq('is_primary',true).maybeSingle(); if(src){$('profileSource').value=src.source||'';$('sourceDetails').value=src.source_details||'';$('referrerName').value=src.referrer_name||'';$('referrerMobile').value=src.referrer_mobile||'';$('referrerEmail').value=src.referrer_email||'';toggleReferrerFields();} $('profileModalTitle').innerHTML=`Edit Profile : <span class="profile-header-name">${esc(data.full_name||'Profile')}</span> <span class="profile-header-code">(${esc(data.profile_number||'')})</span>`; updateProfileFormHero(); if(requirement){$('existingProfileNotice').innerHTML='<strong>Requirement:</strong> '+esc(requirement.job_code)+' — '+esc(requirement.title)+'<br><small>Saving will keep this profile associated with the requirement.</small>';$('existingProfileNotice').classList.remove('hidden');} showModal(); focusProfileFormStart(); }
  function renderExistingProfiles(){ const body=$('existingProfileTableBody'); const term=$('existingProfileSearch').value.trim().toLowerCase(); const rows=allExistingProfiles.filter(p=>!term||[p.profile_number,p.full_name,p.email,p.phone,p.current_location].some(v=>String(v||'').toLowerCase().includes(term))); body.innerHTML=rows.map(p=>`<tr><td><div class="profile-name-cell"><strong>${esc(p.full_name)}</strong><span>${esc(p.profile_number)} · ${esc(p.current_job_title||'')}</span></div></td><td>${esc(p.current_location||'—')}</td><td><span class="status-pill ${statusClass(p.status)}">${esc(p.status)}</span></td><td><button class="btn btn-primary btn-small" data-existing-associate="${p.id}"><i class="fa-solid fa-link"></i> Associate</button></td></tr>`).join(''); if(!rows.length) $('existingProfileMessage').textContent='No matching profiles found.'; else $('existingProfileMessage').textContent=''; }
  async function openExistingProfileModal(){ if(!requirementId||!requirement)return; $('existingProfileSearch').value=''; $('existingProfileMessage').textContent='Loading profiles…'; $('existingProfileModal').classList.remove('hidden'); $('existingProfileModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); const {data,error}=await supabase.from('profiles').select('id,profile_number,full_name,email,phone,current_location,current_job_title,status').order('full_name'); if(error){$('existingProfileMessage').textContent=error.message;return;} const {data:assoc,error:assocError}=await supabase.from('profile_requirement_associations').select('profile_id').eq('requirement_id',requirementId); if(assocError){$('existingProfileMessage').textContent=assocError.message;return;} const associatedIds=new Set((assoc||[]).map(x=>x.profile_id)); allExistingProfiles=(data||[]).filter(p=>!associatedIds.has(p.id)); renderExistingProfiles(); }
  function closeExistingProfileModal(){ $('existingProfileModal').classList.add('hidden'); $('existingProfileModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  function openAssociateRequirementModal(id){ const p=profiles.find(x=>x.id===id); profileToAssociate={id,name:p?.full_name||'Profile'}; $('associateRequirementProfileName').textContent=p?.full_name ? `${p.full_name} (${p.profile_number||''})` : id; const profileDisplay=$('associateRequirementProfileDisplay'); if(profileDisplay) profileDisplay.textContent=p?.full_name ? `${p.full_name} (${p.profile_number||''})` : id; $('associateRequirementSelect').innerHTML='<option value="">Select Requirement</option>'+requirements.map(r=>`<option value="${esc(r.id)}">${esc(r.title||'Requirement')}${r.location?` - ${esc(r.location)}`:''}</option>`).join(''); $('associateRequirementSelect').value=''; $('associateRequirementMessage').textContent=''; $('associateRequirementMessage').className='admin-message'; $('associateRequirementModal').classList.remove('hidden'); $('associateRequirementModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function closeAssociateRequirementModal(){ profileToAssociate=null; $('associateRequirementModal').classList.add('hidden'); $('associateRequirementModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
  async function saveAssociateRequirement(){ if(!profileToAssociate)return; const reqId=$('associateRequirementSelect').value; if(!reqId){ $('associateRequirementMessage').textContent='Please select a requirement.'; $('associateRequirementMessage').className='admin-message error'; return; } const btn=$('saveAssociateRequirementButton'); btn.disabled=true; $('associateRequirementMessage').textContent='Associating profile…'; $('associateRequirementMessage').className='admin-message'; try{ const {data:created,error}=await supabase.from('profile_requirement_associations').upsert({profile_id:profileToAssociate.id,requirement_id:reqId,status:'New',association_type:'manual'},{onConflict:'profile_id,requirement_id'}).select('id,status').single(); if(error)throw error; await recordInitialAssociationStatus(created.id,'New',''); $('associateRequirementMessage').textContent='Profile associated successfully with the requirement.'; $('associateRequirementMessage').className='admin-message success'; message('Profile associated successfully with the requirement.','success'); await loadProfiles(); setTimeout(closeAssociateRequirementModal,500); }catch(err){ $('associateRequirementMessage').textContent=err.message||String(err); $('associateRequirementMessage').className='admin-message error'; } finally { btn.disabled=false; } }
  async function associateProfile(id){ if(requirementId){ const {data:created,error}=await supabase.from('profile_requirement_associations').upsert({profile_id:id,requirement_id:requirementId,status:'New',association_type:'manual'},{onConflict:'profile_id,requirement_id'}).select('id,status').single(); if(error)throw error; await recordInitialAssociationStatus(created.id,'New',''); message('Profile associated successfully with the requirement.','success'); await loadProfiles(); return; } openAssociateRequirementModal(id); }

  ['fullName','totalExperience','currentCtc','expectedCtc','noticePeriod','profileStatus'].forEach(id=>$(id)?.addEventListener('input',updateProfileFormHero)); $('profileStatus').addEventListener('change',updateProfileFormHero);
  $('profileRequirement').addEventListener('change',()=>{ $('profileAssociationRequirementId').value=$('profileRequirement').value||''; }); $('profileSource').addEventListener('change',toggleReferrerFields); $('resumeFile').addEventListener('change',()=>{const file=$('resumeFile').files[0];$('resumeSelectedFileName').textContent=file?file.name:'No file selected';$('clearResumeSelectionButton').classList.toggle('hidden',!file);selectedExistingResume=Boolean($('profileId').value);if(file){$('resumeDocumentStatus').textContent='Resume selected';$('resumeDocumentStatus').classList.add('has-document');}else if(!$('existingResumeFilename').textContent){$('resumeDocumentStatus').textContent='No resume attached';$('resumeDocumentStatus').classList.remove('has-document');}if(selectedExistingResume&&file)$('resumeReplaceNotice').classList.remove('hidden');}); $('clearResumeSelectionButton').addEventListener('click',()=>{$('resumeFile').value='';$('resumeSelectedFileName').textContent='No file selected';$('clearResumeSelectionButton').classList.add('hidden');$('resumeReplaceNotice').classList.add('hidden');if($('existingResumeFilename').textContent){$('resumeDocumentStatus').textContent='Resume attached';$('resumeDocumentStatus').classList.add('has-document');}else{$('resumeDocumentStatus').textContent='No resume attached';$('resumeDocumentStatus').classList.remove('has-document');}}); $('keepResumeButton').addEventListener('click',()=>{keepExistingResume=true;$('resumeFile').value='';$('resumeReplaceNotice').classList.add('hidden');formMessage('Existing resume will be kept.','');}); $('replaceResumeButton').addEventListener('click',()=>{keepExistingResume=false;$('resumeReplaceNotice').classList.add('hidden');formMessage('New resume will replace the existing resume when saved.','');}); $('addProfileButton').addEventListener('click',openAdd); $('closeProfileModal').addEventListener('click',closeModal); $('cancelProfileButton').addEventListener('click',closeModal); $('saveProfileCloseButton').addEventListener('click',()=>{ saveProfile(null,true); }); $('profileForm').addEventListener('submit',saveProfile); $('profileSearch').addEventListener('input',()=>{currentPage=1;render();}); $('profileStatusFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileRecordStatusFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileSourceFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileRequirementFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileClientFilter').addEventListener('change',()=>{currentPage=1;render();}); $('profileLocationFilter').addEventListener('change',()=>{currentPage=1;render();});
  $('clearProfileFiltersButton').addEventListener('click',()=>{
    $('profileSearch').value='';
    $('profileStatusFilter').value='';
    $('profileRecordStatusFilter').value='';
    $('profileSourceFilter').value='';
    if(!requirementId){ $('profileRequirementFilter').value=''; $('profileClientFilter').value=''; }
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
  $('exportProfilesButton').addEventListener('click',openExportModal);
    $('closeProfilesExportModal')?.addEventListener('click',closeExportModal);$('cancelProfilesExportButton')?.addEventListener('click',closeExportModal);
    $('exportSelectAllFields')?.addEventListener('change',e=>document.querySelectorAll('[data-export-field]').forEach(el=>el.checked=e.target.checked));
    $('exportTemplateSelect')?.addEventListener('change',e=>{const t=getExportTemplates().find(x=>x.id===e.target.value);if(t)setExportConfig(t.config);$('deleteExportTemplateButton').disabled=!e.target.value;});
    $('exportLogoFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!/^image\/(png|jpeg)$/.test(file.type)){exportConfigMessage('Choose a PNG or JPEG logo image.','error');e.target.value='';return;}if(file.size>500000){exportConfigMessage('Logo image must be 500 KB or smaller so it can be saved with a template.','error');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{window.__profilesExportLogoData=String(reader.result||'');const preview=$('exportLogoPreview');if(preview){preview.src=window.__profilesExportLogoData;preview.style.display='block';}exportConfigMessage('Logo loaded. Save the template to keep it with these settings.','success');};reader.onerror=()=>exportConfigMessage('Could not read the logo image.','error');reader.readAsDataURL(file);});
    $('clearExportLogoButton')?.addEventListener('click',()=>{window.__profilesExportLogoData='';const preview=$('exportLogoPreview');if(preview){preview.removeAttribute('src');preview.style.display='none';}if($('exportLogoFile'))$('exportLogoFile').value='';exportConfigMessage('Logo removed. Save the template to keep this setting.','success');});
    $('saveExportTemplateButton')?.addEventListener('click',()=>{const name=($('exportTemplateName')?.value||'').trim();if(!name){exportConfigMessage('Enter a name for this export template.','error');$('exportTemplateName')?.focus();return;}try{const templates=getExportTemplates();const existing=templates.find(t=>String(t.name||'').toLowerCase()===name.toLowerCase());const item={id:existing?.id||('tpl_'+Date.now()),name,config:readExportConfig()};const next=existing?templates.map(t=>t.id===existing.id?item:t):[...templates,item];localStorage.setItem(EXPORT_TEMPLATE_KEY,JSON.stringify(next));const verify=JSON.parse(localStorage.getItem(EXPORT_TEMPLATE_KEY)||'[]');if(!Array.isArray(verify)||!verify.some(t=>t.id===item.id)){throw new Error('The browser did not retain the saved template. Check browser storage/privacy settings.');}refreshExportTemplates(item.id);$('exportTemplateName').value=name;exportConfigMessage('Template saved and verified in this browser.','success');}catch(err){console.error('Export template save failed:',err);exportConfigMessage('Could not save template. '+(err.message||String(err)),'error');}});
    $('deleteExportTemplateButton')?.addEventListener('click',()=>{const id=$('exportTemplateSelect')?.value;if(!id)return;try{const next=getExportTemplates().filter(t=>t.id!==id);localStorage.setItem(EXPORT_TEMPLATE_KEY,JSON.stringify(next));refreshExportTemplates();exportConfigMessage('Saved template deleted.','success');}catch(err){exportConfigMessage('Could not delete template. '+(err.message||String(err)),'error');}});
    $('exportProfilesNowButton')?.addEventListener('click',()=>{exportConfigMessage('');exportProfilesToExcel().catch(err=>{console.error(err);exportConfigMessage('Could not export profiles to Excel. '+(err.message||String(err)),'error');});});     $('refreshProfilesButton').addEventListener('click',()=>{currentPage=1;loadProfiles();}); $('associateExistingButton').addEventListener('click',openExistingProfileModal); $('closeExistingProfileModal').addEventListener('click',closeExistingProfileModal); $('closeAssociateRequirementModal').addEventListener('click',closeAssociateRequirementModal); $('cancelAssociateRequirementButton').addEventListener('click',closeAssociateRequirementModal); $('saveAssociateRequirementButton').addEventListener('click',saveAssociateRequirement); $('existingProfileSearch').addEventListener('input',renderExistingProfiles); $('existingProfileTableBody').addEventListener('click',async e=>{const b=e.target.closest('[data-existing-associate]');if(!b)return; b.disabled=true; try{await associateProfile(b.dataset.existingAssociate);}catch(err){$('existingProfileMessage').textContent=err.message||String(err);}finally{b.disabled=false;}}); $('profilesTableBody').addEventListener('click',e=>{ const row=e.target.closest('tr.profile-row'); if(!row)return; selectProfileRow(row.dataset.profileRowId); hideProfileRowContextMenu(); }); $('profilesTableBody').addEventListener('dblclick',async e=>{ const row=e.target.closest('tr.profile-row'); if(!row)return; selectProfileRow(row.dataset.profileRowId); hideProfileRowContextMenu(); try{ await openProfileDetails(row.dataset.profileRowId); }catch(err){ message(err.message||String(err),'error'); } });
  $('profilesTableBody').addEventListener('contextmenu',e=>{ const row=e.target.closest('tr.profile-row'); if(!row)return; e.preventDefault(); openProfileRowContextMenu(row.dataset.profileRowId,e.clientX,e.clientY); });
  $('profileRowContextMenu').addEventListener('click',async e=>{ const button=e.target.closest('[data-context-action]'); if(!button)return; await handleProfileContextAction(button.dataset.contextAction); });
  $('closeUpdateProfileStatusModal').addEventListener('click',closeUpdateProfileStatusModal); $('cancelUpdateProfileStatusButton').addEventListener('click',closeUpdateProfileStatusModal); $('saveUpdateProfileStatusButton').addEventListener('click',saveUpdatedProfileStatus); $('updateProfileStatusModal').addEventListener('click',e=>{if(e.target===$('updateProfileStatusModal'))closeUpdateProfileStatusModal();});
  document.addEventListener('click',e=>{ const menu=$('profileRowContextMenu'); if(menu&&!menu.contains(e.target))hideProfileRowContextMenu(); });
  window.addEventListener('resize',hideProfileRowContextMenu);
  window.addEventListener('scroll',hideProfileRowContextMenu,true); $('cancelRemoveProfileAssociationButton').addEventListener('click',closeRemoveProfileAssociationModal); $('confirmRemoveProfileAssociationButton').addEventListener('click',confirmRemoveProfileAssociation); $('closeProfileDetailsModal').addEventListener('click',closeProfileDetails); $('closeProfileDetailsButton').addEventListener('click',closeProfileDetails); $('cancelDeleteProfileButton').addEventListener('click',closeDeleteProfileModal); $('confirmDeleteProfileButton').addEventListener('click',confirmDeleteProfile); $('closeAssociationHistoryModal').addEventListener('click',closeAssociationStatusHistory); $('closeAssociationHistoryButton').addEventListener('click',closeAssociationStatusHistory); $('profileDetailsBody').addEventListener('click',async e=>{
    if(e.target.closest('#closeProfileResumeButton') || e.target.closest('#closeProfileResumeBottomButton')){
      const viewer=$('profileResumeViewer'); const frame=$('profileResumeFrame'); const docxViewer=$('profileResumeDocxViewer'); const loading=$('profileResumeLoading');
      if(frame)frame.src=''; if(docxViewer)docxViewer.innerHTML=''; if(loading){loading.classList.remove('hidden'); loading.textContent='Loading resume…';}
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
  $('profileNotesTableBody').addEventListener('click',async e=>{
    const edit=e.target.closest('[data-profile-note-edit]');
    if(edit){
      try{
        let q=supabase.from('profile_notes').select('id,note_type,note').eq('id',edit.dataset.profileNoteEdit).eq('profile_id',profileNotesProfileId);
        q=profileNotesRequirementId?q.eq('requirement_id',profileNotesRequirementId):q.is('requirement_id',null);
        const {data,error}=await q.single();if(error)throw error;
        profileNotesEditingId=data.id;$('profileNoteId').value=data.id;setProfileNoteTypeOptions(!profileNotesRequirementId);$('profileNoteType').value=data.note_type||(!profileNotesRequirementId?'General':'Update');$('profileNoteText').value=data.note||'';$('saveProfileNoteButton').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Changes';profileNoteFormMessage('Editing note…');$('profileNoteText').focus();
      }catch(err){$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}return;
    }
    const del=e.target.closest('[data-profile-note-delete]');
    if(del){
      if(!confirm(profileNotesRequirementId?'Delete this requirement-specific note?':'Delete this profile-level note?'))return;
      del.disabled=true;
      try{let q=supabase.from('profile_notes').delete().eq('id',del.dataset.profileNoteDelete).eq('profile_id',profileNotesProfileId);q=profileNotesRequirementId?q.eq('requirement_id',profileNotesRequirementId):q.is('requirement_id',null);const {error}=await q;if(error)throw error;message(profileNotesRequirementId?'Requirement-specific note deleted successfully.':'Profile-level note deleted successfully.','success');resetProfileNoteForm();if(profileNotesRequirementId)await loadRequirementNotes();else await loadProfileLevelNotes();await openProfileDetails(profileNotesProfileId);}catch(err){$('profileNotesMessage').textContent=err.message||String(err);$('profileNotesMessage').className='admin-message error';}finally{del.disabled=false;}}
  });
  $('interviewRoundsInfoOk')?.addEventListener('click',closeInterviewRoundsInfo); $('closeInterviewRoundsInfo')?.addEventListener('click',closeInterviewRoundsInfo); $('interviewRoundsInfoModal')?.addEventListener('click',e=>{if(e.target===$('interviewRoundsInfoModal'))closeInterviewRoundsInfo();}); $('closeInterviewRequirementPicker')?.addEventListener('click',closeInterviewRequirementPicker); $('cancelInterviewRequirementPicker')?.addEventListener('click',closeInterviewRequirementPicker); $('closeInterviewModal').addEventListener('click',closeInterviewModal); $('cancelInterviewModalButton').addEventListener('click',closeInterviewModal); $('addInterviewButton').addEventListener('click',()=>openInterviewForm()); $('closeInterviewFormModal').addEventListener('click',closeInterviewFormModal); $('cancelInterviewButton').addEventListener('click',closeInterviewFormModal); $('interviewForm').addEventListener('submit',saveInterview); $('interviewTableBody').addEventListener('click',async e=>{const edit=e.target.closest('[data-interview-edit]'); if(edit){const {data,error}=await supabase.from('profile_requirement_interviews').select('*').eq('id',edit.dataset.interviewEdit).single(); if(error){interviewMessage(error.message,'error');return;} openInterviewForm(data); return;} const del=e.target.closest('[data-interview-delete]'); if(del){pendingInterviewDeleteId=del.dataset.interviewDelete;pendingInterviewDeleteButton=del;const cm=$('interviewDeleteConfirmModal');cm.classList.remove('hidden');cm.setAttribute('aria-hidden','false');return;}}); $('cancelDeleteInterviewButton')?.addEventListener('click',closeInterviewDeleteConfirm); $('interviewDeleteConfirmModal')?.addEventListener('click',e=>{if(e.target===$('interviewDeleteConfirmModal'))closeInterviewDeleteConfirm();}); $('confirmDeleteInterviewButton')?.addEventListener('click',async()=>{if(!pendingInterviewDeleteId)return;const id=pendingInterviewDeleteId;const sourceButton=pendingInterviewDeleteButton;const confirmButton=$('confirmDeleteInterviewButton');confirmButton.disabled=true;if(sourceButton)sourceButton.disabled=true;try{const {error}=await supabase.from('profile_requirement_interviews').delete().eq('id',id);if(error)throw error;closeInterviewDeleteConfirm();await loadInterviews();interviewMessage('Interview round deleted successfully.','success');}catch(err){closeInterviewDeleteConfirm();interviewMessage(err.message||String(err),'error');}finally{confirmButton.disabled=false;if(sourceButton)sourceButton.disabled=false;}}); $('profileModal').addEventListener('click',e=>{if(e.target===$('profileModal'))return;});
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

document.addEventListener('DOMContentLoaded',async()=>{applyManageCandidatesNavigationHighlight();const allowed=await window.navodixAdminReady;if(allowed===false)return;applyProfilesListScrollLayout();window.addEventListener('resize',updateProfilesListHeight);try{await loadLocationMaster();await loadJobCategories();await loadRequirement();await loadRequirements();await loadProfiles();}catch(err){console.error(err);message('Could not load Profiles Management. Run the Profile Management database migration and deploy the profile-management Edge Function first.','error');}});
})();
