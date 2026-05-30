const router = require('express').Router()
const { userSignUP} = require('../controllers/search')

router.post('/search', performSearch)

module.exports = router
