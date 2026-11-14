// AUTHORIZATION: allows a route only for the listed roles.
// Use after requireAuth, e.g.  router.get('/users', authorize('admin'), handler)
module.exports = function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this.' });
    }
    next();
  };
};

// True for roles that can read other people's reviews and scans
module.exports.canSeeAll = user => !!user && ['reviewer', 'admin'].includes(user.role);
