const socket = io()
const canvas = document.getElementById("game")
const ctx = canvas.getContext("2d")

// Configuración de la imagen de la cancha
const fieldImg = new Image();
fieldImg.src = "assets/field.png"; 

let players = [] 
let ball = null
let keys = {}

const params = new URLSearchParams(window.location.search)
const room = params.get("room")
const playerData = JSON.parse(localStorage.getItem("playerData"))

socket.emit("joinGame", { room: room, ...playerData })

document.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true)
document.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false)

socket.on("playerInfoUpdate", (fullPlayerData) => {
    players = fullPlayerData; 
    updateSidePanels();
});

socket.on("state", (state) => {
    state.players.forEach(serverPlayer => {
        let localPlayer = players.find(p => p.id === serverPlayer.id);
        if (localPlayer) {
            localPlayer.x = serverPlayer.x;
            localPlayer.y = serverPlayer.y;
            localPlayer.team = serverPlayer.team;
        }
    });
    ball = state.ball;
});

function updateSidePanels() {
    const redDiv = document.getElementById("redTeam");
    const blueDiv = document.getElementById("blueTeam");
    if(!redDiv || !blueDiv) return;
    redDiv.innerHTML = ""; blueDiv.innerHTML = "";

    players.forEach(p => {
        const card = document.createElement("div");
        card.className = "playerCard";
        card.innerHTML = `
            <div class="avatar-container">
                <img src="${p.pfp}" class="pfp">
            </div>
            <div class="info-container" style="background-image: url('${p.banner}')">
                <div class="name">${p.name}</div>
                <div class="playerTitle" style="color: ${p.titleColor}">${p.title}</div>
            </div>
        `;
        if(p.team === "red") redDiv.appendChild(card);
        else blueDiv.appendChild(card);
    });
}

function drawPlayers() {
    players.forEach(p => {
        if (p.x === undefined) return;
        ctx.beginPath()
        ctx.fillStyle = p.team === "blue" ? "#00bcff" : "#ff3b3b"
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke()

        ctx.textAlign = "center"; ctx.font = "bold 14px Segoe UI"; ctx.fillStyle = "white";
        ctx.fillText(p.name, p.x, p.y - 30)
        ctx.font = "bold 10px Segoe UI"; ctx.fillStyle = p.titleColor || "#aaa";
        ctx.fillText(p.title, p.x, p.y - 18)
    })
}

function drawBall() {
    if (!ball) return
    ctx.beginPath(); ctx.fillStyle = "white"; ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = "black"; ctx.lineWidth = 1; ctx.stroke();
}

function draw() {
    // Limpiamos y dibujamos el fondo de la cancha
    ctx.clearRect(0, 0, 1400, 900)
    
    // Color verde de respaldo
    ctx.fillStyle = "#1b7a2f";
    ctx.fillRect(0, 0, 1400, 900);

    // Dibujamos el sprite si ya cargó
    if (fieldImg.complete) {
        ctx.drawImage(fieldImg, 0, 0, 1400, 900);
    } else {
        // Líneas básicas si el sprite falla
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 5;
        ctx.strokeRect(0,0,1400,900);
        ctx.beginPath(); ctx.moveTo(700,0); ctx.lineTo(700,900); ctx.stroke();
    }

    drawPlayers(); 
    drawBall();
    requestAnimationFrame(draw)
}

setInterval(() => {
    socket.emit("move", { w: keys["w"], a: keys["a"], s: keys["s"], d: keys["d"] })
}, 1000 / 60)

draw()