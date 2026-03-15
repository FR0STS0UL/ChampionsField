// ═══════════════════════════════════════════════════════════════
//  LOBBY.JS — P2P version
//  Uses signaling socket only.
//  On "Start Game": saves lobbyData to localStorage, redirects.
// ═══════════════════════════════════════════════════════════════
const socket = io()
const params = new URLSearchParams(window.location.search)
const room   = params.get("room")

document.getElementById("roomCode").textContent = room

const playerData = JSON.parse(localStorage.getItem("playerData") || "{}")

// Figure out if I am the host (my socket id === hostId sent by server)
let amHost   = false
let myHostId = null
let currentPlayers  = []
let currentSettings = {}

socket.on("connect", () => {
    socket.emit("joinLobby", { room, ...playerData })
})

socket.on("lobbyJoined", ({ hostId, players, settings, myId }) => {
    amHost        = (myId === hostId)
    myHostId      = hostId
    currentPlayers  = players
    currentSettings = settings

    // Show/hide start button based on host status
    const startBtn = document.getElementById("startBtn")
    if (startBtn) startBtn.style.display = amHost ? "block" : "none"

    const badge = document.getElementById("host-badge")
    if (badge) badge.style.display = amHost ? "inline-block" : "none"

    applySettings(settings)
    renderTeam("bluePlayers",   players.filter(p => p.team === "blue"))
    renderTeam("orangePlayers", players.filter(p => p.team === "orange"))
})

socket.on("lobbyUpdate", ({ players, settings }) => {
    currentPlayers  = players
    currentSettings = settings
    applySettings(settings)
    renderTeam("bluePlayers",   players.filter(p => p.team === "blue"))
    renderTeam("orangePlayers", players.filter(p => p.team === "orange"))
})

socket.on("roomError", msg => {
    alert("Error: " + msg)
    window.location.href = "/"
})

socket.on("gameStarted", () => {
    // Non-host clients also need to go to game page
    if (!amHost) {
        localStorage.setItem("hostId", myHostId)
        window.location.href = `game.html?room=${room}`
    }
})

// ── TEAM JOIN ─────────────────────────────────────────────────
function joinTeam(team) {
    const data = JSON.parse(localStorage.getItem("playerData") || "{}")
    data.team  = team
    localStorage.setItem("playerData", JSON.stringify(data))
    socket.emit("joinTeam", { room, team })
}

// ── SETTINGS (host only) ──────────────────────────────────────
function pushSettings() {
    if (!amHost) return
    const s = readSettings()
    socket.emit("updateSettings", { room, settings: s })
    applyPreview(s)
}

function readSettings() {
    return {
        blueTeamName:   document.getElementById("cfg-bluename").value   || "BLUE",
        orangeTeamName: document.getElementById("cfg-orangename").value || "ORANGE",
        blueColor:      document.getElementById("cfg-bluecolor").value,
        orangeColor:    document.getElementById("cfg-orangecolor").value,
        seriesTitle:    document.getElementById("cfg-series").value     || "FRIENDLY MATCH",
        gameNum:        parseInt(document.getElementById("cfg-gamenum").value)  || 1,
        bestOf:         parseInt(document.getElementById("cfg-bestof").value)   || 7,
    }
}

function applySettings(s) {
    const ids = ["cfg-bluename","cfg-orangename","cfg-bluecolor","cfg-orangecolor","cfg-series","cfg-gamenum","cfg-bestof"]
    const vals = [s.blueTeamName,s.orangeTeamName,s.blueColor,s.orangeColor,s.seriesTitle,s.gameNum,s.bestOf]
    ids.forEach((id,i) => { const el=document.getElementById(id); if(el) el.value=vals[i] })

    // Disable settings inputs for non-host
    ids.forEach(id => {
        const el=document.getElementById(id)
        if(el) el.disabled = !amHost
    })
    applyPreview(s)
}

function applyPreview(s) {
    const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val }
    const css = (id, prop, val) => { const el=document.getElementById(id); if(el) el.style[prop]=val }
    set("sbp-blue-name",   s.blueTeamName)
    set("sbp-orange-name", s.orangeTeamName)
    set("sbp-series-text", s.seriesTitle)
    set("sbp-game-text",   "GAME " + s.gameNum)
    set("sbp-bo-text",     "BEST OF " + s.bestOf)
    set("blue-label",      s.blueTeamName)
    set("orange-label",    s.orangeTeamName)
    css("sbp-blue-bar",   "background", s.blueColor)
    css("sbp-orange-bar", "background", s.orangeColor)
    css("blue-label",     "color", s.blueColor)
    css("orange-label",   "color", s.orangeColor)
    css("blue-dot",       "background",  s.blueColor)
    css("blue-dot",       "boxShadow",   `0 0 8px ${s.blueColor}`)
    css("orange-dot",     "background",  s.orangeColor)
    css("orange-dot",     "boxShadow",   `0 0 8px ${s.orangeColor}`)
}

function renderTeam(divId, players) {
    const div = document.getElementById(divId); if(!div) return
    div.innerHTML = ""
    players.forEach(p => {
        const card = document.createElement("div"); card.className = "playerCard"
        const hostMarker = (p.id === myHostId) ? ' <span style="color:#ffd700;font-size:9px">HOST</span>' : ""
        card.innerHTML = `
            <div class="avatar-container"><img src="${p.pfp||'assets/default_pfp.png'}" class="pfp" onerror="this.src='assets/default_pfp.png'"></div>
            <div class="info-container" style="background-image:url('${p.banner||'assets/banners/Default.png'}')">
                <div class="name">${p.name||"Jugador"}${hostMarker}</div>
                <div class="playerTitle" style="color:${p.titleColor||'#aaa'}">${p.title||""}</div>
            </div>`
        div.appendChild(card)
    })
}

// ── START GAME ────────────────────────────────────────────────
function startGame() {
    if (!amHost) return
    const settings = readSettings()
    // Save full lobby state so game.html can build the game state
    localStorage.setItem("lobbyData", JSON.stringify({
        players:  currentPlayers,
        settings: settings
    }))
    localStorage.setItem("hostId", socket.id)
    // Tell server game started (blocks late joiners + notifies clients)
    socket.emit("gameStarted", { room })
    // Host goes to game page with ?host=1
    window.location.href = `game.html?room=${room}&host=1`
}
