const socket = io();
const input = document.getElementById("pfp-input");
const preview = document.getElementById("pfp-preview");

// CONFIGURACIÓN DE NOMBRES ESPECIALES
const SPECIAL_TITLES = {
    "Frost": { title: "DEVELOPER", color: "#ff0000" },
    "Matias": { title: "GOAT", color: "#00ff00" },
    "Tester": { title: "BETA TESTER", color: "#55ffff" }
};

let player = {
    name: "Jugador",
    title: "ROOKIE",
    titleColor: "#aaaaaa",
    pfp: "assets/default_pfp.png",
    banner: "assets/banners/default.png"
};

function checkSpecialTitle() {
    const name = document.getElementById("username").value.trim();
    const titleSelect = document.getElementById("player-title");
   
    if (SPECIAL_TITLES[name]) {
        player.title = SPECIAL_TITLES[name].title;
        player.titleColor = SPECIAL_TITLES[name].color;
        titleSelect.disabled = true; // Bloqueamos el select si es especial
    } else {
        titleSelect.disabled = false;
        updateTitlePreview();
    }
    renderPreview();
}

function updateTitlePreview() {
    const rawValue = document.getElementById("player-title").value;
    const [name, color] = rawValue.split("|");
    player.title = name;
    player.titleColor = color;
    renderPreview();
}

function previewBanner() {
    player.banner = "assets/banners/" + document.getElementById("banner-select").value;
    renderPreview();
}

function renderPreview() {
    const titleDiv = document.getElementById("title-preview");
    titleDiv.innerText = player.title;
    titleDiv.style.color = player.titleColor;
    document.getElementById("banner-preview-img").src = player.banner;
}

input.addEventListener("change", (e) => {
    const reader = new FileReader();
    reader.onload = function () {
        preview.src = reader.result;
        player.pfp = reader.result;
    }
    reader.readAsDataURL(e.target.files[0]);
});

function saveToLocalStorage(team = "red") {
    player.name = document.getElementById("username").value.trim() || "Jugador";
    player.team = team;
    localStorage.setItem("playerData", JSON.stringify(player));
}

function createRoom() {
    saveToLocalStorage();
    socket.emit("createRoom");
}

socket.on("roomCreated", (code) => {
    window.location.href = "lobby.html?room=" + code;
});

function joinRoom() {
    const code = document.getElementById("roomCode").value.trim();
    if (!code) return alert("Escribe un código");
    saveToLocalStorage();
    window.location.href = "lobby.html?room=" + code;
}