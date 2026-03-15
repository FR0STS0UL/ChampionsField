const socket = io()

const SPECIAL_TITLES = {
    "Frost":  { title:"DEVELOPER",   color:"#ff2222" },
    "Matias": { title:"GOAT",         color:"#00ff66" },
    "Tester": { title:"BETA TESTER",  color:"#55ffff" },
}

let player = {
    name:"Jugador", title:"ROOKIE", titleColor:"#aaaaaa",
    pfp:"assets/default_pfp.png", banner:"assets/banners/Default.png",
    decal:null, boostTrail:null,
    team:"blue"
}

const saved = JSON.parse(localStorage.getItem("playerData")||"null")
if(saved){ player={...player,...saved}; applyLoaded() }

function applyLoaded(){
    if(player.name)   document.getElementById("username").value = player.name
    if(player.banner){
        const file=player.banner.split("/").pop()
        const sel=document.getElementById("banner-select")
        for(let i=0;i<sel.options.length;i++) if(sel.options[i].value===file){sel.selectedIndex=i;break}
    }
    if(player.decal){
        const sel=document.getElementById("decal-select")
        for(let i=0;i<sel.options.length;i++) if(sel.options[i].value===player.decal){sel.selectedIndex=i;break}
    }
    if(player.boostTrail){
        const sel=document.getElementById("boost-select")
        for(let i=0;i<sel.options.length;i++) if(sel.options[i].value===player.boostTrail){sel.selectedIndex=i;break}
    }
    if(player.pfp&&player.pfp.startsWith("data:")) document.getElementById("pfp-preview").src=player.pfp
    renderPreview()
}

document.getElementById("pfp-input").addEventListener("change",e=>{
    const r=new FileReader(); r.onload=()=>{player.pfp=r.result;document.getElementById("pfp-preview").src=r.result}
    r.readAsDataURL(e.target.files[0])
})

function checkSpecialTitle(){
    const name=document.getElementById("username").value.trim()
    const sel=document.getElementById("player-title")
    if(SPECIAL_TITLES[name]){ player.title=SPECIAL_TITLES[name].title; player.titleColor=SPECIAL_TITLES[name].color; sel.disabled=true }
    else { sel.disabled=false; updateTitlePreview() }
    renderPreview()
}
function updateTitlePreview(){
    const [name,color]=document.getElementById("player-title").value.split("|")
    player.title=name; player.titleColor=color; renderPreview()
}
function previewBanner(){
    player.banner="assets/banners/"+document.getElementById("banner-select").value; renderPreview()
}
function previewDecal(){
    const v=document.getElementById("decal-select").value
    player.decal=v||null
    const prev=document.getElementById("decal-preview")
    prev.style.display=v?"block":"none"
    if(v) prev.src=`assets/decals/${v}`
}
function previewBoost(){
    const v=document.getElementById("boost-select").value
    player.boostTrail=v||null
    const prev=document.getElementById("boost-preview")
    prev.style.display=v?"block":"none"
    if(v) prev.src=`assets/boost/${v}`
}
function renderPreview(){
    document.getElementById("title-preview").innerText=player.title
    document.getElementById("title-preview").style.color=player.titleColor
    document.getElementById("banner-preview-img").src=player.banner
}

function saveToLocalStorage(team=player.team||"blue"){
    player.name=document.getElementById("username").value.trim()||"Jugador"
    player.team=team
    localStorage.setItem("playerData",JSON.stringify(player))
}

function createRoom(){ saveToLocalStorage(); socket.emit("createRoom") }
socket.on("roomCreated",code=>{ window.location.href="lobby.html?room="+code })
function joinRoom(){
    const code=document.getElementById("roomCode").value.trim().toUpperCase()
    if(!code) return alert("Escribe un código de sala")
    saveToLocalStorage(); window.location.href="lobby.html?room="+code
}
