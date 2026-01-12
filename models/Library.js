const mongoose = require("mongoose");

const BookSchema = new mongoose.Schema(
  {
    isbn: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    author: { type: String, required: true },
    category: { type: String, default: "General" },
    totalQty: { type: Number, required: true },
    availableQty: { type: Number, required: true },
    coverColor: { type: [String], default: ["#0f766e", "#115e59"] },
  },
  { timestamps: true }
);

const TransactionSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LibraryBook",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: String,
    studentRoll: String,
    bookTitle: String,

    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date },

    status: {
      type: String,
      enum: ["ISSUED", "RETURNED", "OVERDUE"],
      default: "ISSUED",
    },
  },
  { timestamps: true }
);

const LibraryBook = mongoose.model("LibraryBook", BookSchema);
const LibraryTransaction = mongoose.model(
  "LibraryTransaction",
  TransactionSchema
);

module.exports = { LibraryBook, LibraryTransaction };
