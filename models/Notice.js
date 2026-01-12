const mongoose = require("mongoose");

const NoticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Please add a title"],
    trim: true,
    maxlength: [50, "Title cannot be more than 50 characters"],
  },
  description: {
    type: String,
    required: [true, "Please add a description"],
    maxlength: [500, "Description limited to 500 chars"],
  },
  category: {
    type: String,
    enum: ["Academic", "Career", "Events", "Sports", "General", "Exam"],
    default: "General",
  },
  target: {
    type: String,
    enum: ["All", "1", "2", "3", "4", "5", "6", "7", "8"],
    default: "All",
  },
  author: {
    name: { type: String, required: true },
    role: { type: String, default: "Faculty" },
    id: { type: mongoose.Schema.ObjectId, ref: "User", required: true },
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  isUrgent: {
    type: Boolean,
    default: false,
  },
  attachmentUrl: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800,
  },
});

NoticeSchema.index({ target: 1 });

module.exports = mongoose.model("Notice", NoticeSchema);
