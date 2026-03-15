// ═══════════════════════════════════════════════════════════════
//  CHAMPIONS FIELD — Signaling Server
//  Pure WebRTC relay. No physics. No game state.
//  Late joiners ARE allowed — they connect via P2P to the host.
// ═══════════════════════════════════════════════════════════════
const express = require("express")
const app  = express()
const http = require("http").createServer(app)
const io   = require("socket.io")(http, {
    cors: { origin: "*" },
    pingInterval: 10000,
    pingTimeout:  25000
})

app.use(express.static("public"))
const PORT = process.env.PORT || 3000
http.listen(PORT, () => console.log("🚀 Champions Field on port", PORT))

// rooms[code] = { hostSocketId, hostPlayerData, players[], settings{}, phase }
const rooms = {}

function makeCode() {
    return Array.from({length:5}, () =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]
    ).join("")
}

io.on("connection", socket => {

    // ── CREATE ROOM ───────────────────────────────────────────────
    // Called from index.html. Socket disconnects on navigation — that's fine.
    // Room persists. First joinLobby claims the host slot.
    socket.on("createRoom", (playerData) => {
        const code = makeCode()
        rooms[code] = {
            hostSocketId:   null,
            hostPlayerData: { ...(playerData||{}), isHost:true },
            players:  [],
            settings: {
                blueTeamName:"BLUE",   orangeTeamName:"ORANGE",
                blueColor:"#00aaff",   orangeColor:"#ff6600",
                seriesTitle:"CHAMPIONS FIELD", gameNum:1, bestOf:7
            },
            phase: "lobby"
        }
        socket.emit("roomCreated", code)
        console.log("Room created:", code)
    })

    // ── JOIN LOBBY / GAME ─────────────────────────────────────────
    // Always allowed — even if game is in progress (for late joiners + ICE trickle).
    socket.on("joinLobby", ({ room: code, ...playerData }) => {
        const room = rooms[code]
        if (!room) return socket.emit("roomError", "Sala no encontrada")

        socket.join(code)
        socket.roomCode = code

        // First person to join claims the host slot
        const isHost = room.hostSocketId === null
        if (isHost) {
            room.hostSocketId = socket.id
            const hp = { ...room.hostPlayerData, ...playerData, id: socket.id, isHost: true }
            // Avoid duplicate
            if (!room.players.find(p => p.id === socket.id))
                room.players.unshift(hp)
        } else {
            if (!room.players.find(p => p.id === socket.id))
                room.players.push({ id: socket.id, isHost: false, ...playerData })
        }

        socket.emit("lobbyJoined", {
            hostId:   room.hostSocketId,
            players:  room.players,
            settings: room.settings,
            myId:     socket.id,
            phase:    room.phase
        })

        io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })

        // Tell host a new peer wants a DataChannel
        if (!isHost && room.hostSocketId) {
            socket.to(room.hostSocketId).emit("peerJoined", { peerId: socket.id, playerData })
        }
    })

    // ── TEAM ──────────────────────────────────────────────────────
    socket.on("joinTeam", ({ room: code, team }) => {
        const room = rooms[code]; if (!room) return
        const p = room.players.find(p => p.id === socket.id)
        if (p) p.team = team
        io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
    })

    // ── SETTINGS ──────────────────────────────────────────────────
    socket.on("updateSettings", ({ room: code, settings }) => {
        const room = rooms[code]; if (!room) return
        if (room.hostSocketId !== socket.id) return
        Object.assign(room.settings, settings)
        io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
    })

    // ── WEBRTC RELAY ──────────────────────────────────────────────
    socket.on("rtc:offer",  ({ to, offer })     => io.to(to).emit("rtc:offer",  { from: socket.id, offer }))
    socket.on("rtc:answer", ({ to, answer })    => io.to(to).emit("rtc:answer", { from: socket.id, answer }))
    socket.on("rtc:ice",    ({ to, candidate }) => io.to(to).emit("rtc:ice",    { from: socket.id, candidate }))

    // ── GAME STARTED ──────────────────────────────────────────────
    socket.on("gameStarted", ({ room: code }) => {
        const room = rooms[code]; if (!room) return
        if (room.hostSocketId !== socket.id) return
        room.phase = "playing"
        io.to(code).emit("gameStarted")
    })

    // ── DISCONNECT ────────────────────────────────────────────────
    socket.on("disconnect", () => {
        const code = socket.roomCode
        if (!code || !rooms[code]) return
        const room = rooms[code]

        room.players = room.players.filter(p => p.id !== socket.id)

        if (room.hostSocketId === socket.id) {
            if (room.phase === "playing") {
                io.to(code).emit("hostDisconnected")
                delete rooms[code]
            } else {
                // Lobby: keep room alive, let next joinLobby reclaim host
                room.hostSocketId = null
                io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
            }
        } else {
            if (room.hostSocketId) {
                io.to(room.hostSocketId).emit("peerLeft", { peerId: socket.id })
            }
            io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
        }
    })
})
