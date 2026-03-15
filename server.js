// ═══════════════════════════════════════════════════════════════
//  ROCKET HAX — Signaling Server ONLY
//  No physics. No game state. Pure WebRTC handshake relay.
//  Runs on Render/Fly for free — handles almost zero load.
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
http.listen(PORT, () => console.log("🚀 Signaling on port", PORT))

// rooms[code] = { hostId, players:[], settings:{}, phase }
const rooms = {}

function makeCode() {
    return Array.from({length:5}, () =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]
    ).join("")
}

io.on("connection", socket => {

    // ── HOST creates room ─────────────────────────────────────────
    socket.on("createRoom", (playerData) => {
        const code = makeCode()
        rooms[code] = {
            hostId:   socket.id,
            players:  [{ id: socket.id, ...playerData, isHost: true }],
            settings: {
                blueTeamName:"BLUE", orangeTeamName:"ORANGE",
                blueColor:"#00aaff", orangeColor:"#ff6600",
                seriesTitle:"FRIENDLY MATCH", gameNum:1, bestOf:7
            },
            phase: "lobby"
        }
        socket.join(code)
        socket.roomCode = code
        socket.emit("roomCreated", code)
    })

    // ── CLIENT joins lobby ────────────────────────────────────────
    socket.on("joinLobby", ({ room: code, ...playerData }) => {
        const room = rooms[code]
        if (!room) return socket.emit("roomError", "Sala no encontrada")
        if (room.phase === "playing") return socket.emit("roomError", "Partida en curso")

        socket.join(code)
        socket.roomCode = code

        if (!room.players.find(p => p.id === socket.id))
            room.players.push({ id: socket.id, isHost: false, ...playerData })

        // Tell new client everything it needs
        socket.emit("lobbyJoined", {
            hostId:   room.hostId,
            players:  room.players,
            settings: room.settings,
            myId:     socket.id
        })

        // Update lobby for everyone
        io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })

        // Tell HOST a new peer arrived → host will create WebRTC offer
        socket.to(room.hostId).emit("peerJoined", { peerId: socket.id, playerData })
    })

    // ── Team / settings (lobby only, relayed to everyone) ─────────
    socket.on("joinTeam", ({ room: code, team }) => {
        const room = rooms[code]; if (!room) return
        const p = room.players.find(p => p.id === socket.id)
        if (p) p.team = team
        io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
    })

    socket.on("updateSettings", ({ room: code, settings }) => {
        const room = rooms[code]; if (!room) return
        if (room.hostId !== socket.id) return
        Object.assign(room.settings, settings)
        io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
    })

    // ── WebRTC signaling — pure relay, zero inspection ────────────
    socket.on("rtc:offer",     ({ to, offer })     => io.to(to).emit("rtc:offer",     { from: socket.id, offer }))
    socket.on("rtc:answer",    ({ to, answer })    => io.to(to).emit("rtc:answer",    { from: socket.id, answer }))
    socket.on("rtc:ice",       ({ to, candidate }) => io.to(to).emit("rtc:ice",       { from: socket.id, candidate }))

    // ── Host marks game as started (blocks late joiners) ─────────
    socket.on("gameStarted", ({ room: code }) => {
        const room = rooms[code]; if (!room) return
        if (room.hostId !== socket.id) return
        room.phase = "playing"
        io.to(code).emit("gameStarted")
    })

    // ── Disconnect ────────────────────────────────────────────────
    socket.on("disconnect", () => {
        const code = socket.roomCode
        if (!code || !rooms[code]) return
        const room = rooms[code]
        room.players = room.players.filter(p => p.id !== socket.id)

        if (room.hostId === socket.id) {
            io.to(code).emit("hostDisconnected")
            delete rooms[code]
        } else {
            // Tell host to close that DataChannel
            io.to(room.hostId).emit("peerLeft", { peerId: socket.id })
            io.to(code).emit("lobbyUpdate", { players: room.players, settings: room.settings })
        }
    })
})
