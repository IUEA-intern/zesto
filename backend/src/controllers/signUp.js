const { query } = require('../config/db')
const bcrypt = require('bcryptjs')

function signUp(flag) {
	return async (req,res) =>  {
	let isCustomer = false, isRider = false , isRestaurant = false
	let firstName , lastName , email , phoneNumber , password , vehicleType, businessName
	switch (flag) {
		case"customer":
			({firstName , lastName , email , phoneNumber , password } = req.body)
			isCustomer = true
			if (!firstName || !lastName ||  !email ||  !phoneNumber || !password) {
				return res.status(400).json({error : 'missing fields'})
			}
			break;
		case"rider":
			({firstName , lastName , email , phoneNumber , vehicleType , password} = req.body)
			isRider = true
		 	if (!firstName || !lastName ||  !email ||  !phoneNumber || !vehicleType || !password) {
				return res.status(400).json({error : 'missing fields'})
		 	}
		 	break;
		case"restaurant":
		 	({firstName , lastName , email , phoneNumber , businessName , password} = req.body)
			isRestaurant = true
		 	if (!firstName || !lastName ||  !email ||  !phoneNumber || !businessName || !password) {
				return res.status(400).json({error : 'missing fields'})
		 	}
		 	break;
		default:
			return res.status(400).json({error: "flag not found"})
			break;
		}



	try {
    const hashedPassword = await bcrypt.hash(password, 10)

		if (isCustomer) {
			await query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , password) VALUES (?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , hashedPassword] )
		} else if (isRider) {
			await query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , vehicleType , password) VALUES (?,?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , vehicleType , hashedPassword] )
		} else if (isRestaurant) {
				await query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , businessName , password) VALUES (?,?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , businessName , hashedPassword] )
		}

		return res.status(201).json({msg: "account regsiterd"})

	} catch(error) {
		if (error.errno === 1062) {
			return res.status(409).json({error:'User already exits'})
		}
		return res.status(500).json({error:'server error'})
		}
    }
}


module.exports = { signUp }
