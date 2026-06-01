// ── In-memory stores (replace with DB queries matching your existing db.js pool) ──
const deckRequests = []  // stores investor deck requests
let nextId = 1

// ── Static data served from API (mirrors the Investors.html content) ──────────

const heroStats = [
  { id: 1, num: '$28M',  label: 'Total raised (Series B)',  delta: '↑ May 2026' },
  { id: 2, num: '3.2×',  label: 'YoY revenue growth',       delta: '↑ FY 2025' },
  { id: 3, num: '500K+', label: 'Active users',              delta: '↑ 86% YoY' },
  { id: 4, num: '3',     label: 'Cities live today',         delta: '↑ 6 by Q4 2026' },
]

const keyMetrics = [
  { id: 1, num: '12.4K',  label: 'Daily active orders',    delta: '+62% MoM' },
  { id: 2, num: '28 min', label: 'Avg. delivery time',     delta: '↓ 4 min YoY' },
  { id: 3, num: '4.8★',   label: 'Customer rating',        delta: '+0.3 YoY' },
  { id: 4, num: '1,800+', label: 'Restaurant partners',    delta: '+94% YoY' },
]

const traction = [
  {
    id: 1,
    icon: '🚀',
    num: '3.2×',
    label: 'Revenue growth YoY',
    desc: "We've tripled revenue two years in a row, with improving unit economics as we scale in each city.",
    badge: '↑ 220% 2-year CAGR',
  },
  {
    id: 2,
    icon: '💰',
    num: '62%',
    label: 'Gross margin (Q1 2026)',
    desc: 'Industry-leading margins driven by our proprietary routing algorithm and dynamic pricing system.',
    badge: '↑ 14pp vs last year',
  },
  {
    id: 3,
    icon: '🔁',
    num: '78%',
    label: '30-day retention',
    desc: 'Best-in-class retention driven by hyper-local relevance and loyalty rewards, not paid promotion.',
    badge: '↑ top decile globally',
  },
]

const currentInvestors = [
  { id: 1, logo: '🌍', name: 'Africa Ventures',  type: 'Lead · Series B' },
  { id: 2, logo: '⚡', name: 'Partech Africa',   type: 'Series A & B' },
  { id: 3, logo: '🔥', name: 'Y Combinator',     type: 'Seed · W23' },
  { id: 4, logo: '💡', name: 'Acumen Capital',   type: 'Series A' },
  { id: 5, logo: '🦁', name: 'Lagos Ventures',   type: 'Seed' },
  { id: 6, logo: '🌱', name: 'Savannah Fund',    type: 'Pre-Seed' },
  { id: 7, logo: '🏦', name: 'IFC Ventures',     type: 'Series B' },
  { id: 8, logo: '🎯', name: 'Consonance',       type: 'Series A' },
]

const milestones = [
  { id: 1, date: 'Q1 2023', title: 'Founded in Kampala',                    desc: 'Launched with 12 restaurant partners and a team of 8, focused on Kampala CBD.' },
  { id: 2, date: 'Q3 2023', title: 'Y Combinator W23',                      desc: 'Selected for YC winter batch. Raised $500K pre-seed, grew to 200 restaurant partners.' },
  { id: 3, date: 'Q2 2024', title: 'Series A — $6M',                        desc: 'Closed $6M Series A led by Partech Africa. Launched in Accra and hit 50K monthly active users.' },
  { id: 4, date: 'Q1 2025', title: 'Launched in Abidjan',                   desc: 'Third city launch. Crossed 200K monthly active users. Rider network hit 1,200.' },
  { id: 5, date: 'Q4 2025', title: '500K downloads & profitability in Kampala', desc: 'Reached 500K total downloads. Kampala became our first city-level profitable market.' },
  { id: 6, date: 'May 2026', title: 'Series B — $28M',                      desc: 'Closed $28M Series B led by Africa Ventures. Targeting 6 cities by Q4 2026.' },
]

const currentRound = {
  type:        'Series B — Strategic',
  size:        '$28,000,000',
  lead:        'Africa Ventures',
  useOfFunds:  'City expansion + engineering',
  targetCities:'Lagos, Nairobi, Dakar',
  dataRoom:    'NDA required',
}

// ── VALID CHEQUE SIZES ─────────────────────────────────────────────────────────
const validChequeSizes = ['Under $500K', '$500K – $2M', '$2M – $5M', '$5M+']

// ── CONTROLLER FUNCTIONS ───────────────────────────────────────────────────────

/**
 * GET /api/investors/stats
 * Returns hero stats + key metrics bar
 */
function getStats(req, res) {
  res.json({ heroStats, keyMetrics })
}

/**
 * GET /api/investors/traction
 * Returns traction cards
 */
function getTraction(req, res) {
  res.json({ traction })
}

/**
 * GET /api/investors/backers
 * Returns current investor cards
 */
function getBackers(req, res) {
  res.json({ investors: currentInvestors })
}

/**
 * GET /api/investors/milestones
 * Returns timeline milestones in chronological order
 */
function getMilestones(req, res) {
  res.json({ milestones })
}

/**
 * GET /api/investors/round
 * Returns current funding round details
 */
function getRound(req, res) {
  res.json({ round: currentRound })
}

/**
 * POST /api/investors/deck-request
 * Submits an investor deck request
 * Body: { name, organisation, email, chequeSize }
 */
function requestDeck(req, res) {
  const { name, organisation, email, chequeSize } = req.body

  // Validation
  if (!name || !organisation || !email || !chequeSize) {
    return res.status(400).json({ error: 'All fields are required.' })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' })
  }

  if (!validChequeSizes.includes(chequeSize)) {
    return res.status(400).json({
      error: 'Invalid cheque size.',
      valid: validChequeSizes,
    })
  }

  // Check for duplicate request (same email)
  const duplicate = deckRequests.find(r => r.email.toLowerCase() === email.toLowerCase())
  if (duplicate) {
    return res.status(409).json({ error: 'A request with this email has already been submitted.' })
  }

  // Store request
  const request = {
    id:           nextId++,
    name:         name.trim(),
    organisation: organisation.trim(),
    email:        email.toLowerCase().trim(),
    chequeSize,
    submittedAt:  new Date().toISOString(),
    status:       'pending',  // pending | sent | rejected
  }
  deckRequests.push(request)

  console.log(`[deck-request] New request from ${request.email} (${request.organisation})`)

  res.status(201).json({
    message: "Request received. We'll be in touch within 48 hours.",
    requestId: request.id,
    email: request.email,
  })
}

/**
 * GET /api/investors/deck-requests
 * Returns all deck requests — admin / dev use only
 * In production: protect this with auth middleware
 */
function listDeckRequests(req, res) {
  res.json({ count: deckRequests.length, requests: deckRequests })
}

/**
 * GET /api/investors
 * Returns full investors page payload in one call
 * Convenience endpoint so the frontend can hydrate in a single request
 */
function getAll(req, res) {
  res.json({
    heroStats,
    keyMetrics,
    traction,
    investors: currentInvestors,
    milestones,
    round: currentRound,
  })
}

module.exports = {
  getStats,
  getTraction,
  getBackers,
  getMilestones,
  getRound,
  requestDeck,
  listDeckRequests,
  getAll,
}