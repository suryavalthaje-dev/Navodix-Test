document.addEventListener("DOMContentLoaded", () => {
  const counters = document.querySelectorAll('.counter');
  
  counters.forEach(counter => {
    const target = +counter.getAttribute('data-target');
    let count = 0;
    const speed = target / 40;
    
    const updateCount = () => {
      count += speed;
      if (count < target) {
        counter.innerText = Math.ceil(count) + '+';
        setTimeout(updateCount, 30);
      } else {
        counter.innerText = target + '+';
      }
    };
    
    updateCount();
  });
});