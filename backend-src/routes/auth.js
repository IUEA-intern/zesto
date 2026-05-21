// routes/auth.js
const express     = require('express');
const { auth }    = require('../middleware/auth');
const authService = require('../services/authService');
const userRepo    = require('../repos/userRepo');
const router      = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/logout', auth, async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
});

router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await userRepo.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/me', auth, async (req, res, next) => {
  try {
    const { name, phone, delivery_address } = req.body;
    await userRepo.update(req.user.id, { name, phone, delivery_address });
    res.json({ message: 'Profile updated' });
  } catch (err) { next(err); }
});

module.exports = router;
