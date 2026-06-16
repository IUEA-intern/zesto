/* ─── FUNCTION: MOBILE DRAWER WINDOW TOGGLE ─── */
  function toggleMobileDrawer() {
    const drawer = document.getElementById('mobileDrawer');
    const trigger = document.getElementById('drawerTrigger');
    drawer.classList.toggle('open');
    trigger.classList.toggle('active');
  }

  /* ─── FUNCTION: INTERACTIVE ACCORDION MECHANICS ─── */
  function toggleFaqAccordion(button) {
    const parentNode = button.parentElement;
    const targetPanel = parentNode.querySelector('.faq-panel');
    
    document.querySelectorAll('.faq-node').forEach(node => {
      if (node !== parentNode && node.classList.contains('active')) {
        node.classList.remove('active');
        node.querySelector('.faq-panel').style.maxHeight = null;
      }
    });

    parentNode.classList.toggle('active');
    if (parentNode.classList.contains('active')) {
      targetPanel.style.maxHeight = targetPanel.scrollHeight + "px";
    } else {
      targetPanel.style.maxHeight = null;
    }
  }

  /* ─── FUNCTION: POP-UP OVERLAY MODAL TOGGLE ENGINE ─── */
  function toggleComplianceModal(show) {
    const overlay = document.getElementById('complianceModalOverlay');
    if (show) {
      overlay.classList.add('modal-visible');
    } else {
      overlay.classList.remove('modal-visible');
    }
  }

  /* ─── THREE.JS RIG: SPHERE RENDER CONTROLLERS ─── */
  const container = document.getElementById('blender-canvas-container');
  const magicText = document.getElementById('magic-text-overlay');
  const scene = new THREE.Scene();
  
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 4.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const particleCount = 450;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const targetRadius = 1.05;

  for (let i = 0; i < particleCount; i++) {
    const u = Math.random(), v = Math.random();
    const theta = u * 2.0 * Math.PI, phi = Math.acos(2.0 * v - 1.0);
    positions[i * 3] = targetRadius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = targetRadius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = targetRadius * Math.cos(phi);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xFF5500, size: 0.045, transparent: true, opacity: 0.85 });
  const orbSystem = new THREE.Points(geometry, material);
  scene.add(orbSystem);

  let mouseX = 0, mouseY = 0, targetScale = 1.0;
  window.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    if(e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      mouseX = ((e.clientX - rect.left) / container.clientWidth) - 0.5;
      mouseY = ((e.clientY - rect.top) / container.clientHeight) - 0.5;
    }
  });

  const magicWords = ["RIDE FOR GLORY! 🚀", "UNLIMITED EARNINGS! 💰", "SPEED & FREEDOM! ⚡"];
  container.addEventListener('mousedown', () => {
    targetScale = 1.35; material.color.setHex(0xFF7733);
    magicText.innerText = magicWords[Math.floor(Math.random() * magicWords.length)];
    magicText.style.opacity = "1";
    setTimeout(() => { targetScale = 1.0; material.color.setHex(0xFF5500); magicText.style.opacity = "0"; }, 1400);
  });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    orbSystem.rotation.y = time * 0.18; orbSystem.rotation.x = time * 0.08;
    orbSystem.scale.x += (targetScale - orbSystem.scale.x) * 0.1;
    orbSystem.scale.y += (targetScale - orbSystem.scale.y) * 0.1;
    orbSystem.scale.z += (targetScale - orbSystem.scale.z) * 0.1;
    orbSystem.position.x += (mouseX * 1.5 - orbSystem.position.x) * 0.08;
    orbSystem.position.y += (-mouseY * 1.5 - orbSystem.position.y) * 0.08;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  /* ─── HARDWARE DATA LOGISTICS TRIGGERS ─── */
  function flagUploadSuccess(inputElement) {
    if(inputElement.files.length > 0) inputElement.parentElement.classList.add('file-loaded');
  }

  function switchTab(id, el) {
    document.querySelectorAll('.vtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.vtab-content').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-' + id).classList.add('active');
  }

  /* ─── EARNINGS SLIDER WIDGET FORMULAS ─── */
  const tripsSlider = document.getElementById('trips-slider'), daysSlider = document.getElementById('days-slider');
  const tripsVal = document.getElementById('trips-val'), daysVal = document.getElementById('days-val'), totalEarnings = document.getElementById('total-earnings');

  function updateWidget() {
    tripsVal.innerText = tripsSlider.value; daysVal.innerText = daysSlider.value;
    totalEarnings.innerText = 'UGX ' + (tripsSlider.value * daysSlider.value * 5000).toLocaleString();
  }
  tripsSlider.addEventListener('input', updateWidget); daysSlider.addEventListener('input', updateWidget);
 /* ─── DATA SUBMISSION DISPATCH CORE ─── */
  async function handleFormSubmission(event) {
    event.preventDefault(); // Stop the page from reloading instantly

    const terms = document.getElementById('terms');
    // Ensure the user has checked your terms checkbox
    if (terms && !terms.checked) {
      alert('Please agree to the Terms of Service to continue.');
      return;
    }

    // 1. Gather values out of your form input classes
    const applicationData = {
      firstName: document.querySelector('input[placeholder="Your first name"]')?.value || '',
      lastName: document.querySelector('input[placeholder="Your last name"]')?.value || '',
      email: document.querySelector('input[placeholder="you@email.com"]')?.value || '',
      phone: document.querySelector('input[placeholder="+1 (555) 000-0000"]')?.value || '',
      city: document.querySelector('input[placeholder="e.g. Chicago"]')?.value || '',
      // Grabs dropdown selectors based on your .f-input class structure
      vehicleType: document.querySelectorAll('.f-input')[5]?.value || '',
      availability: document.querySelectorAll('.f-input')[6]?.value || '',
      howHeard: document.querySelectorAll('.f-input')[7]?.value || ''
    };

    // Quick structural safety validation
    if (!applicationData.firstName || !applicationData.email || !applicationData.phone) {
      alert('Please fill out all required fields marked with an asterisk (*).');
      return;
    }

    // 2. Adjust button state to handle network processing latency
    const btn = document.getElementById('submitBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Processing...';
    btn.disabled = true;

    try {
      // 3. Dispatch data object to your backend endpoint routing path
      const response = await fetch('https://localhost:8000/api/register/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(applicationData)
      });

      if (response.ok) {
        // Successful response actions
        btn.textContent = '🎉 Application Received!';
        btn.style.background = '#10B981';
        btn.disabled = true;
        
        // Scroll smoothly back up to the form heading section
        const formHead = document.querySelector('.form-head');
        if (formHead) formHead.scrollIntoView({ behavior: 'smooth' });
      } else {
        throw new Error('Server validation or database pipeline error.');
      }
    } catch (error) {
      console.error('API Error:', error);
      alert('Failed to submit application. Please check your network connection and try again.');
      
      // Re-enable interface if processing fails
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }