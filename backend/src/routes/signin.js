// routes/signin.js
const router = require('express').Router()
const { customerSignIn } = require('../controllers/signin')

// POST /api/signin/customer
router.post('/customer', customerSignIn)

module.exports = router