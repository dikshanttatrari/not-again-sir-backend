const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: true,
    },

    role: {
      type: String,
      enum: ["teacher", "admin"],
      default: "teacher",
    },

    designation: {
      type: String,
      default: "Assistant Professor",
      trim: true,
    },
    isHOD: {
      type: Boolean,
      default: false,
    },
    department: {
      type: String,
      default: "BCA",
      trim: true,
    },

    status: {
      type: String,
      enum: ["registration-pending", "active", "blocked", "disabled"],
      default: "registration-pending",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    profileImage: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxlength: [360, "Bio cannot exceed 360 characters"],
      default:
        "Dedicated faculty member passionate about technology and student growth.",
    },

    pushToken: { type: String },
    otp: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
      select: false,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isHOD: -1 });

module.exports = mongoose.model("User", UserSchema);
