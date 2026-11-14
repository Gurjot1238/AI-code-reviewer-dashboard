const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }   // bcrypt hash, never the real password
  },
  { timestamps: true }
);

// Never send the password hash to the browser
userSchema.methods.toPublic = function () {
  return { id: this._id, name: this.name, email: this.email, createdAt: this.createdAt };
};

module.exports = mongoose.model('User', userSchema);
