
(function () {
    /* ─────────────────────────────────────────────
       SVG ICONS (shared helpers)
    ───────────────────────────────────────────── */
    const ICON_CLOCK    = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="7" cy="7" r="5"/><path d="M7 4.5v2.5l1.5 1.5"/></svg>`;
    const ICON_BAG      = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 8.5h10M4 8.5V5.5a2 2 0 0 1 6 0v3"/></svg>`;
    const ICON_STAR     = `<svg viewBox="0 0 14 14" fill="#F59E0B"><path d="M7 1.5l1.3 3h3l-2.5 2 1 3L7 8 4.2 9.5l1-3L2.7 4.5h3z"/></svg>`;
    const ICON_HEART    = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M7 11.5S2 8 2 5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0c0 3-5 6.5-5 6.5z"/></svg>`;
  
    /* ─────────────────────────────────────────────
       DEFAULT / FALLBACK DATA
       (mirrors what was previously hardcoded in HTML)
    ───────────────────────────────────────────── */
    const DEFAULT_RESTAURANTS = [
      {
        id: 1,
        name: "Burger Shack",
        emoji: "🍔",
        bannerBg: "#FFF0E8",
        image: null,
        rating: 4.8,
        deliveryTime: "20–28 min",
        deliveryFee: "Free delivery",
        minOrder: "Min. $5",
        badge: "-20%",
        tags: ["Burgers", "Fries", "Fast food"],
        href: "menu.html"
      },
      {
        id: 2,
        name: "Napoli Express",
        emoji: "🍕",
        bannerBg: "#EDF7EE",
        image: null,
        rating: 4.6,
        deliveryTime: "25–35 min",
        deliveryFee: "$1.50",
        minOrder: "Min. $8",
        badge: null,
        tags: ["Pizza", "Pasta", "Italian"],
        href: "menu.html"
      },
      {
        id: 3,
        name: "Tokyo Bay",
        emoji: "🍣",
        bannerBg: "#EEF3FF",
        image: null,
        rating: 4.9,
        deliveryTime: "30–45 min",
        deliveryFee: "$2.00",
        minOrder: "Min. $12",
        badge: "Top rated",
        tags: ["Sushi", "Ramen", "Japanese"],
        href: "menu.html"
      },
      {
        id: 4,
        name: "KFC",
        emoji: null,
        bannerBg: "#FFF0E8",
        image: "images/kfc.svg",
        rating: 4.8,
        deliveryTime: "20–28 min",
        deliveryFee: "Free delivery",
        minOrder: "Min. $5",
        badge: "-40%",
        tags: ["Chicken", "Fries", "Fast food"],
        href: "menu.html"
      },
      {
        id: 5,
        name: "Mac",
        emoji: null,
        bannerBg: "#EDF7EE",
        image: "images/mcdonalds.svg",
        rating: 4.6,
        deliveryTime: "25–35 min",
        deliveryFee: "$1.50",
        minOrder: "Min. $8",
        badge: null,
        tags: ["Burgers", "Pasta", "Italian"],
        href: "menu.html"
      },
      {
        id: 6,
        name: "Domino's pizza",
        emoji: null,
        bannerBg: "#EEF3FF",
        image: "images/domino.svg",
        rating: 4.9,
        deliveryTime: "30–45 min",
        deliveryFee: "$2.00",
        minOrder: "Min. $12",
        badge: "Top rated",
        tags: ["Pizza", "Fries", "Buffalo Wings"],
        href: "menu.html"
      }
    ];
  
    /* ─────────────────────────────────────────────
       CARD BUILDER
       Accepts a restaurant object from either the
       API response or the fallback data above.
       Expected API shape:
       {
         id, name, rating, deliveryTime, deliveryFee,
         minOrder, badge, tags, href,
         bannerBg,           // optional hex/CSS colour
         image,              // optional image URL/path
         emoji               // optional emoji string
       }
    ───────────────────────────────────────────── */
    function buildCard(r) {
      const bannerContent = r.image
        ? `<img src="${escHtml(r.image)}" height="100" width="100" alt="${escHtml(r.name)}" loading="lazy" />`
        : (r.emoji || "🍽️");
  
      const badge = r.badge
        ? `<div class="r-disc">${escHtml(r.badge)}</div>`
        : "";
  
      const tags = (r.tags || [])
        .map(t => `<span class="r-tag">${escHtml(t)}</span>`)
        .join("");
  
      return `
        <a href="order.html" class="r-card">
          <div class="r-banner" style="background:${escHtml(r.bannerBg || '#F5F5F5')};">
            ${bannerContent}
            ${badge}
            <div class="r-fav">${ICON_HEART}</div>
          </div>
          <div class="r-body">
            <div class="r-top">
              <div class="r-name">${escHtml(r.name)}</div>
              <div class="r-rating">${ICON_STAR}${escHtml(String(r.rating))}</div>
            </div>
            <div class="r-meta">
              <span class="rmeta">${ICON_CLOCK}${escHtml(r.deliveryTime)}</span>
              <span class="rmeta">${ICON_BAG}${escHtml(r.deliveryFee)}</span>
              <span class="rmeta">${escHtml(r.minOrder)}</span>
            </div>
            <div class="r-tags">${tags}</div>
          </div>
        </a>`;
    }
  
    /* ─────────────────────────────────────────────
       RENDER
    ───────────────────────────────────────────── */
    function renderRestaurants(restaurants, isOffline) {
      const grid     = document.getElementById("restos-grid");
      const skeleton = document.getElementById("restos-skeleton");
  
      if (isOffline) {
        // Insert an offline notice before the grid
        // const banner = document.createElement("div");
        // banner.className = "restos-offline-banner";
        // banner.innerHTML = `⚠️ Couldn't reach the server — showing cached restaurants.`;
        // grid.parentElement.insertBefore(banner, grid);
      }
  
      grid.innerHTML = restaurants.map(buildCard).join("");
      skeleton.style.display = "none";
      grid.style.display = "";
    }
  
    /* ─────────────────────────────────────────────
       FETCH  →  FALLBACK
       Change API_URL to match your backend route.
    ───────────────────────────────────────────── */
    const API_URL     = "db/rest";       // ← your endpoint
    const TIMEOUT_MS  = 10000;            // give up after 10 s
  
    async function loadRestaurants() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
        const res = await fetch(API_URL, {
          method: "GET",
          headers: { "Accept": "application/json" },
          signal: controller.signal
        });
        clearTimeout(timer);
  
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
        const data = await res.json();
  
        // API must return either an array of restaurants directly,
        // or an object with a `restaurants` / `data` key.
        const list = Array.isArray(data)
          ? data
          : (data.restaurants || data.data || []);
  
        if (!list.length) throw new Error("Empty list from API");
  
        renderRestaurants(list, false);
  
      } catch (err) {
        console.warn("[Zesto] API unavailable, using defaults:", err.message);
        renderRestaurants(DEFAULT_RESTAURANTS, true);
      }
    }
  
    /* ─────────────────────────────────────────────
       XSS GUARD
    ───────────────────────────────────────────── */
    function escHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  
    // Kick off on DOM ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadRestaurants);
    } else {
      loadRestaurants();
    }
  })();