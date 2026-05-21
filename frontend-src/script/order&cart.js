const DELIVERY_FEE = 5000;
const STORAGE_KEY = 'zestoCart';

const MENU_ITEMS = [
  {
    id: 'burger1',
    name: 'Double Smash Burger',
    price: 28000,
    category: 'food',
    type: 'Burger',
    description: 'Two juicy beef patties layered with cheddar cheese, pickles, lettuce, onions and signature shack sauce. Served with crispy fries.',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'wrap1',
    name: 'Crispy Chicken Wrap',
    price: 24000,
    category: 'food',
    type: 'Wrap',
    description: 'Golden crispy chicken strips wrapped with fresh lettuce, cheese and creamy ranch sauce in a toasted tortilla.',
    image: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'drink1',
    name: 'Vanilla Milkshake',
    price: 12000,
    category: 'drinks',
    type: 'Milkshake',
    description: 'Rich creamy vanilla milkshake blended fresh and topped with whipped cream for the perfect sweet finish.',
    image: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'drink2',
    name: 'Coca-Cola',
    price: 5000,
    category: 'drinks',
    type: 'Soft Drink',
    description: 'Refreshing ice-cold Coca-Cola served chilled to pair perfectly with burgers, fries and wings.',
    image: 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'dessert1',
    name: 'Chocolate Sundae',
    price: 14000,
    category: 'desserts',
    type: 'Ice Cream',
    description: 'Creamy chocolate ice cream topped with rich syrup, cookie crumbs and whipped cream.',
    image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'dessert2',
    name: 'Red Velvet Cake',
    price: 16000,
    category: 'desserts',
    type: 'Cake',
    description: 'Soft layered red velvet cake with smooth cream cheese frosting and chocolate drizzle.',
    image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'other1',
    name: 'Garlic Mayo Dip',
    price: 3000,
    category: 'other',
    type: 'Sauce',
    description: 'Creamy signature garlic mayo dip made fresh daily to pair with fries, wings and wraps.',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=1200&auto=format&fit=crop'
  },
  {
    id: 'other2',
    name: 'Extra Cheese',
    price: 4000,
    category: 'other',
    type: 'Add-on',
    description: 'Melted cheddar cheese topping added to burgers, fries or wraps for extra flavor.',
    image: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?q=80&w=1200&auto=format&fit=crop'
  }
];

function getCart() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveCart(cart) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function formatPrice(value) {
  return `UGX ${value.toLocaleString()}`;
}

function updateCartCount() {
  const navCount = document.getElementById('navCartCount');
  const cart = getCart();
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  if (navCount) {
    navCount.textContent = itemCount;
  }
}

function updateNavActive(page) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
}

function addItemToCart(itemId) {
  const item = MENU_ITEMS.find(menu => menu.id === itemId);
  if (!item) return;

  const cart = getCart();
  const existing = cart.find(entry => entry.id === itemId);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...item, qty: 1 });
  }

  saveCart(cart);
  updateCartCount();
}

function renderMenuItems(category) {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  const items = MENU_ITEMS.filter(item => item.category === category);
  grid.innerHTML = items.map(item => `
    <article class="menu-card">
      <div class="menu-image">
        <img src="${item.image}" alt="${item.name}">
      </div>
      <div class="menu-content">
        <div class="menu-item-category">${item.type}</div>
        <div class="menu-item-name">${item.name}</div>
        <div class="menu-item-desc">${item.description}</div>
        <div class="menu-item-bottom">
          <div class="menu-price">${formatPrice(item.price)}</div>
          <button class="add-btn" data-action="add" data-id="${item.id}">Add to Cart</button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderCartPage() {
  const cartContent = document.getElementById('cartContent');
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  const checkoutBtn = document.getElementById('checkoutBtn');

  if (!cartContent || !subtotalEl || !totalEl || !checkoutBtn) return;

  const cart = getCart();

  if (cart.length === 0) {
    cartContent.innerHTML = '<div class="empty-cart">Your cart is empty.<br><br><a href="order.html" style="color:#FF5500; text-decoration:none; font-weight:700;">Continue Shopping →</a></div>';
  } else {
    cartContent.innerHTML = `
      <div class="cart-items">
        ${cart.map(item => `
          <div class="cart-item">
            <div class="cart-item-top">
              <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatPrice(item.price)}</div>
              </div>
              <button class="remove-btn" data-action="remove" data-id="${item.id}">Remove</button>
            </div>
            <div class="cart-item-bottom">
              <div class="qty-controls">
                <button class="qty-btn" data-action="decrease" data-id="${item.id}">−</button>
                <div class="qty-num">${item.qty}</div>
                <button class="qty-btn" data-action="increase" data-id="${item.id}">+</button>
              </div>
              <div class="line-total">${formatPrice(item.qty * item.price)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = subtotal + DELIVERY_FEE;

  subtotalEl.textContent = formatPrice(subtotal);
  totalEl.textContent = formatPrice(total);
  checkoutBtn.disabled = cart.length === 0;
}

function changeQuantity(itemId, delta) {
  const cart = getCart();
  const item = cart.find(entry => entry.id === itemId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    const index = cart.findIndex(entry => entry.id === itemId);
    cart.splice(index, 1);
  }

  saveCart(cart);
  renderCartPage();
  updateCartCount();
}

function removeItem(itemId) {
  const cart = getCart().filter(item => item.id !== itemId);
  saveCart(cart);
  renderCartPage();
  updateCartCount();
}

function handleGlobalActions(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const itemId = target.dataset.id;

  if (action === 'add') {
    addItemToCart(itemId);
  }

  if (action === 'increase') {
    changeQuantity(itemId, 1);
  }

  if (action === 'decrease') {
    changeQuantity(itemId, -1);
  }

  if (action === 'remove') {
    removeItem(itemId);
  }
}

function initPage(page) {
  updateNavActive(page);
  updateCartCount();

  if (page === 'food' || page === 'drinks' || page === 'desserts' || page === 'other') {
    renderMenuItems(page);
  }
}

function getPageFromBody() {
  return document.body.dataset.page || 'food';
}

document.addEventListener('DOMContentLoaded', () => {
  const page = getPageFromBody();
  initPage(page);
  document.body.addEventListener('click', handleGlobalActions);

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      const cart = getCart();
      if (cart.length === 0) return;
      alert('Order placed successfully! 🎉');
      saveCart([]);
      renderCartPage();
      updateCartCount();
    });
  }
});

 // Handle tab highlighting on click
 document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.menu-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabSection = tab.getAttribute('href').substring(1);
      
      // Remove active class from all tabs
      document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Scroll to section
      const section = document.getElementById(tabSection);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  renderCartPage();
  updateCartCount();
  document.body.addEventListener('click', handleGlobalActions);

  // Handle tab clicks
  document.querySelectorAll('.menu-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      const cart = getCart();
      if (cart.length === 0) return;
      alert('Order placed successfully! 🎉');
      saveCart([]);
      renderCartPage();
      updateCartCount();
    });
  }
});