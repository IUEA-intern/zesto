const router = require('express').Router()
const {
  getAll,
  getStats,
  getTraction,
  getBackers,
  getMilestones,
  getRound,
  requestDeck,
  listDeckRequests,
} = require('../controllers/investors')

// ── Full page payload (single request) ────────────────────────────────────────
router.get('/', getAll)

// ── Granular endpoints ─────────────────────────────────────────────────────────
router.get('/stats',      getStats)       // hero stats + metrics bar
router.get('/traction',   getTraction)    // traction cards
router.get('/backers',    getBackers)     // current investor cards
router.get('/milestones', getMilestones)  // timeline milestones
router.get('/round',      getRound)       // current funding round details

// ── Deck request form ──────────────────────────────────────────────────────────
router.post('/deck-request', requestDeck)

// ── Dev / admin ────────────────────────────────────────────────────────────────
router.get('/deck-requests', listDeckRequests)  // list all requests (protect in prod)

module.exports = router