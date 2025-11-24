const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game rooms
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('New player connected:', socket.id);

    // Join or create room
    socket.on('joinRoom', ({ playerName, roomCode }) => {
        let room = rooms.get(roomCode);

        if (!room) {
            // Create new room
            room = {
                code: roomCode,
                players: [],
                gameStarted: false,
                gameState: null
            };
            rooms.set(roomCode, room);
        }

        if (room.players.length >= 2) {
            socket.emit('roomFull');
            return;
        }

        // Add player to room
        const player = {
            id: socket.id,
            name: playerName,
            score: 0,
            cardsRemaining: 28,
            bonusCards: 0,
            combo: 0
        };

        room.players.push(player);
        socket.join(roomCode);
        socket.roomCode = roomCode;

        // Notify all players in room
        io.to(roomCode).emit('playerJoined', {
            players: room.players,
            roomCode: roomCode
        });

        console.log(`${playerName} joined room ${roomCode}`);

        // Start game if 2 players
        if (room.players.length === 2) {
            setTimeout(() => {
                room.gameStarted = true;
                io.to(roomCode).emit('gameStart', {
                    players: room.players
                });
            }, 2000);
        }
    });

    // Player makes a move
    socket.on('playerMove', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        // Update player stats
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.score = data.score;
            player.cardsRemaining = data.cardsRemaining;
            player.bonusCards = data.bonusCards;
            player.combo = data.combo;

            // Broadcast to all players in room
            io.to(roomCode).emit('opponentUpdate', {
                playerId: socket.id,
                stats: {
                    score: player.score,
                    cardsRemaining: player.cardsRemaining,
                    bonusCards: player.bonusCards,
                    combo: player.combo
                }
            });

            // Check win condition
            if (player.cardsRemaining === 0) {
                io.to(roomCode).emit('gameOver', {
                    winner: player.name,
                    winnerId: player.id
                });
            }
        }
    });

    // Player disconnects
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        // Remove player from room
        room.players = room.players.filter(p => p.id !== socket.id);

        if (room.players.length === 0) {
            // Delete empty room
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted`);
        } else {
            // Notify remaining players
            io.to(roomCode).emit('playerLeft', {
                players: room.players
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`🎮 Get Eleven Solitaire server running on http://localhost:${PORT}`);
    console.log(`Ready for multiplayer games!`);
});
