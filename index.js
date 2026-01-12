const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("./models/UserModel");
const TimeTable = require("./models/TimeTable");
require("dotenv").config();
const { google } = require("googleapis");
const Notice = require("./models/Notice");
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const multer = require("multer");
const xlsx = require("xlsx");
const Student = require("./models/Student");
const Batch = require("./models/Batch");
const Attendance = require("./models/Attendance");
const Holiday = require("./models/Holiday");
const sendPushNotification = require("./utils/sendNotification");
const { LibraryBook, LibraryTransaction } = require("./models/Library");
const Exam = require("./models/Exam");
const upload = multer({ storage: multer.memoryStorage() });

const KEYFILEPATH = "./service-account-key.json.json";
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: SCOPES,
});

const app = express();
const port = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

mongoose
  .connect(process.env.MONGO_DB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

app.get("/api/health", (req, res) => {
  res.send("Hello from NotAgainSir API");
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sendOTPEmail = async (email, name, otp) => {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #4f46e5; margin: 0;">NotAgainSir</h1>
        <p style="color: #6b7280; font-size: 14px;">The Official Campus App</p>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; text-align: center;">
        <p style="color: #374151; font-size: 16px; margin-bottom: 10px;">Hello, <strong>${name}</strong>!</p>
        <p style="color: #6b7280; margin-bottom: 20px;">Use the code below to verify your account. This code expires in 10 minutes.</p>
        <div style="background-color: #ffffff; border: 1px solid #d1d5db; padding: 15px; border-radius: 6px; display: inline-block;">
          <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #111827;">${otp}</span>
        </div>
      </div>
      <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: '"NotAgainSir Admin" <no-reply@notagainsir.com>',
    to: email,
    subject: "🔐 Verify your account",
    html: htmlContent,
  });
};

const TEACHER_SECRET = process.env.TEACHER_SECRET;

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, currentSemester, phone, bio, isHOD } =
      req.body;

    // 1. Validation
    if (!name || !email || !password || !currentSemester) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing. Please check your inputs.",
      });
    }

    // 2. Secret Key Check
    if (String(currentSemester).trim() !== TEACHER_SECRET) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Invalid Staff Secret Key.",
      });
    }

    const emailLower = String(email).trim().toLowerCase();

    let user = await UserModel.findOne({ email: emailLower });

    if (user) {
      if (user.status === "active" || user.status === "blocked") {
        return res.status(409).json({
          success: false,
          message: "Email already registered. Please login.",
        });
      }
    }

    // 4. Setup User Data
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const role = "teacher";
    const finalSemester = 0;
    const designation = req.body.designation || "Assistant Professor";

    if (!user) {
      user = new UserModel({
        name,
        email: emailLower,
        password: hashedPassword,
        role,
        currentSemester: finalSemester,
        phone: phone || "",
        bio: bio || "Faculty Member",
        isHOD: isHOD || false, // 🟢 Save HOD status
        designation: designation, // 🟢 Save designation
        department: "BCA", // Defaulting to CS for now
        otp,
        otpExpires,
        status: "registration-pending",
      });
    } else {
      user.name = name;
      user.password = hashedPassword;
      user.role = role;
      user.phone = phone || "";
      user.bio = bio || "Faculty Member";
      user.isHOD = isHOD || false; // 🟢 Update HOD
      user.designation = designation; // 🟢 Update Designation
      user.currentSemester = finalSemester;
      user.otp = otp;
      user.otpExpires = otpExpires;
    }

    await user.save();

    await sendOTPEmail(emailLower, name, otp).catch((err) =>
      console.error("Email Error:", err)
    );

    res.status(201).json({
      success: true,
      message: "Faculty verification initiated. OTP sent.",
      role: role,
    });
  } catch (err) {
    console.error("Register Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + err.message });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await UserModel.findOne({ email }).select("+otp +otpExpires");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.status === "active") {
      return res.status(400).json({
        success: false,
        message: "Account already active. Please login.",
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    user.status = "active";
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = jwt.sign(
      { sub: user._id },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Account verified successfully!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        currentSemester: user.currentSemester,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/auth/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ email });

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (user.status === "active")
      return res
        .status(400)
        .json({ success: false, message: "Account already active" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendOTPEmail(email, user.name, otp);

    res.json({ success: true, message: "New OTP sent" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide credentials." });
    }

    let user = null;
    let role = "student";

    user = await UserModel.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (user) {
      role = user.role || "teacher";
    }

    if (!user) {
      user = await Student.findOne({
        $or: [
          { email: identifier },
          {
            universityRollNo: identifier,
          },
          { enrollmentId: identifier },
          { mobile: identifier },
        ],
      });
    }

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found." });
    }

    let isMatch = false;

    if (user.password.startsWith("$")) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
    }

    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { id: user._id, role: role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: role,
        classRollNo: user.classRollNo,
        enrollmentId: user.enrollmentId,
        semester: user.semester,
        universityRollNo: user.universityRollNo,
        profileImage: user.profileImage,
        batch: user.batch,
        mobile: user.mobile,
        dob: user.dob,
        pushToken: user.pushToken,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];

    const secret = process.env.JWT
      ? process.env.JWT_SECRET
      : "replace_me_in_prod";
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await UserModel.findById(payload.sub).lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      currentSemester: user.currentSemester,
      status: user.status,
      avatarUrl: user.avatarUrl || "",
      settings: user.settings || {},
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    return res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error("Get me error:", err);
    return res

      .status(500)
      .json({ success: false, message: "internal_server_error" });
  }
});

app.put("/api/auth/update", async (req, res) => {
  try {
    const { userId, role, name, profileImage } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (profileImage) updates.profileImage = profileImage;

    let updatedUser;
    const Model = role === "teacher" ? UserModel : Student;

    updatedUser = await Model.findByIdAndUpdate(userId, updates, {
      new: true,
    }).select("-password");

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

app.post("/api/time-table", async (req, res) => {
  try {
    const {
      semester,
      day,
      startTime,
      endTime,
      subject,
      professor,
      room,
      batch,
    } = req.body;

    const newClass = new TimeTable({
      semester,
      day,
      startTime,
      endTime,
      subject,
      professor,
      room,
      batch,
    });

    const savedClass = await newClass.save();
    res.json(savedClass);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.get("/api/time-table", async (req, res) => {
  try {
    const { semester, date } = req.query;

    if (date) {
      const isHoliday = await Holiday.findOne({ date });
      if (isHoliday) {
        return res.json({
          success: true,
          isHoliday: true,
          reason: isHoliday.reason,
          data: [],
        });
      }
    }

    const schedule = await TimeTable.find({ semester }).populate(
      "professor",
      "name department profileImage"
    );

    res.json({
      success: true,
      isHoliday: false,
      data: schedule,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.put("/api/time-table/:id", async (req, res) => {
  try {
    const { semester, day, startTime, endTime, subject, professor, room } =
      req.body;

    const updatedClass = await TimeTable.findByIdAndUpdate(
      req.params.id,
      { semester, day, startTime, endTime, subject, professor, room },
      { new: true }
    );

    if (!updatedClass) {
      return res.status(404).json({ msg: "Class not found" });
    }

    res.json(updatedClass);
  } catch (err) {
    console.error(err.message);
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Class not found" });
    }
    res.status(500).send("Server Error");
  }
});

app.delete("/api/time-table/:id", async (req, res) => {
  try {
    const classToDelete = await TimeTable.findByIdAndDelete(req.params.id);

    if (!classToDelete) {
      return res.status(404).json({ msg: "Class not found" });
    }

    res.json({ msg: "Class removed" });
  } catch (err) {
    console.error(err.message);
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Class not found" });
    }
    res.status(500).send("Server Error");
  }
});

app.get("/api/drive/:folderId", async (req, res) => {
  try {
    const folderId = req.params.folderId;
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`, // Magic Query
      fields: "files(id, name, mimeType, size, webViewLink, iconLink)",
      orderBy: "folder, name", // Folders first, then files
    });

    // Simplify the data for your App
    const simplifiedFiles = response.data.files.map((file) => ({
      id: file.id,
      name: file.name,
      // Check if it's a folder or file
      type:
        file.mimeType === "application/vnd.google-apps.folder"
          ? "folder"
          : "file",
      // Auto-detect extension for icon
      fileType: file.name.split(".").pop().toLowerCase(),
      link: file.webViewLink,
      size: file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "",
    }));

    res.json(simplifiedFiles);
  } catch (error) {
    console.error(error);
    res.status(500).send("Drive API Error");
  }
});

app.get("/api/notices/feed", async (req, res) => {
  try {
    const studentSem = req.query.sem || "All";

    const notices = await Notice.find({
      target: { $in: ["All", studentSem] },
    }).sort({
      isPinned: -1,
      createdAt: -1,
    });

    res.json({ success: true, count: notices.length, data: notices });
  } catch (err) {
    console.error("Feed Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/notices", async (req, res) => {
  try {
    if (req.body.user.role !== "teacher" && req.body.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Only teachers can post notices." });
    }

    const {
      title,
      description,
      category,
      target,
      isPinned,
      isUrgent,
      authorName,
      user,
    } = req.body;

    const newNotice = new Notice({
      title,
      description,
      category,
      target,
      isPinned,
      isUrgent,
      author: {
        name: authorName || user.name,
        id: user.id,
        role: user.role,
      },
    });

    let studentFilter = { pushToken: { $exists: true } };

    if (target && target !== "All") {
      studentFilter.semester = target;
    }

    const students = await Student.find(studentFilter);

    const tokens = students
      .map((s) => s.pushToken)
      .filter((token) => token && token.trim() !== "");

    if (tokens.length > 0) {
      const body = `Check out the new notice by ${
        authorName || user.name
      }: ${title}`;

      await sendPushNotification(tokens, "New Notice Posted", body, {
        screen: "Notices",
      });
    }

    const savedNotice = await newNotice.save();
    res.status(201).json({ success: true, data: savedNotice });
  } catch (err) {
    console.error("Create Notice Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/notices/manage", async (req, res) => {
  try {
    const myNotices = await Notice.find({ "author.id": req.user.id }).sort({
      createdAt: -1,
    });

    res.json({ success: true, count: myNotices.length, data: myNotices });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.put("/api/notices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      target,
      isPinned,
      isUrgent,
      authorName,
      user,
    } = req.body;

    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res
        .status(403)
        .json({ success: false, message: "Permission denied. Teachers only." });
    }

    const updatedNotice = await Notice.findByIdAndUpdate(
      id,
      {
        title,
        description,
        category,
        target,
        isPinned,
        isUrgent,
        "author.name": authorName,
      },
      { new: true, runValidators: true }
    );

    if (!updatedNotice) {
      return res
        .status(404)
        .json({ success: false, message: "Notice not found" });
    }

    res.json({ success: true, data: updatedNotice });
  } catch (err) {
    console.error("Update Notice Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.delete("/api/notices/:id", async (req, res) => {
  try {
    const { user } = req.body;

    const notice = await Notice.findById(req.params.id);

    if (!notice)
      return res
        .status(404)
        .json({ success: false, message: "Notice not found" });

    const isAuthor = notice.author.id.toString() === user.id.toString();
    const isAdmin = user.role === "admin" || user.role === "teacher";

    if (!isAuthor || !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this notice",
      });
    }

    await Notice.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Notice deleted" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":");
  if (hours === "12") hours = "00";
  if (modifier === "PM") hours = parseInt(hours, 10) + 12;
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
};

app.get("/api/dashboard/student", async (req, res) => {
  try {
    const { semester } = req.query;

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const currentDay = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todaysClasses = await TimeTable.find({ semester, day: currentDay });
    todaysClasses.sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime)
    );

    let nextClass = null;
    for (const cls of todaysClasses) {
      if (parseTime(cls.endTime) > currentMinutes) {
        nextClass = cls;
        break;
      }
    }

    if (nextClass) {
      const startMinutes = parseTime(nextClass.startTime);
      const endMinutes = parseTime(nextClass.endTime);
      const isHappeningNow = startMinutes <= currentMinutes;

      let progress = 0;
      if (isHappeningNow) {
        const totalDuration = endMinutes - startMinutes;
        const elapsed = currentMinutes - startMinutes;
        progress = elapsed / totalDuration;
      }

      res.json({
        nextClass: {
          subject: nextClass.subject,
          code: "SEM-" + nextClass.semester,
          time: `${nextClass.startTime} - ${nextClass.endTime}`,
          location: `Room ${nextClass.room}`,
          professor: nextClass.professor,

          statusText: isHappeningNow ? "Live Now" : "Up Next",
          subText: isHappeningNow
            ? "Class is in session"
            : `Starts at ${nextClass.startTime}`,

          progress: progress,
        },
        stats: studentStats,
      });
    } else {
      res.json({
        nextClass: null,
        message: "You are free.",
        subText: "No more classes for today.",
        stats: studentStats,
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Server died. Just like your grades." });
  }
});

app.get("/api/dashboard/teacher", async (req, res) => {
  try {
    const { teacherId } = req.query;

    if (!teacherId) {
      return res.status(400).json({ error: "Teacher ID is required" });
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const currentDayIndex = now.getDay();
    const currentDay = days[currentDayIndex];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todaysClasses = await TimeTable.find({
      professor: teacherId,
      day: currentDay,
    });

    todaysClasses.sort(
      (a, b) => parseTime(a.startTime) - parseTime(b.startTime)
    );

    let nextSession = null;
    let isHappeningNow = false;
    let isTomorrow = false;

    for (const cls of todaysClasses) {
      if (parseTime(cls.endTime) > currentMinutes) {
        nextSession = cls;
        break;
      }
    }
    if (!nextSession) {
      const nextDayIndex = (currentDayIndex + 1) % 7;
      const nextDay = days[nextDayIndex];

      const tomorrowClasses = await TimeTable.find({
        professor: teacherId,
        day: nextDay,
      });

      tomorrowClasses.sort(
        (a, b) => parseTime(a.startTime) - parseTime(b.startTime)
      );

      if (tomorrowClasses.length > 0) {
        nextSession = tomorrowClasses[0];
        isTomorrow = true;
      }
    }

    if (nextSession) {
      const startMinutes = parseTime(nextSession.startTime);
      const endMinutes = parseTime(nextSession.endTime);

      if (!isTomorrow) {
        isHappeningNow = startMinutes <= currentMinutes;
      }

      let progress = 0;
      if (isHappeningNow) {
        const totalDuration = endMinutes - startMinutes;
        const elapsed = currentMinutes - startMinutes;
        progress = elapsed / totalDuration;
      }

      res.json({
        nextSession: {
          subject: nextSession.subject,
          class: `Semester ${nextSession.semester}`,
          time: `${nextSession.startTime} - ${nextSession.endTime}`,
          venue: `Room ${nextSession.room}`,
          task: "Lecture Delivery",

          statusText: isHappeningNow
            ? "Session in Progress"
            : isTomorrow
            ? "Tomorrow's First Class"
            : "Upcoming Session",

          subText: isHappeningNow
            ? "Lecture is live"
            : isTomorrow
            ? `Scheduled for ${days[(currentDayIndex + 1) % 7]}`
            : `Starts at ${nextSession.startTime}`,

          progress: progress,
        },
      });
    } else {
      res.json({
        nextSession: null,
        message: "No upcoming sessions.",
        subText: "No classes scheduled for today or tomorrow.",
        // stats: teacherStats, // Ensure this variable exists in your scope or remove it
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const generatePassword = (name, dob) => {
  const safeName = String(name || "").trim();
  const safeDob = String(dob || "").trim();

  const namePart =
    safeName.length >= 3 ? safeName.substring(0, 3) : safeName.padEnd(3, "X");

  const dobPart = safeDob.length >= 2 ? safeDob.substring(0, 2) : "01";

  return `${namePart}@${dobPart}`;
};

const parseExcelDate = (dateVal) => {
  if (!dateVal) return "01-01-2000";

  if (typeof dateVal === "number") {
    const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }

  if (typeof dateVal === "string") {
    if (dateVal.includes("-") && dateVal.split("-")[0].length === 4) {
      const parts = dateVal.split("-");
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateVal;
  }

  return String(dateVal);
};

app.post("/api/students/upload", upload.single("file"), async (req, res) => {
  console.log("File Upload Request Received");
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let count = 0;
    const selectedBatch = req.body.batch;

    for (const row of sheet) {
      if (row.EnrollmentID && row.Name) {
        // 1. Get clean DOB (e.g., "15-08-2005")
        const cleanDOB = parseExcelDate(row.DOB);

        // 🟢 FIX: Call the generator function correctly
        const plainPassword = generatePassword(row.Name, cleanDOB);

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);

        // 4. Update Database
        await Student.findOneAndUpdate(
          { enrollmentId: row.EnrollmentID },
          {
            name: row.Name,
            universityRollNo: row.UniRollNo,
            classRollNo: row.ClassRollNo || row.SNo || "",
            batch: selectedBatch || row.Batch || "General",
            semester: row.Sem || "1",
            mobile: row.Mobile || "",
            email: row.Email || "",
            dob: cleanDOB,
            password: hashedPassword,
          },
          { upsert: true, new: true }
        );
        count++;
      }
    }

    res.json({
      success: true,
      message: `Successfully processed ${count} students.`,
    });
  } catch (err) {
    console.error("Upload Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Upload failed: " + err.message });
  }
});

// 2. MANUAL ADD STUDENT
app.post("/api/students", async (req, res) => {
  try {
    const {
      name,
      enrollmentId,
      universityRollNo,
      classRollNo,
      batch,
      semester,
      mobile,
      email,
      dob,
    } = req.body;

    // Validation
    if (!name || !enrollmentId || !universityRollNo || !batch || !dob) {
      return res.status(400).json({
        success: false,
        message:
          "Missing: Name, Enrollment ID, University Roll No, Batch, or DOB",
      });
    }

    const existingStudent = await Student.findOne({
      $or: [{ enrollmentId }, { universityRollNo }],
    });

    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message:
          "Student with this Enrollment ID or University Roll No already exists.",
      });
    }

    // Password Generation
    const plainPassword = generatePassword(name, dob);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const newStudent = new Student({
      name,
      enrollmentId,
      universityRollNo,
      classRollNo: classRollNo || "",
      batch,
      semester,
      mobile: mobile || "",
      email: email || "",
      dob,
      password: hashedPassword,
    });

    await newStudent.save();

    res.json({
      success: true,
      message: "Student added successfully",
      data: { name: newStudent.name, password: plainPassword },
    });
  } catch (err) {
    console.error("Add Student Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 3. GET STUDENTS (Fetch by Batch)
app.get("/api/students", async (req, res) => {
  try {
    const { batch } = req.query;

    // Construct Query
    let query = {};

    // If a batch is provided in the URL (?batch=BCA...), filter by it.
    // Otherwise, return all students (or handle as error if preferred).
    if (batch) {
      query.batch = batch;
    }

    // 1. Find students matching the batch
    // 2. Sort them alphabetically by Name (.sort({ name: 1 }))
    // 3. EXCLUDE the password field for security (.select("-password"))
    const students = await Student.find(query)
      .sort({ name: 1 })
      .select("-password");

    res.json({ success: true, data: students });
  } catch (err) {
    console.error("Fetch Students Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server Error: Could not fetch list" });
  }
});

// 4. DELETE STUDENT (Since your frontend has a delete button)
app.delete("/api/students/:id", async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    res.json({ success: true, message: "Student deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/batches", async (req, res) => {
  try {
    const batches = await Batch.find().sort({ name: -1 });
    res.json({ success: true, data: batches });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Could not fetch batches" });
  }
});

// 2. CREATE NEW BATCH
app.post("/api/batches", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name)
      return res
        .status(400)
        .json({ success: false, message: "Batch Name Required" });

    // Check Duplicate
    const exists = await Batch.findOne({ name });
    if (exists)
      return res
        .status(400)
        .json({ success: false, message: "Batch already exists" });

    const newBatch = new Batch({ name });
    await newBatch.save();

    res.json({ success: true, message: "Batch created", data: newBatch });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not create batch" });
  }
});

// 3. DELETE BATCH (Optional but recommended)
app.delete("/api/batches/:id", async (req, res) => {
  try {
    await Batch.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Batch deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
});

// 1. GET ATTENDANCE (With Subject)
app.get("/api/attendance", async (req, res) => {
  try {
    const { batch, date, subject } = req.query;

    const existingRecord = await Attendance.findOne({
      batch,
      date,
      subject,
    }).populate("records.student", "name rollNumber classRollNo");

    if (existingRecord) {
      const formattedData = existingRecord.records
        .map((r) => {
          if (!r.student) return null;
          return {
            studentId: r.student._id,
            name: r.student.name,
            rollNumber: r.student.classRollNo || r.student.rollNumber,
            status: r.isPresent ? "Present" : "Absent",
          };
        })
        .filter((i) => i !== null);

      return res.json({ success: true, data: formattedData });
    }

    const students = await Student.find({ batch }).select(
      "name classRollNo rollNumber"
    );

    const freshList = students.map((s) => ({
      studentId: s._id,
      name: s.name,
      rollNumber: s.classRollNo || s.rollNumber,
      status: "Absent",
    }));

    freshList.sort((a, b) => parseInt(a.rollNumber) - parseInt(b.rollNumber));

    res.json({ success: true, data: freshList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/attendance", async (req, res) => {
  try {
    const { batch, date, subject, records, teacherId } = req.body;

    const optimizedRecords = records.map((r) => ({
      student: new mongoose.Types.ObjectId(r.student),
      isPresent: r.isPresent,
    }));

    await Attendance.findOneAndUpdate(
      { batch, date, subject },
      { batch, date, subject, records: optimizedRecords, teacherId },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Attendance saved!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Save failed" });
  }
});

const normalizeName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/dr\.|prof\.|mr\.|mrs\.|ms\./g, "")
    .replace(/\s+/g, "")
    .trim();
};

app.get("/api/teacher/active-class", async (req, res) => {
  try {
    let { day, time, teacherId } = req.query;

    if (!day || !time || !teacherId) {
      return res.json({ success: false, message: "Missing params" });
    }

    const currentMinutes = parseTime(time);
    const myClasses = await TimeTable.find({
      day: day,
      professor: teacherId,
    }).sort({ startTime: 1 });

    if (myClasses.length === 0) {
      return res.json({
        success: false,
        message: "No classes found for today.",
      });
    }

    const active = [];
    const upcoming = [];
    const completed = [];

    myClasses.forEach((cls) => {
      const start = parseTime(cls.startTime);
      const end = parseTime(cls.endTime);

      if (currentMinutes >= start && currentMinutes <= end) {
        active.push({ ...cls.toObject(), status: "LIVE" });
      } else if (currentMinutes < start) {
        upcoming.push({ ...cls.toObject(), status: "UPCOMING" });
      } else {
        completed.push({ ...cls.toObject(), status: "COMPLETED" });
      }
    });

    // 4. Smart Sort Order
    const sortedClasses = [...active, ...upcoming, ...completed.reverse()];

    // 5. Map to Response
    const responseData = sortedClasses.map((cls) => {
      let label = "UPCOMING CLASS";
      if (cls.status === "LIVE") label = "HAPPENING NOW (Live)";
      if (cls.status === "COMPLETED") label = "RECENT CLASS";

      return {
        subject: cls.subject,
        sem: cls.semester,
        batch: cls.batch || "Class",
        label: label,
        status: cls.status,
        startTime: cls.startTime,
        endTime: cls.endTime,
        room: cls.room, // Added room just in case you need it
      };
    });

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error("Active Class Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/schedule", async (req, res) => {
  try {
    const { date, day, teacherName } = req.query;

    const isHoliday = await Holiday.findOne({ date });
    if (isHoliday) {
      return res.json({
        success: true,
        isHoliday: true,
        reason: isHoliday.reason,
        data: [],
      });
    }
    const allClasses = await TimeTable.find({ day })
      .populate("professor", "name profileImage")
      .sort({ startTime: 1 });

    let myClasses = allClasses;

    if (teacherName) {
      const cleanInput = normalizeName(teacherName);

      myClasses = allClasses.filter((cls) => {
        const profName = cls.professor?.name || "";
        const cleanProf = normalizeName(profName);

        return cleanProf.includes(cleanInput) || cleanInput.includes(cleanProf);
      });
    }

    res.json({ success: true, isHoliday: false, data: myClasses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});
// 2. MARK HOLIDAY (Toggle)
app.post("/api/holidays", async (req, res) => {
  try {
    const { date, reason, markedBy } = req.body;

    const existing = await Holiday.findOne({ date });

    if (existing) {
      await Holiday.deleteOne({ date });

      const students = await Student.find({ pushToken: { $exists: true } });
      const tokens = students
        .map((s) => s.pushToken)
        .filter((token) => token && token.trim() !== "");

      if (tokens.length > 0) {
        const sadBody = `Bad news! The holiday on ${date} has been cancelled. Classes are back on schedule. 📚`;

        await sendPushNotification(tokens, "🚫 Holiday Cancelled", sadBody, {
          screen: "TimeTable",
        });
      }

      return res.json({ success: true, status: "removed" });
    } else {
      await Holiday.create({ date, reason, markedBy });

      const students = await Student.find({ pushToken: { $exists: true } });
      const tokens = students
        .map((s) => s.pushToken)
        .filter((token) => token && token.trim() !== "");

      if (tokens.length > 0) {
        const happyBody = `Pack your bags! ${reason} declared for ${date}. Don't show up.`;

        await sendPushNotification(tokens, "🌴 Holiday Alert", happyBody, {
          screen: "TimeTable",
        });
      }

      return res.json({ success: true, status: "added" });
    }
  } catch (err) {
    console.error("Holiday Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/auth/save-token", async (req, res) => {
  try {
    const { userId, role, token } = req.body;

    if (role === "student") {
      await Student.findByIdAndUpdate(userId, { pushToken: token });
    } else {
      await UserModel.findByIdAndUpdate(userId, { pushToken: token });
    }

    res.json({ success: true, message: "Token saved" });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/api/students/search", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Query parameter required" });
    }
    const students = await Student.find({ universityRollNo: query }).select(
      "-password"
    );

    if (students.length > 0) {
      res.json({ success: true, data: students });
    } else {
      res.json({ success: false, message: "Student not found" });
    }
  } catch (err) {
    console.error("Search Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/library/dashboard", async (req, res) => {
  try {
    const books = await LibraryBook.find().sort({ createdAt: -1 });

    const activeIssues = await LibraryTransaction.find({
      status: "ISSUED",
    }).sort({ issueDate: -1 });

    const totalBooks = books.reduce((sum, book) => sum + book.totalQty, 0);

    const totalIssued = activeIssues.length;

    res.json({
      success: true,

      data: {
        inventory: books,

        activeIssues: activeIssues,

        stats: {
          totalBooks,

          activeIssues: activeIssues,
        },
      },
    });
  } catch (err) {
    console.error("Library Dashboard Error:", err);

    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/student/library/dashboard", async (req, res) => {
  try {
    const { roll } = req.query;

    if (!roll) {
      return res
        .status(400)
        .json({ success: false, message: "Student Roll Number required" });
    }

    const student = await Student.findOne({ universityRollNo: roll });
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    const transactions = await LibraryTransaction.find({
      studentId: student._id,
    }).sort({ issueDate: -1 });

    const activeBooks = [];
    const historyBooks = [];
    let overdueCount = 0;
    let totalFine = 0;
    const FINE_PER_DAY = 5;

    const today = new Date();

    transactions.forEach((txn) => {
      const dueDate = new Date(txn.dueDate);
      let isOverdue = false;
      let fine = 0;

      if (txn.status === "ISSUED") {
        if (today > dueDate) {
          isOverdue = true;
          const diffTime = Math.abs(today - dueDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          fine = diffDays * FINE_PER_DAY;

          overdueCount++;
          totalFine += fine;
        }

        activeBooks.push({
          _id: txn._id,
          title: txn.bookTitle,
          author: txn.author || "Library Resource",
          issueDate: txn.issueDate,
          dueDate: txn.dueDate,
          status: isOverdue ? "OVERDUE" : "ACTIVE",
          fine: fine,
        });
      } else {
        // Returned Books
        historyBooks.push({
          _id: txn._id,
          title: txn.bookTitle,
          author: "Returned",
          issueDate: txn.issueDate,
          returnDate: txn.returnDate,
          status: "RETURNED",
        });
      }
    });

    // 4. Send Response
    res.json({
      success: true,
      data: {
        stats: {
          issued: activeBooks.length,
          limit: 5, // Hardcoded limit or fetch from settings
          overdue: overdueCount,
          fines: totalFine,
        },
        activeBooks,
        historyBooks,
      },
    });
  } catch (err) {
    console.error("Student Dashboard Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/library/add", async (req, res) => {
  try {
    const { isbn, title, author, qty, category } = req.body;

    if (!isbn || !title || !qty) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    let book = await LibraryBook.findOne({ isbn });

    if (book) {
      book.totalQty += parseInt(qty);
      book.availableQty += parseInt(qty);
      await book.save();
      return res.json({
        success: true,
        message: "Book quantity updated",
        data: book,
      });
    }

    const gradients = [
      ["#0f766e", "#115e59"],
      ["#0369a1", "#075985"],
      ["#a21caf", "#86198f"],
      ["#be123c", "#881337"],
      ["#b45309", "#78350f"],
    ];
    const randomColor = gradients[Math.floor(Math.random() * gradients.length)];

    book = new LibraryBook({
      isbn,
      title,
      author,
      category,
      totalQty: parseInt(qty),
      availableQty: parseInt(qty),
      coverColor: randomColor,
    });

    await book.save();
    res.json({ success: true, message: "New book added", data: book });
  } catch (err) {
    console.error("Add Book Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/library/issue", async (req, res) => {
  try {
    // 1. Accept 'bookIds' as an ARRAY (instead of single bookId)
    const { bookIds, studentRoll, dueDate } = req.body;

    if (
      !bookIds ||
      !Array.isArray(bookIds) ||
      bookIds.length === 0 ||
      !studentRoll
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid list of Book IDs and Student Roll required",
      });
    }

    // 2. Find Student
    const student = await Student.findOne({ universityRollNo: studentRoll });
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    // 3. Set Due Date (Default: 6 Months)
    let finalDueDate;
    if (dueDate) {
      finalDueDate = new Date(dueDate);
    } else {
      finalDueDate = new Date();
      finalDueDate.setMonth(finalDueDate.getMonth() + 6);
    }

    const successfulIssues = [];
    const failedIssues = [];

    // 4. Process Each Book
    for (const bookId of bookIds) {
      const book = await LibraryBook.findById(bookId);

      if (!book) {
        failedIssues.push({ id: bookId, reason: "Not Found" });
        continue;
      }
      if (book.availableQty < 1) {
        failedIssues.push({ title: book.title, reason: "Out of Stock" });
        continue;
      }

      // Check for duplicates (Student already has THIS book?)
      const existingIssue = await LibraryTransaction.findOne({
        bookId: book._id,
        studentId: student._id,
        status: "ISSUED",
      });

      if (existingIssue) {
        failedIssues.push({ title: book.title, reason: "Already Issued" });
        continue;
      }

      // Create Transaction
      const transaction = new LibraryTransaction({
        bookId: book._id,
        studentId: student._id,
        studentName: student.name,
        studentRoll: student.universityRollNo,
        bookTitle: book.title,
        dueDate: finalDueDate,
        status: "ISSUED",
      });

      await transaction.save();

      // Update Inventory
      book.availableQty -= 1;
      await book.save();

      successfulIssues.push(book.title);
    }

    // -------------------------------------------------------
    // 🔔 NOTIFICATION LOGIC (Quantity based)
    // -------------------------------------------------------
    if (
      student.pushToken &&
      student.pushToken.trim() !== "" &&
      successfulIssues.length > 0
    ) {
      const dateString = finalDueDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      // Calculate Quantity
      const quantity = successfulIssues.length;
      const bookWord = quantity === 1 ? "book" : "books";

      await sendPushNotification(
        [student.pushToken], // ✅ Passed as Array to fix filter error
        "Library Update 📚",
        `You have borrowed ${quantity} ${bookWord}. Please return by ${dateString}.`, // ✅ Shows Quantity
        { screen: "Library" }
      );
    }

    // 6. Response
    if (successfulIssues.length === 0 && failedIssues.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Could not issue any books",
        errors: failedIssues,
      });
    }

    res.json({
      success: true,
      message: `Successfully issued ${successfulIssues.length} books`,
      failed: failedIssues,
    });
  } catch (err) {
    console.error("Batch Issue Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.put("/api/library/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, author, isbn, qty, category } = req.body;

    const book = await LibraryBook.findById(id);
    if (!book)
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });

    // Adjust quantities
    const newTotalQty = parseInt(qty);
    const qtyDifference = newTotalQty - book.totalQty;

    book.title = title || book.title;
    book.author = author || book.author;
    book.isbn = isbn || book.isbn;
    book.category = category || book.category;
    book.totalQty = newTotalQty;
    book.availableQty = book.availableQty + qtyDifference;

    if (book.availableQty < 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot reduce stock below issued amount.",
      });
    }

    await book.save();
    res.json({ success: true, message: "Book updated", data: book });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server Error" });
  }
});

app.post("/api/library/return", async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res
        .status(400)
        .json({ success: false, message: "Transaction ID required" });
    }

    const transaction = await LibraryTransaction.findById(
      transactionId
    ).populate("studentId");

    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status === "RETURNED") {
      return res
        .status(400)
        .json({ success: false, message: "Book already returned" });
    }

    transaction.status = "RETURNED";
    transaction.returnDate = Date.now();
    await transaction.save();

    const book = await LibraryBook.findById(transaction.bookId);
    if (book) {
      book.availableQty += 1;
      await book.save();
    }

    const student = transaction.studentId;

    if (student && student.pushToken && student.pushToken.trim() !== "") {
      const bookTitle = book ? book.title : "your book";

      await sendPushNotification(
        [student.pushToken],
        "Book Returned ✅",
        `You have successfully returned "${bookTitle}". Thank you!`,
        { screen: "Library" }
      );
    }

    res.json({ success: true, message: "Book returned successfully" });
  } catch (err) {
    console.error("Return Book Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/student/attendance/dashboard", async (req, res) => {
  try {
    const { id } = req.query;
    console.log("Attendance Dashboard Request for Student ID:", id);

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Student ID required" });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    const studentObjectId = new mongoose.Types.ObjectId(id);

    const attendanceStats = await Attendance.aggregate([
      {
        $match: {
          sem: student.sem,
          batch: student.batch,
        },
      },

      { $sort: { date: -1 } },

      {
        $project: {
          subject: 1,
          date: 1,
          myRecord: {
            $filter: {
              input: "$records",
              as: "record",
              cond: { $eq: ["$$record.student", studentObjectId] },
            },
          },
        },
      },
      {
        $group: {
          _id: "$subject",
          total: { $sum: 1 },
          attended: {
            $sum: {
              $cond: [
                {
                  $eq: [{ $arrayElemAt: ["$myRecord.isPresent", 0] }, true],
                },
                1,
                0,
              ],
            },
          },
          history: {
            $push: {
              $cond: [
                { $eq: [{ $arrayElemAt: ["$myRecord.isPresent", 0] }, true] },
                true,
                false,
              ],
            },
          },
        },
      },

      {
        $project: {
          id: "$_id",
          subject: "$_id",
          total: 1,
          attended: 1,
          history: { $slice: ["$history", 5] },
        },
      },
    ]);

    const formattedData = attendanceStats.map((item) => ({
      ...item,
      history: item.history.map((status) => (status === true ? "P" : "A")),
    }));
    console.log("Attendance Dashboard Data:", formattedData);

    res.json({ success: true, data: formattedData });
  } catch (err) {
    console.error("Attendance Dashboard Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/teacher/exam/assign", async (req, res) => {
  try {
    const {
      title,
      subject,
      date,
      time,
      duration,
      venue,
      sem,
      batch,
      teacherId,
      professorName,
    } = req.body;

    if (
      !title ||
      !subject ||
      !date ||
      !time ||
      !duration ||
      !venue ||
      !sem ||
      !batch ||
      !teacherId
    ) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    const newExam = new Exam({
      title,
      subject,
      date,
      time,
      duration,
      venue,
      semester: sem,
      batch,
      professor: professorName,
      teacherId,
    });

    const savedExam = await newExam.save();
    const students = await Student.find({
      semester: sem,
      batch: batch,
      pushToken: { $exists: true },
    });

    const tokens = students
      .map((s) => s.pushToken)
      .filter((token) => token && token.trim() !== "");

    if (tokens.length > 0) {
      const notificationBody = `${subject} (${title}) is scheduled on ${date} at ${time}. Duration: ${duration}.`;

      await sendPushNotification(
        tokens,
        "New Exam Scheduled 📝",
        notificationBody,
        { screen: "Exams" }
      );
    }

    res.status(201).json({
      success: true,
      message: "Exam assigned and students notified successfully",
      data: savedExam,
    });
  } catch (err) {
    console.error("Assign Exam Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/exams", async (req, res) => {
  try {
    const { sem, batch, teacherId } = req.query;
    let query = {};

    if (teacherId) {
      query.teacherId = teacherId;
    } else if (sem && batch) {
      query.semester = sem;
      query.batch = batch;
    } else {
      return res.json({ success: true, data: [] });
    }
    const exams = await Exam.find(query).sort({ date: 1 });

    res.json({ success: true, data: exams });
  } catch (err) {
    console.error("Fetch Exams Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.put("/api/exams/:id", async (req, res) => {
  try {
    const { title, subject, date, time, venue, duration } = req.body;
    const examId = req.params.id;

    // 1. Find the exam
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res
        .status(404)
        .json({ success: false, message: "Exam not found" });
    }

    // 2. Update fields directly (No auth check)
    if (title) exam.title = title;
    if (subject) exam.subject = subject;
    if (date) exam.date = date;
    if (time) exam.time = time;
    if (venue) exam.venue = venue;
    if (duration) exam.duration = duration;

    await exam.save();

    res.json({ success: true, message: "Exam updated successfully" });
  } catch (err) {
    console.error("Update Exam Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.delete("/api/exams/:id", async (req, res) => {
  try {
    const examId = req.params.id;

    const deletedExam = await Exam.findByIdAndDelete(examId);

    if (!deletedExam) {
      return res
        .status(404)
        .json({ success: false, message: "Exam not found" });
    }

    res.json({ success: true, message: "Exam deleted successfully" });
  } catch (err) {
    console.error("Delete Exam Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.get("/api/teachers", async (req, res) => {
  try {
    const teachers = await UserModel.find({ role: "teacher" })
      .select("-password -otp -otpExpires")
      .sort({ isHOD: -1, name: 1 });
    const formattedTeachers = teachers.map((t) => ({
      id: t._id,
      name: t.name,
      role: t.designation || "Faculty Member",
      department: t.department || "Computer Science",
      email: t.email,
      phone: t.phone || "",
      image: t.profileImage || null,
      about: t.bio || "No information available.",
      isHOD: t.isHOD || false,
    }));

    res.json({ success: true, data: formattedTeachers });
  } catch (err) {
    console.error("Fetch Teachers Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post("/api/promote-batch", async (req, res) => {
  try {
    const graduated = await Student.updateMany(
      {
        semester: 6,
        role: "student",
      },
      {
        $set: { role: "alumni", semester: 0 },
      }
    );

    const promoted = await Student.updateMany(
      {
        role: "student",
        semester: { $lt: 6 },
      },
      {
        $inc: { semester: 1 },
      }
    );

    res.status(200).json({
      success: true,
      message: "Batch promotion successful!",
      data: {
        graduatedCount: graduated.modifiedCount,
        promotedCount: promoted.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Promotion Error:", error);
    res.status(500).json({ success: false, error: "Promotion failed." });
  }
});

app.get("/api/teachers/tt", async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};
    const users = await UserModel.find(filter)
      .select("name _id department profileImage")
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, error: "Server Error" });
  }
});

app.get("/api/weekly-holidays", async (req, res) => {
  try {
    const { start, end } = req.query;
    console.log("Received start:", start, "end:", end);
    const targetDates = [];
    let current = new Date(start);
    const stop = new Date(end);

    while (current <= stop) {
      const d = current.getDate().toString().padStart(2, "0");
      const m = (current.getMonth() + 1).toString().padStart(2, "0");
      const y = current.getFullYear();
      targetDates.push(`${d}-${m}-${y}`); // Push "12-01-2026"

      current.setDate(current.getDate() + 1);
    }

    // 2. Find holidays that match ANY of these 7 strings
    const holidays = await Holiday.find({
      date: { $in: targetDates }, // $in is perfect for this
    });

    // 3. Convert results BACK to YYYY-MM-DD for the Frontend
    // The frontend expects YYYY-MM-DD to compare easily
    const holidayDates = holidays.map((h) => {
      const [dd, mm, yyyy] = h.date.split("-");
      return `${yyyy}-${mm}-${dd}`;
    });

    res.json({ success: true, data: holidayDates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});
