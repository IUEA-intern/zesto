const router = require('express').Router()
const { performSearch } = require('../controllers/search')

router.post('/search', async (req, res) => {
  try {
    const results = await performSearch(req.body || {})
    return res.json({ success: true, data: results })
  } catch (_err) {
    return res.status(500).json({ success: false, message: 'Search failed' })
  }
})

module.exports = router
