const router = require('express').Router()
const { signUp} = require('../controllers/signUp')

router.post('/customer', signUp('customer'))
router.post('/rider', signUp('rider'))
router.post('/restaurant', signUp('restaurant'))


module.exports = router
