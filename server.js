require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000
}).then(() => console.log('✅ MongoDB Connected')).catch(err => console.error('❌ MongoDB Connection Error:', err));

// Define Message Schema
const messageSchema = new mongoose.Schema({
  user: { type: String, default: 'Anonymous' },
  text: String,
  fileUrl: String,
  fileName: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Ensure 'uploads' and 'NAFIJ' directories exist
const uploadDir = path.join(__dirname, 'uploads');
const nafijDir = path.join(__dirname, 'NAFIJ');
[uploadDir, nafijDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use('/uploads', express.static(uploadDir));

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const fileUrl = `/uploads/${req.file.filename}`;
  const message = new Message({ user: 'Anonymous', fileUrl, fileName: req.file.originalname });
  await message.save();

  io.emit('chat message', { user: 'Anonymous', text: req.file.originalname });
  res.json({ fileUrl, fileName: req.file.originalname });
});

// Get messages from MongoDB
app.get('/messages', async (req, res) => {
  const messages = await Message.find().sort('timestamp');
  res.json(messages);
});

const users = {}; // Store usernames

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  // Send stored messages
  socket.emit('load messages', await Message.find().sort('timestamp'));

  socket.on('set username', (username) => {
    users[socket.id] = username;
    console.log('Username set:', username);
  });

  socket.on('chat message', async (msg) => {
    const message = new Message({ user: users[socket.id] || 'Anonymous', text: msg.text });
    await message.save();
    io.emit('chat message', message);
  });

  socket.on('file message', async (fileData) => {
    const message = new Message({ user: users[socket.id] || 'Anonymous', fileUrl: fileData.fileUrl, fileName: fileData.fileName });
    await message.save();
    io.emit('chat message', message);
  });

  socket.on('chat reaction', async (reactionData) => {
    const message = new Message({ user: users[socket.id] || 'Anonymous', text: reactionData.reaction });
    await message.save();
    io.emit('chat message', message);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete users[socket.id];
  });
});

// ZIP and download files
app.get('/files-download', (req, res) => {
  const zipFileName = 'backup.zip';
  const zipPath = path.join(__dirname, zipFileName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`✅ ZIP created: ${archive.pointer()} total bytes`);
    res.download(zipPath, zipFileName, (err) => {
      if (err) console.error('❌ Error downloading ZIP:', err);
      fs.unlinkSync(zipPath); // Delete ZIP after sending
    });
  });

  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(output);

  // Add 'uploads' folder
  if (fs.existsSync(uploadDir)) archive.directory(uploadDir, 'uploads');

  // Add 'NAFIJ' folder
  if (fs.existsSync(nafijDir)) archive.directory(nafijDir, 'NAFIJ');

  // Add server.js
  archive.file(path.join(__dirname, 'server.js'), { name: 'server.js' });

  // Add index.html
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) archive.file(indexPath, { name: 'index.html' });

  archive.finalize();
});

// Serve static files (e.g., HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Route for the private chat page
app.get('/private', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'private.html'));
});

// Socket.IO logic for private chat
io.on('connection', (socket) => {
  console.log('A user connected');

  // Private chat logic here
  socket.on('join private', (data) => {
    const roomId = data.roomId;
    socket.join(roomId);
    socket.emit('private status', `Joined private room: ${roomId}`);
  });

  socket.on('private message', (data) => {
    io.to(data.roomId).emit('private message', {
      sender: data.sender,
      message: data.message
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});
  
                           
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
