const db = require('../../db')
const bcrypt = require('bcrypt')

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
	  const connection = await db.getConnection()
    const hashedPassword = await bcrypt.hash(password, "salt")

		if (isCustomer) {
			await connection.query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , password) VALUES (?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , hashedPassword] )
		} else if (isRider) {
			await connection.query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , vehicleType , password) VALUES (?,?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , vehicleType , hashedPassword] )
		} else if (isRestaurant) {
				await connection.query(
				'INSERT INTO users(firstName , lastName , email , phoneNumber , businessName , password) VALUES (?,?,?,?,?,?)',
				[firstName , lastName , email , phoneNumber , businessName , hashedPassword] )
		}

		connection.release()
		return res.status(201).json({msg: "account regsiterd"})

	} catch(error) {
		connection.release()
		if (error.errno === 1062) {
			return res.status(409).json({error:'User already exits'})
		}
		return res.status(500).json({error:'server error'})
		}
    }
}


module.exports = { signUp }
