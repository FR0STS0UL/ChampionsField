const socket = io()
const params = new URLSearchParams(window.location.search)
const room = params.get("room")

document.getElementById("roomCode").innerText = room

// Al entrar al lobby, nos unimos para que los demás nos vean
const playerData = JSON.parse(localStorage.getItem("playerData"))
socket.emit("joinGame", { room: room, ...playerData })

function joinTeam(team) {
    // Guardar elección localmente
    const data = JSON.parse(localStorage.getItem("playerData"));
    data.team = team;
    localStorage.setItem("playerData", JSON.stringify(data));

    // Avisar al servidor
    socket.emit("joinTeam", {
        room: room,
        team: team
    });
}

// El servidor envía 'playerInfoUpdate' con la lista de todos los jugadores
socket.on("playerInfoUpdate", (players) => {
    const redPlayers = players.filter(p => p.team === "red");
    const bluePlayers = players.filter(p => p.team === "blue");

    renderTeam("redPlayers", redPlayers);
    renderTeam("bluePlayers", bluePlayers);
});

function renderTeam(id, players) {
    const div = document.getElementById(id);
    if (!div) return;
    div.innerHTML = "";

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
        div.appendChild(card);
    });
}

function startGame() {
    window.location.href = "game.html?room=" + room;
}