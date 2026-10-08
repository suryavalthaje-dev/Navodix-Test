(function(){
'use strict';

const EMAIL_TABLE='recruitment_email_notification_settings';

function closeMasterDataMenu(){
  document.querySelectorAll('.admin-section-nav-dropdown[open]').forEach(function(menu){
    menu.removeAttribute('open');
  });
}

function addEmailNotificationModalStyles(){
  if(document.getElementById('nav-email-notification-modal-styles')) return;
  const style=document.createElement('style');
  style.id='nav-email-notification-modal-styles';
  style.textContent=`
#emailNotificationSettingsModal.nxr-modal{position:fixed!important;inset:0!important;z-index:10000!important;display:none!important;align-items:center!important;justify-content:center!important;padding:4px!important;box-sizing:border-box!important;margin:0!important;background:rgba(7,29,73,.35)!important}
#emailNotificationSettingsModal.nxr-modal.is-open{display:flex!important}
#emailNotificationSettingsModal .nxr-dialog{width:min(820px,100%)!important;height:min(760px,calc(100dvh - 8px))!important;max-height:calc(100dvh - 8px)!important;min-height:0!important;margin:0!important;padding:0!important;box-sizing:border-box!important;overflow:hidden!important;display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;background:#fff!important;border:0!important;border-radius:16px!important;box-shadow:0 24px 70px rgba(7,29,73,.25)!important}
#emailNotificationSettingsModal .nxr-header{min-height:0!important;margin:0!important;box-sizing:border-box!important;padding:10px 26px 12px!important;background:#2878E8!important;border-radius:16px 16px 0 0!important;position:relative!important}
#emailNotificationSettingsModal .nxr-form{min-height:0!important;height:auto!important;max-height:none!important;margin:0!important;padding:0!important;box-sizing:border-box!important;overflow:hidden!important;display:grid!important;grid-template-rows:minmax(0,1fr) 54px!important;grid-template-columns:minmax(0,1fr)!important}
#emailNotificationSettingsModal .nxr-body{min-height:0!important;height:auto!important;max-height:none!important;margin:0!important;box-sizing:border-box!important;overflow-y:auto!important;overflow-x:hidden!important;padding:16px 26px 12px!important;scrollbar-width:thin!important}
#emailNotificationSettingsModal .nxr-footer{position:static!important;width:auto!important;height:54px!important;min-height:54px!important;max-height:54px!important;margin:0!important;padding:7px 26px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;overflow:hidden!important;background:#C9D9EC!important;border-top:1px solid #B3C6DD!important;box-shadow:0 -2px 9px rgba(7,29,73,.09)!important}
#emailNotificationSettingsModal .nxr-notice{position:static!important;flex:1 1 auto!important;min-width:0!important;width:auto!important;max-width:none!important;height:30px!important;max-height:30px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border:0!important;background:transparent!important;font-family:Segoe UI,system-ui,-apple-system,sans-serif!important;font-size:12px!important;line-height:13px!important;overflow:hidden!important;overflow-wrap:anywhere!important;word-break:break-word!important}
#emailNotificationSettingsModal .nxr-buttons{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:8px!important;margin:0!important;padding:0!important}
#emailNotificationSettingsModal .nxr-buttons button{box-sizing:border-box!important;height:34px!important;min-height:34px!important;margin:0!important;padding:6px 13px!important;border-radius:5px!important;border:1px solid #2878E8!important;background:#2878E8!important;color:#fff!important;font-family:Segoe UI,system-ui,-apple-system,sans-serif!important;font-size:12px!important;font-weight:600!important;line-height:20px!important;cursor:pointer!important}
#emailNotificationSettingsModal .nxr-buttons button:hover{background:#1D63C7!important;border-color:#1D63C7!important}
#emailNotificationSettingsModal .nxr-close{position:absolute!important;top:5px!important;right:16px!important;z-index:3!important;border:0!important;background:transparent!important;color:#fff!important;font-size:28px!important;line-height:28px!important;padding:0!important;margin:0!important;cursor:pointer!important}
#emailNotificationSettingsModal .nxr-head h3{margin:0!important;color:#fff!important;font-family:Segoe UI,system-ui,-apple-system,sans-serif!important;font-size:23px!important;line-height:1.2!important;font-weight:700!important}
#emailNotificationSettingsModal .nxr-head p{margin:3px 0 0!important;color:rgba(255,255,255,.88)!important;font-family:Segoe UI,system-ui,-apple-system,sans-serif!important;font-size:11px!important;line-height:1.4!important}
#emailNotificationSettingsModal .email-settings-intro{margin:0 0 14px!important;padding:11px 13px!important;background:#F4F8FC!important;border:1px solid #D8E3EF!important;border-radius:7px!important;color:#52637A!important;font-size:12px!important}
#emailNotificationSettingsModal .email-settings-section{border:1px solid #D8E0EA!important;border-radius:8px!important;overflow:hidden!important;margin-bottom:12px!important}
#emailNotificationSettingsModal .email-settings-section-title{padding:10px 13px!important;background:#F4F7FA!important;border-bottom:1px solid #D8E0EA!important;color:#263F62!important;font-size:12px!important;font-weight:700!important}
#emailNotificationSettingsModal .email-settings-row{min-height:50px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;padding:9px 13px!important;border-bottom:1px solid #EEF2F6!important;color:#263F62!important;font-size:13px!important}
#emailNotificationSettingsModal .email-settings-row:last-child{border-bottom:0!important}
#emailNotificationSettingsModal .email-settings-switch{position:relative!important;flex:0 0 42px!important;width:42px!important;height:23px!important}
#emailNotificationSettingsModal .email-settings-switch input{opacity:0!important;width:0!important;height:0!important;position:absolute!important}
#emailNotificationSettingsModal .email-settings-switch>span{position:absolute!important;inset:0!important;cursor:pointer!important;background:#B8C1CC!important;border-radius:999px!important;transition:.18s ease!important}
#emailNotificationSettingsModal .email-settings-switch>span:before{content:""!important;position:absolute!important;width:17px!important;height:17px!important;left:3px!important;top:3px!important;background:#fff!important;border-radius:50%!important;box-shadow:0 1px 3px rgba(0,0,0,.18)!important;transition:.18s ease!important}
#emailNotificationSettingsModal .email-settings-switch input:checked+span{background:#2878E8!important}
#emailNotificationSettingsModal .email-settings-switch input:checked+span:before{transform:translateX(19px)!important}

.master-data-menu .master-data-menu-action{display:block!important;width:100%!important;margin:0!important;padding:8px 12px!important;border:0!important;background:transparent!important;color:inherit!important;font:inherit!important;font-size:13px!important;text-align:left!important;cursor:pointer!important;white-space:nowrap!important;box-sizing:border-box!important;}
.master-data-menu .master-data-menu-action:hover{background:#F1F5F9!important;}
.master-data-menu .master-data-menu-action i{width:16px!important;margin-right:6px!important;}
@media(max-width:640px){#emailNotificationSettingsModal.nxr-modal{padding:4px!important}#emailNotificationSettingsModal .nxr-dialog{width:100%!important;height:calc(100dvh - 8px)!important;max-height:calc(100dvh - 8px)!important;border-radius:14px!important}#emailNotificationSettingsModal .nxr-header{border-radius:14px 14px 0 0!important;padding:8px 18px 10px!important}#emailNotificationSettingsModal .nxr-body{padding:14px 18px 10px!important}#emailNotificationSettingsModal .nxr-footer{padding:7px 18px!important}}
`;
  document.head.appendChild(style);
}

function buildEmailNotificationModal(){
  if(document.getElementById('emailNotificationSettingsModal')) return;
  addEmailNotificationModalStyles();
  const wrapper=document.createElement('div');
  wrapper.className='nxr-modal';
  wrapper.id='emailNotificationSettingsModal';
  wrapper.setAttribute('aria-hidden','true');
  wrapper.innerHTML=`
    <div class="nxr-dialog" role="dialog" aria-modal="true" aria-labelledby="emailNotificationSettingsTitle">
      <div class="nxr-header">
        <button class="nxr-close" id="closeEmailNotificationSettingsModal" type="button" aria-label="Close">&times;</button>
        <div class="nxr-head"><h3 id="emailNotificationSettingsTitle">Email Notifications</h3><p>Control which recruitment workflow emails are sent.</p></div>
      </div>
      <form class="nxr-form" id="emailNotificationSettingsForm" novalidate>
        <div class="nxr-body">
          <div class="email-settings-intro">Changes made here are stored centrally and apply to the corresponding workflow.</div>
          <div class="email-settings-section"><div class="email-settings-section-title">Admin – Add Profile</div>
            <div class="email-settings-row"><span>HR notification</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingAdminHr"><span></span></label></div>
            <div class="email-settings-row"><span>Candidate acknowledgement</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingAdminCandidate"><span></span></label></div>
          </div>
          <div class="email-settings-section"><div class="email-settings-section-title">Submit Your Profile</div>
            <div class="email-settings-row"><span>HR notification</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingSubmitHr"><span></span></label></div>
            <div class="email-settings-row"><span>Candidate acknowledgement</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingSubmitCandidate"><span></span></label></div>
          </div>
          <div class="email-settings-section"><div class="email-settings-section-title">Refer a Candidate</div>
            <div class="email-settings-row"><span>HR notification</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingReferralHr"><span></span></label></div>
            <div class="email-settings-row"><span>Candidate acknowledgement</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingReferralCandidate"><span></span></label></div>
            <div class="email-settings-row"><span>Referrer acknowledgement</span><label class="email-settings-switch"><input type="checkbox" id="emailSettingReferralReferrer"><span></span></label></div>
          </div>
        </div>
        <div class="nxr-footer"><div id="emailNotificationSettingsMessage" class="nxr-notice" aria-live="polite"></div><div class="nxr-buttons"><button class="nxr-cancel" id="cancelEmailNotificationSettingsButton" type="button">Cancel</button><button class="nxr-submit" id="saveEmailNotificationSettingsButton" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button></div></div>
      </form>
    </div>`;
  document.body.appendChild(wrapper);
}

function normalizeEmailNotificationItem(){
  const menus=document.querySelectorAll('.master-data-menu');
  menus.forEach(function(menu){
    let button=menu.querySelector('#emailNotificationSettingsButton');
    if(button) return;
    const link=menu.querySelector('a[href*="email-notifications.html"]');
    if(link){
      button=document.createElement('button');
      button.type='button';
      button.id='emailNotificationSettingsButton';
      button.className='master-data-menu-action';
      button.innerHTML='<i class="fa-solid fa-envelope"></i> Email Notifications';
      link.replaceWith(button);
    }else{
      button=document.createElement('button');
      button.type='button';
      button.id='emailNotificationSettingsButton';
      button.className='master-data-menu-action';
      button.innerHTML='<i class="fa-solid fa-envelope"></i> Email Notifications';
      menu.appendChild(button);
    }
  });
}

function bindEmailNotificationModal(){
  const modal=document.getElementById('emailNotificationSettingsModal');
  const openButtons=document.querySelectorAll('#emailNotificationSettingsButton');
  if(!modal || !openButtons.length) return;
  const closeButton=modal.querySelector('#closeEmailNotificationSettingsModal');
  const cancelButton=modal.querySelector('#cancelEmailNotificationSettingsButton');
  const saveButton=modal.querySelector('#saveEmailNotificationSettingsButton');
  const message=modal.querySelector('#emailNotificationSettingsMessage');
  const map={
    'admin_add_profile:hr_notification':modal.querySelector('#emailSettingAdminHr'),
    'admin_add_profile:candidate_acknowledgement':modal.querySelector('#emailSettingAdminCandidate'),
    'submit_your_profile:hr_notification':modal.querySelector('#emailSettingSubmitHr'),
    'submit_your_profile:candidate_acknowledgement':modal.querySelector('#emailSettingSubmitCandidate'),
    'refer_candidate:hr_notification':modal.querySelector('#emailSettingReferralHr'),
    'refer_candidate:candidate_acknowledgement':modal.querySelector('#emailSettingReferralCandidate'),
    'refer_candidate:referrer_acknowledgement':modal.querySelector('#emailSettingReferralReferrer')
  };
  function msg(t,c){message.textContent=t||'';message.className='admin-message'+(c?' '+c:'')+' nxr-notice';}
  async function load(){
    saveButton.disabled=true; msg('Loading notification settings…','');
    try{
      const client=window.navodixSupabase;
      if(!client) throw new Error('Supabase client is not available.');
      const {data,error}=await client.from(EMAIL_TABLE).select('workflow_key,notification_key,enabled');
      if(error) throw error;
      Object.values(map).forEach(function(input){if(input)input.checked=true;});
      (data||[]).forEach(function(row){const input=map[row.workflow_key+':'+row.notification_key];if(input)input.checked=row.enabled!==false;});
      msg('','');
    }catch(e){console.error(e);msg('Unable to load notification settings.','error');}
    finally{saveButton.disabled=false;}
  }
  async function save(){
    saveButton.disabled=true; msg('Saving notification settings…','');
    try{
      const client=window.navodixSupabase;
      if(!client) throw new Error('Supabase client is not available.');
      const rows=Object.entries(map).map(function(entry){const parts=entry[0].split(':');return {workflow_key:parts[0],notification_key:parts[1],enabled:!!entry[1].checked};});
      const {error}=await client.from(EMAIL_TABLE).upsert(rows,{onConflict:'workflow_key,notification_key'});
      if(error) throw error;
      msg('Notification settings saved successfully.','success');
    }catch(e){console.error(e);msg(e&&e.message||'Unable to save notification settings.','error');}
    finally{saveButton.disabled=false;}
  }
  function open(e){if(e)e.preventDefault();modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');load();}
  function close(){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');}
  openButtons.forEach(function(button){button.addEventListener('click',open);});
  if(closeButton)closeButton.addEventListener('click',close);
  if(cancelButton)cancelButton.addEventListener('click',close);
  const form=modal.querySelector('#emailNotificationSettingsForm');
  if(form)form.addEventListener('submit',function(e){e.preventDefault();save();});
  modal.addEventListener('click',function(e){if(e.target===modal)close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.classList.contains('is-open'))close();});
}

document.addEventListener('DOMContentLoaded', function(){
  normalizeEmailNotificationItem();

  const hasExistingModal=!!document.getElementById('emailNotificationSettingsModal');
  if(!hasExistingModal){
    buildEmailNotificationModal();
    bindEmailNotificationModal();
  }

  const dropdowns=document.querySelectorAll('.admin-section-nav-dropdown');
  dropdowns.forEach(function(dropdown){
    const links=dropdown.querySelectorAll('.master-data-menu a');
    links.forEach(function(link){
      link.addEventListener('click', function(){
        closeMasterDataMenu();
      });
    });
  });

  document.addEventListener('click', function(event){
    if(event.target.closest('.admin-section-nav-dropdown')) return;
    closeMasterDataMenu();
  });
});
})();
