const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
app.use(express.static("public"))
const PORT = 3000
http.listen(PORT, () => console.log("🚀  http://localhost:" + PORT))

let rooms = {}

// ─── ARENA ───────────────────────────────────────────────────────
const W = 1600, H = 820
const WALL_T = 55, WALL_B = H - 55, WALL_L = 55, WALL_R = W - 55
const GOAL_W = 40, GOAL_H = 200, GOAL_CY = H / 2
const GOAL_L = { x: WALL_L - GOAL_W, y: GOAL_CY - GOAL_H/2, w: GOAL_W, h: GOAL_H }
const GOAL_R = { x: WALL_R,          y: GOAL_CY - GOAL_H/2, w: GOAL_W, h: GOAL_H }
const BALL_R = 24, CAR_R = 22

// ─── BOOST PADS ──────────────────────────────────────────────────
const PADS_TMPL = [
    { x:180,      y:180,    type:"big",   value:100 },
    { x:W-180,    y:180,    type:"big",   value:100 },
    { x:180,      y:H-180,  type:"big",   value:100 },
    { x:W-180,    y:H-180,  type:"big",   value:100 },
    { x:W/2,      y:H/2,    type:"big",   value:100 },
    { x:W/2,      y:160,    type:"small", value:25  },
    { x:W/2,      y:H-160,  type:"small", value:25  },
    { x:160,      y:H/2,    type:"small", value:25  },
    { x:W-160,    y:H/2,    type:"small", value:25  },
    { x:W*0.3,    y:H*0.3,  type:"small", value:25  },
    { x:W*0.7,    y:H*0.3,  type:"small", value:25  },
    { x:W*0.3,    y:H*0.7,  type:"small", value:25  },
    { x:W*0.7,    y:H*0.7,  type:"small", value:25  },
]

// ─── PHYSICS ─────────────────────────────────────────────────────
const DT          = 1/60
const ACCEL       = 900
const FRICTION    = 0.88
const MAX_SPD     = 580
const BOOST_ACCEL = 1400
const BOOST_MAX   = 860
const BOOST_DRAIN = 38
const BOOST_REGEN = 9
// Dash — reduced from 3.2× to 2.0× for more control
const DASH_SPEED  = MAX_SPD * 2.0   // ~1160 px/s
const DASH_DUR    = 0.18            // shorter burst
const DASH_CD     = 1.2             // cooldown in seconds

// ─── SPAWN POSITIONS ─────────────────────────────────────────────
// Blue spawns left side, orange spawns right side
function spawnPos(team, index, total) {
    const side  = team === "blue" ? WALL_L + 160 : WALL_R - 160
    const span  = 200
    const step  = total > 1 ? span / (total - 1) : 0
    const yBase = H/2 - span/2 + index * step
    return { x: side, y: yBase }
}

function makeCode() {
    return Array.from({length:5}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]).join("")
}

function makePlayer(id, data) {
    const team = data.team || "blue"
    return {
        id, team,
        name: data.name||"Jugador", title: data.title||"ROOKIE",
        titleColor: data.titleColor||"#aaa",
        pfp: data.pfp||"assets/default_pfp.png",
        banner: data.banner||"assets/banners/Default.png",
        decal: data.decal||null,
        boostTrail: data.boostTrail||null,
        x: team==="blue" ? WALL_L+160 : WALL_R-160,
        y: H/2,
        vx:0, vy:0, boost:33,
        dashing:false, dashTimer:0, dashCd:0,
        dashVx:0, dashVy:0,
        input:{}, lastSeq:0
    }
}

function resetPlayers(room) {
    const blues   = room.players.filter(p=>p.team==="blue")
    const oranges = room.players.filter(p=>p.team==="orange")
    blues.forEach((p,i)=>{ const sp=spawnPos("blue",   i,blues.length);   p.x=sp.x;p.y=sp.y;p.vx=0;p.vy=0;p.dashing=false;p.dashTimer=0 })
    oranges.forEach((p,i)=>{ const sp=spawnPos("orange",i,oranges.length); p.x=sp.x;p.y=sp.y;p.vx=0;p.vy=0;p.dashing=false;p.dashTimer=0 })
}

function makeRoom() {
    return {
        players:   [],
        ball:      { x:W/2, y:H/2, vx:0, vy:0, spin:0 },
        pads:      PADS_TMPL.map(p=>({...p,active:true,timer:0})),
        scores:    { blue:0, orange:0 },
        matchTime: 300,
        phase:     "kickoffCountdown",  // kickoffCountdown | playing | goal | over
        kickoffTimer: 3,
        settings: {
            blueTeamName:   "BLUE",
            orangeTeamName: "ORANGE",
            blueColor:      "#00aaff",
            orangeColor:    "#ff6600",
            seriesTitle:    "FRIENDLY MATCH",
            gameNum:        1,
            bestOf:         7
        }
    }
}

// ─── SOCKETS ─────────────────────────────────────────────────────
io.on("connection", socket => {
    socket.on("createRoom", () => {
        const code = makeCode()
        rooms[code] = makeRoom()
        socket.join(code)
        socket.emit("roomCreated", code)
    })
    socket.on("joinLobby", data => {
        const room = rooms[data.room]
        if(!room) return socket.emit("roomError","Sala no encontrada")
        socket.join(data.room)
        if(!room.players.find(p=>p.id===socket.id))
            room.players.push(makePlayer(socket.id, data))
        io.to(data.room).emit("lobbyUpdate", { players:room.players, settings:room.settings })
    })
    socket.on("joinTeam", ({room:code,team}) => {
        const room = rooms[code]; if(!room) return
        const p = room.players.find(p=>p.id===socket.id)
        if(p) p.team = team
        io.to(code).emit("lobbyUpdate", { players:room.players, settings:room.settings })
    })
    socket.on("updateSettings", ({room:code, settings}) => {
        const room = rooms[code]; if(!room) return
        Object.assign(room.settings, settings)
        io.to(code).emit("lobbyUpdate", { players:room.players, settings:room.settings })
    })
    socket.on("joinGame", data => {
        const room = rooms[data.room]; if(!room) return
        socket.join(data.room)
        let p = room.players.find(p=>p.id===socket.id)
        if(!p){ p=makePlayer(socket.id,data); room.players.push(p) }
        else Object.assign(p, {
            name:data.name||p.name, title:data.title||p.title,
            titleColor:data.titleColor||p.titleColor,
            pfp:data.pfp||p.pfp, banner:data.banner||p.banner,
            decal:data.decal||p.decal, boostTrail:data.boostTrail||p.boostTrail
        })
        io.to(data.room).emit("playerInfoUpdate", { players:room.players, settings:room.settings })
    })
    socket.on("move", input => {
        for(const code in rooms){
            const p = rooms[code].players.find(p=>p.id===socket.id)
            if(p){ p.lastSeq=input.seq||0; p.input=input }
        }
    })
    socket.on("disconnect", () => {
        for(const code in rooms){
            rooms[code].players = rooms[code].players.filter(p=>p.id!==socket.id)
            io.to(code).emit("playerInfoUpdate", { players:rooms[code].players, settings:rooms[code].settings })
        }
    })
})

// ─── PHYSICS LOOP ────────────────────────────────────────────────
setInterval(() => {
    const dt = DT
    for(const code in rooms){
        const room = rooms[code]

        // ── KICKOFF COUNTDOWN ────────────────────────────────────
        if(room.phase === "kickoffCountdown"){
            room.kickoffTimer -= dt
            if(room.kickoffTimer <= 0){
                room.phase = "playing"
                room.kickoffTimer = 0
            }
            // Send countdown state (players frozen, ball at centre)
            io.to(code).emit("state", buildState(room, code))
            continue
        }

        if(room.phase !== "playing") continue

        // ── PLAYERS ─────────────────────────────────────────────
        room.players.forEach(p => {
            const inp = p.input||{}
            const isBoosting = !!(inp.shift && p.boost>0)

            if(isBoosting) p.boost = Math.max(0,   p.boost - BOOST_DRAIN*dt)
            else            p.boost = Math.min(100, p.boost + BOOST_REGEN*dt)

            if(p.dashCd > 0) p.dashCd -= dt

            if(inp.dash && !p.dashing && p.dashCd<=0){
                let dx=(inp.d?1:0)-(inp.a?1:0), dy=(inp.s?1:0)-(inp.w?1:0)
                const len=Math.hypot(dx,dy)
                if(len < 0.1){ dx=p.vx; dy=p.vy }
                const dl=Math.hypot(dx,dy)||1
                p.dashVx=(dx/dl)*DASH_SPEED; p.dashVy=(dy/dl)*DASH_SPEED
                p.dashing=true; p.dashTimer=DASH_DUR; p.dashCd=DASH_CD
            }

            if(p.dashing){
                const t = p.dashTimer / DASH_DUR
                p.vx = p.dashVx * t; p.vy = p.dashVy * t
                p.dashTimer -= dt; if(p.dashTimer<=0) p.dashing=false
            } else {
                if(inp.w) p.vy -= ACCEL*dt; if(inp.s) p.vy += ACCEL*dt
                if(inp.a) p.vx -= ACCEL*dt; if(inp.d) p.vx += ACCEL*dt
                if(isBoosting){
                    const mx=(inp.d?1:0)-(inp.a?1:0), my=(inp.s?1:0)-(inp.w?1:0)
                    const ml=Math.hypot(mx,my)||1
                    if(ml>0.1){ p.vx+=(mx/ml)*BOOST_ACCEL*dt; p.vy+=(my/ml)*BOOST_ACCEL*dt }
                }
                p.vx*=Math.pow(FRICTION,dt*60); p.vy*=Math.pow(FRICTION,dt*60)
                const maxS=isBoosting?BOOST_MAX:MAX_SPD, spd=Math.hypot(p.vx,p.vy)
                if(spd>maxS){ p.vx=p.vx/spd*maxS; p.vy=p.vy/spd*maxS }
            }
            p.x+=p.vx*dt; p.y+=p.vy*dt
            if(p.x-CAR_R<WALL_L){ p.x=WALL_L+CAR_R; p.vx=Math.abs(p.vx)*0.4 }
            if(p.x+CAR_R>WALL_R){ p.x=WALL_R-CAR_R; p.vx=-Math.abs(p.vx)*0.4 }
            if(p.y-CAR_R<WALL_T){ p.y=WALL_T+CAR_R; p.vy=Math.abs(p.vy)*0.4 }
            if(p.y+CAR_R>WALL_B){ p.y=WALL_B-CAR_R; p.vy=-Math.abs(p.vy)*0.4 }
            room.pads.forEach(pad=>{
                if(pad.active && Math.hypot(p.x-pad.x,p.y-pad.y)<40){
                    p.boost=Math.min(100,p.boost+pad.value)
                    pad.active=false; pad.timer=pad.type==="big"?600:240
                }
            })
        })

        room.pads.forEach(pad=>{ if(!pad.active&&--pad.timer<=0) pad.active=true })

        // ── BALL ─────────────────────────────────────────────────
        const b = room.ball
        b.vx*=Math.pow(0.9985,dt*60); b.vy*=Math.pow(0.9985,dt*60)
        b.spin*=Math.pow(0.990,dt*60)
        b.x+=b.vx*dt; b.y+=b.vy*dt

        if(b.x-BALL_R < WALL_L){
            const inG = b.y>GOAL_L.y && b.y<GOAL_L.y+GOAL_L.h
            if(inG && b.x+BALL_R < GOAL_L.x){ handleGoal(room,code,"orange"); continue }
            else if(!inG){ b.x=WALL_L+BALL_R; b.vx=Math.abs(b.vx)*0.72; b.spin=-b.spin*0.5 }
        }
        if(b.x+BALL_R > WALL_R){
            const inG = b.y>GOAL_R.y && b.y<GOAL_R.y+GOAL_R.h
            if(inG && b.x-BALL_R > GOAL_R.x+GOAL_R.w){ handleGoal(room,code,"blue"); continue }
            else if(!inG){ b.x=WALL_R-BALL_R; b.vx=-Math.abs(b.vx)*0.72; b.spin=-b.spin*0.5 }
        }
        if(b.y-BALL_R<WALL_T){ b.y=WALL_T+BALL_R; b.vy=Math.abs(b.vy)*0.72 }
        if(b.y+BALL_R>WALL_B){ b.y=WALL_B-BALL_R; b.vy=-Math.abs(b.vy)*0.72 }

        room.players.forEach(p=>{
            const dx=b.x-p.x, dy=b.y-p.y, dist=Math.hypot(dx,dy), minD=BALL_R+CAR_R
            if(dist<minD && dist>0.01){
                const nx=dx/dist, ny=dy/dist
                b.x+=nx*(minD-dist); b.y+=ny*(minD-dist)*0.5
                const rvx=b.vx-p.vx, rvy=b.vy-p.vy, relV=rvx*nx+rvy*ny
                if(relV<0){
                    const cspd=Math.hypot(p.vx,p.vy)
                    const imp=Math.max(200, -(1.5)*relV + cspd*0.85)
                    b.vx+=nx*imp; b.vy+=ny*imp; b.spin+=nx*imp*0.05
                }
            }
        })

        // ── MATCH TIMER ──────────────────────────────────────────
        room.matchTime -= dt
        if(room.matchTime<=0){
            room.matchTime=0; room.phase="over"
            io.to(code).emit("gameOver", room.scores)
        }

        io.to(code).emit("state", buildState(room, code))
    }
}, 1000/60)

function buildState(room, code) {
    return {
        players: room.players.map(p=>({
            id:p.id, x:Math.round(p.x), y:Math.round(p.y),
            vx:+p.vx.toFixed(1), vy:+p.vy.toFixed(1),
            boost:Math.floor(p.boost), dashing:p.dashing,
            dashTimer:+(p.dashTimer||0).toFixed(3),
            dashCd:+(p.dashCd||0).toFixed(2),
            isBoosting:!!(p.input.shift&&p.boost>0),
            seq:p.lastSeq||0,
            decal:p.decal||null, boostTrail:p.boostTrail||null
        })),
        ball:{ x:Math.round(room.ball.x), y:Math.round(room.ball.y), spin:+room.ball.spin.toFixed(2) },
        pads:room.pads.map(p=>({active:p.active})),
        scores:room.scores, matchTime:Math.ceil(room.matchTime),
        settings:room.settings,
        phase:room.phase, kickoffTimer:Math.ceil(room.kickoffTimer||0)
    }
}

function handleGoal(room, code, scorer) {
    room.phase = "goal"
    room.scores[scorer]++
    io.to(code).emit("goal", { scorer, scores:room.scores, settings:room.settings })

    setTimeout(() => {
        // Increment gameNum after each goal (new game)
        room.settings.gameNum = (room.settings.gameNum||1) + 1
        resetPlayers(room)
        room.ball = { x:W/2, y:H/2, vx:0, vy:0, spin:0 }
        room.pads.forEach(p=>{ p.active=true; p.timer=0 })
        room.matchTime = 300
        room.phase = "kickoffCountdown"
        room.kickoffTimer = 3
        io.to(code).emit("kickoff", { scores:room.scores, settings:room.settings })
    }, 3000)
}
