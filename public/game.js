const socket = io()
const canvas = document.getElementById("game")
const ctx = canvas.getContext("2d")

// Configuración de la imagen de la cancha
const fieldImg = new Image();
fieldImg.src = "assets/field.png"; 

let players = [] 
let ball = { x: 700, y: 450 } // Posición inicial por defecto
let targetBall = { x: 700, y: 450 } // Destino real enviado por el servidor
let keys = {}

const params = new URLSearchParams(window.location.search)
const room = params.get("room")
const playerData = JSON.parse(localStorage.getItem("playerData"))

socket.emit("joinGame", { room: room, ...playerData })

// Detección de teclas (añadido Shift para el Boost)
document.addEventListener("keydown", (e) => keys[e.key === "Shift" ? "shift" : e.key.toLowerCase()] = true)
document.addEventListener("keyup", (e) => keys[e.key === "Shift" ? "shift" : e.key.toLowerCase()] = false)

socket.on("playerInfoUpdate", (fullPlayerData) => {
    players = fullPlayerData; 
    updateSidePanels();
});

socket.on("state", (state) => {
    // Sincronizar destino de los jugadores
    state.players.forEach(serverPlayer => {
        let localPlayer = players.find(p => p.id === serverPlayer.id);
        if (localPlayer) {
            localPlayer.targetX = serverPlayer.x;
            localPlayer.targetY = serverPlayer.y;
            localPlayer.team = serverPlayer.team;
            localPlayer.boost = serverPlayer.boost; // Recibimos el valor de boost
        }
    });
    // Sincronizar destino del balón
    targetBall = state.ball;
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
        if (p.x === undefined) { p.x = p.targetX; p.y = p.targetY; }
        
        // INTERPOLACIÓN: Suaviza el movimiento de los jugadores
        p.x += (p.targetX - p.x) * 0.25;
        p.y += (p.targetY - p.y) * 0.25;

        ctx.beginPath()
        ctx.fillStyle = p.team === "blue" ? "#00bcff" : "#ff3b3b"
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke()

        ctx.textAlign = "center"; ctx.font = "bold 14px Segoe UI"; ctx.fillStyle = "white";
        ctx.fillText(p.name, p.x, p.y - 35)
        ctx.font = "bold 10px Segoe UI"; ctx.fillStyle = p.titleColor || "#aaa";
        ctx.fillText(p.title, p.x, p.y - 22)
    })
}

function drawBall() {
    // INTERPOLACIÓN: Suaviza el movimiento del balón
    ball.x += (targetBall.x - ball.x) * 0.25;
    ball.y += (targetBall.y - ball.y) * 0.25;

    ctx.beginPath(); 
    ctx.fillStyle = "white"; 
    ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2); 
    ctx.fill()
    ctx.strokeStyle = "black"; ctx.lineWidth = 1; ctx.stroke();
}

function drawBoostUI() {
    const myPlayer = players.find(p => p.id === socket.id);
    if (!myPlayer || myPlayer.boost === undefined) return;

    const x = 1320; // Posición abajo a la derecha para 1400x900
    const y = 820;
    const radius = 50;

    // Fondo del medidor
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 10;
    ctx.stroke();

    // Barra de boost
    const boostPerc = myPlayer.boost / 100;
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * boostPerc));
    ctx.strokeStyle = myPlayer.boost > 20 ? "#ffae00" : "#ff3b3b";
    ctx.lineWidth = 10;
    ctx.stroke();

    // Texto
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Segoe UI";
    ctx.fillText(Math.floor(myPlayer.boost), x, y + 10);
}

function draw() {
    ctx.clearRect(0, 0, 1400, 900)
    
    // Dibujamos la cancha
    if (fieldImg.complete) {
        ctx.drawImage(fieldImg, 0, 0, 1400, 900);
    } else {
        ctx.fillStyle = "#1b7a2f";
        ctx.fillRect(0, 0, 1400, 900);
    }

    drawPlayers(); 
    drawBall();
    drawBoostUI(); // Dibujamos el medidor estilo RL
    requestAnimationFrame(draw)
}

setInterval(() => {
    // Enviamos el estado de las teclas, incluyendo shift
    socket.emit("move", { 
        w: keys["w"], 
        a: keys["a"], 
        s: keys["s"], 
        d: keys["d"], 
        shift: keys["shift"] 
    })
}, 1000 / 60)

draw()