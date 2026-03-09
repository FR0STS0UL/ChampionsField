const socket = io()

let selectedTeam = "red"

function selectTeam(team){

selectedTeam = team

document.getElementById("redBtn").style.opacity = team==="red" ? "1" : "0.5"
document.getElementById("blueBtn").style.opacity = team==="blue" ? "1" : "0.5"

}

function createPlayerData(){

const nameInput = document.getElementById("nameInput")
const titleInput = document.getElementById("titleInput")

const playerData = {

name: nameInput.value.trim() || "Jugador",
title: titleInput.value.trim() || "Rookie",
team: selectedTeam,
pfp: "/assets/default_pfp.png"

}

localStorage.setItem("playerData", JSON.stringify(playerData))

console.log("playerData creado:", playerData)

}

function createRoom(){

createPlayerData()

socket.emit("createRoom")

}

socket.on("roomCreated",(code)=>{

window.location.href = "/lobby.html?room=" + code

})

function joinRoom(){

createPlayerData()

const roomInput = document.getElementById("roomInput")
const code = roomInput.value.trim()

if(!code){
alert("Escribe un código de sala")
return
}

window.location.href = "/lobby.html?room=" + code

}