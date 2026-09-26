(function(){
'use strict';

function closeMasterDataMenu(){
  document.querySelectorAll('.admin-section-nav-dropdown[open]').forEach(function(menu){
    menu.removeAttribute('open');
  });
}

document.addEventListener('DOMContentLoaded', function(){
  var dropdowns=document.querySelectorAll('.admin-section-nav-dropdown');
  dropdowns.forEach(function(dropdown){
    var links=dropdown.querySelectorAll('.master-data-menu a');
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
