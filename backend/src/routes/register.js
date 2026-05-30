const router = require('express').Router()
const { customerSignUP} = require('../controllers/customer')

router.post('/customer', customerSignUp)

module.exports = router
