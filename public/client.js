// ═══════════════════════════════════════════════════════════════
//  ROCKET HAX — CLIENT.JS
//  Runs in every NON-HOST browser.
//  • Connects to host via WebRTC DataChannel
//  • Sends input to host ~60fps
//  • Receives authoritative state and passes to renderer
//  • Runs client-side prediction for the local player
// ═══════════════════════════════════════════════════════════════

const RTC_CONFIG={
    iceServers:[
        {urls:"stun:stun.l.google.com:19302"},
        {urls:"stun:stun1.l.google.com:19302"},
    ]
}

let _pc=null, _dc=null
let _sigSocket=null, _hostId=null
let _myId=null

// ─── CONNECT TO HOST ─────────────────────────────────────────────
async function clientConnect(hostId, sigSocket, myId){
    _hostId=hostId; _sigSocket=sigSocket; _myId=myId

    _pc=new RTCPeerConnection(RTC_CONFIG)

    // DataChannel will be created BY the host — we receive it here
    _pc.ondatachannel=e=>{
        _dc=e.channel
        _dc.onopen=()=>{ console.log("DataChannel open to host"); onClientConnected() }
        _dc.onmessage=e=>{ try{ onHostMessage(JSON.parse(e.data)) }catch{} }
        _dc.onclose=()=>{ console.warn("DataChannel closed"); onClientDisconnected() }
    }

    _pc.onicecandidate=e=>{
        if(e.candidate) sigSocket.emit("rtc:ice",{to:hostId,candidate:e.candidate})
    }

    // Host will send us an offer — we wait for it via "rtc:offer" signaling event
}

async function onRtcOffer(from, offer){
    if(from!==_hostId) return
    await _pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer=await _pc.createAnswer()
    await _pc.setLocalDescription(answer)
    _sigSocket.emit("rtc:answer",{to:_hostId,answer})
}

function onRtcIce(from, candidate){
    if(from!==_hostId) return
    _pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{})
}

// ─── SEND INPUT TO HOST ───────────────────────────────────────────
let _inputSeq=0
function clientSendInput(inp){
    if(!_dc||_dc.readyState!=="open") return
    _inputSeq++
    _dc.send(JSON.stringify({type:"input",input:inp,seq:_inputSeq}))
}

// ─── RECEIVE MESSAGES FROM HOST ───────────────────────────────────
function onHostMessage(msg){
    switch(msg.type){
        case "init":
            // Host sends full player list + settings on connect
            if(typeof onGameInit==="function") onGameInit(msg)
            break
        case "state":
            if(typeof onStateUpdate==="function") onStateUpdate(msg)
            break
        case "goal":
        case "kickoff":
        case "gameOver":
            if(typeof onGameEvent==="function") onGameEvent(msg)
            break
    }
}

// Called when DataChannel opens — start sending input
function onClientConnected(){
    setInterval(()=>{
        if(typeof getInput==="function") clientSendInput(getInput())
    },1000/60)
}

function onClientDisconnected(){
    // game.html will handle showing a disconnect screen
    if(typeof onGameEvent==="function") onGameEvent({type:"hostDisconnected"})
}

// ─── INPUT BUFFER for client-side prediction ─────────────────────
const _inputBuf=[]
function clientBufferInput(inp,seq){
    _inputBuf.push({seq,inp,dt:1/60})
    if(_inputBuf.length>120) _inputBuf.shift()
}
function clientGetInputBuf(){ return _inputBuf }
