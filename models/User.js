const mongoose = require('mongoose');

// Roles (authorization):
//   user     - can review code and see only their own work
//   reviewer - everything a user can do + read everyone's reviews and scans
//   admin    - everything a reviewer can do + manage users and roles
const ROLES = ['user', 'reviewer', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },   // bcrypt hash, never the real password
    role: { type: String, enum: ROLES, default: 'user', index: true }
  },
  { timestamps: true }
);

// Never send the password hash to the browser
userSchema.methods.toPublic = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role || 'user', createdAt: this.createdAt };
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
