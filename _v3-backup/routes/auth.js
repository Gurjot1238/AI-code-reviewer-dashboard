// Sign up, log in, and "who am I" for the logged-in user.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Enter your name.' });
    if (!EMAIL.test(email || '')) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });

    const passwordHash = await bcrypt.hash(password, 10);   // hash with 10 salt rounds
    const user = await User.create({ name: name.trim(), email, passwordHash });
    res.status(201).json({ token: makeToken(user), user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Could not create the account. Try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    const ok = user && await bcrypt.compare(password || '', user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.json({ token: makeToken(user), user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Could not log in. Try again.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: user.toPublic() });
});

module.exports = router;
