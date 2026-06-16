const { query } = require('../config/db')
const bcrypt = require('bcryptjs')

function signUp(flag) {
  return async (req, res) => {
    let firstName, lastName, email, phone, password, vehicleType, businessName;
    switch (flag) {
      case 'customer':
        ({ firstName, lastName, email, phone, password } = req.body);
        if (!firstName || !lastName || !email || !phone || !password) {
          return res.status(400).json({ error: 'missing fields' });
        }
        break;
      case 'rider':
        ({ firstName, lastName, email, phone, vehicleType, password } = req.body);
        if (!firstName || !lastName || !email || !phone || !vehicleType || !password) {
          return res.status(400).json({ error: 'missing fields' });
        }
        break;
      case 'restaurant':
        ({ firstName, lastName, email, phone, businessName, password } = req.body);
        if (!firstName || !lastName || !email || !phone || !businessName || !password) {
          return res.status(400).json({ error: 'missing fields' });
        }
        break;
      default:
        return res.status(400).json({ error: 'flag not found' });
    }

    try {
      // Basic sanitization: support legacy phoneName 'phoneNumber' too
      if (!phone && req.body.phoneNumber) phone = req.body.phoneNumber;

      // Prevent accidental saving of email into phone
      if (typeof phone === 'string' && phone.includes('@')) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const name = `${String(firstName).trim()} ${String(lastName).trim()}`;
      const role = flag === 'customer' ? 'customer' : (flag === 'rider' ? 'rider' : (flag === 'restaurant' ? 'restaurant_admin' : 'customer'));

      // Insert into users with correct columns (matches schema)
      await query(
        'INSERT INTO users (name, email, phone, password, role) VALUES (?,?,?,?,?)',
        [name, email, phone, hashedPassword, role]
      );

      return res.status(201).json({ msg: 'account registered' });
    } catch (error) {
      if (error && error.errno === 1062) {
        return res.status(409).json({ error: 'User already exists' });
      }
      console.error('signUp error', error);
      return res.status(500).json({ error: 'server error' });
    }
  };
}

module.exports = { signUp }
