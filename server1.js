const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static('public'));

// Route for private chat page
app.get('/private', (req, res) => {
  res.sendFile(__dirname + '/public/private.html');
});

// Socket.IO logic for private chat
io.on('connection', (socket) => {
  console.log('A user connected');

  // Join a private room
  socket.on('join private', (data) => {
    const roomId = data.roomId;
    socket.join(roomId); // Add the user to the room
    socket.emit('private status', `Joined private room: ${roomId}`);
  });

  // Send a private message
  socket.on('private message', (data) => {
    const roomId = data.roomId;
    const sender = data.sender;
    const message = data.message;

    // Broadcast the message ONLY to users in the same room
    io.to(roomId).emit('private message', {
      sender: sender,
      message: message
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the server
server.listen(4000, () => {
  console.log('Private chat server running on http://localhost:4000');
})
