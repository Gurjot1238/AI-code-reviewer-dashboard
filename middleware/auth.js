// AUTHENTICATION: checks the JWT sent by the browser, loads the user from MongoDB
// and attaches req.userId and req.user (with role) for the routes after it.
// The role is read from the database on every request, so a role change or a
// deleted account takes effect immediately - not when the 7-day token runs out.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in first.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }

  try {
    const user = await User.findById(payload.id).select('name email role').lean();
    if (!user) return res.status(401).json({ error: 'This account no longer exists.' });
    req.userId = String(user._id);
    req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role || 'user' };
    next();
  } catch (err) {
    res.status(500).json({ error: 'Could not check your login. Try again.' });
  }
};
