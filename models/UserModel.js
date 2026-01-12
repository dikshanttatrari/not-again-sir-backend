const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: true },
    role: { type: String, enum: ["teacher", "admin"], default: "teacher" },
    designation: { type: String, default: "Assistant Professor" },
    isHOD: { type: Boolean, default: false },
    department: { type: String, default: "BCA" },
    status: {
      type: String,
      enum: ["registration-pending", "active", "blocked", "disabled"],
      default: "registration-pending",
    },
    phone: { type: String, default: "" },
    profileImage: { type: String, default: "" },
    bio: { type: String, default: "Dedicated faculty member." },
    pushToken: { type: String },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ status: 1 });

module.exports = mongoose.model("User", UserSchema);
