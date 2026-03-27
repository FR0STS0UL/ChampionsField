// ═══════════════════════════════════════════════════════════════
//  CHAMPIONS FIELD — Server  (socket.io + server-side physics)
// ═══════════════════════════════════════════════════════════════
const express = require("express")
const app  = express()
const http = require("http").createServer(app)
const io   = require("socket.io")(http, {
    cors:{ origin:"*" }, pingInterval:10000, pingTimeout:25000
})
app.use(express.static("public"))
const PORT = process.env.PORT || 3000
http.listen(PORT, () => console.log("Champions Field :" + PORT))

// ─── CONSTANTS ───────────────────────────────────────────────────
const W=1600,H=820,WALL_T=55,WALL_B=H-55,WALL_L=55,WALL_R=W-55
const GOAL_W=40,GOAL_H=200,GOAL_CY=H/2
const GOAL_L={x:WALL_L-GOAL_W,y:GOAL_CY-GOAL_H/2,w:GOAL_W,h:GOAL_H}
const GOAL_R={x:WALL_R,y:GOAL_CY-GOAL_H/2,w:GOAL_W,h:GOAL_H}
const BALL_R=24,CAR_R=22,DT=1/60
const ACCEL=380,FRICTION=0.972,MAX_SPD=280
const BOOST_ACCEL=700,BOOST_MAX=480,BOOST_DRAIN=38
const DASH_SPEED=MAX_SPD*1.3,DASH_DUR=0.16,DASH_CD=1.0
const PADS=[
    {x:180,y:180,type:"big",value:100},{x:W-180,y:180,type:"big",value:100},
    {x:180,y:H-180,type:"big",value:100},{x:W-180,y:H-180,type:"big",value:100},
    {x:W/2,y:H/2,type:"big",value:100},
    {x:W/2,y:160,type:"small",value:25},{x:W/2,y:H-160,type:"small",value:25},
    {x:160,y:H/2,type:"small",value:25},{x:W-160,y:H/2,type:"small",value:25},
    {x:W*.3,y:H*.3,type:"small",value:25},{x:W*.7,y:H*.3,type:"small",value:25},
    {x:W*.3,y:H*.7,type:"small",value:25},{x:W*.7,y:H*.7,type:"small",value:25},
]

// ─── LUCKY BLOCKS (RUMBLE) ───────────────────────────────────────
const LUCKY_BLOCKS=[
    {id:0, x:W*0.25, y:WALL_T+55},   // top-left area
    {id:1, x:W*0.75, y:WALL_T+55},   // top-right area
    {id:2, x:W*0.25, y:WALL_B-55},   // bottom-left area
    {id:3, x:W*0.75, y:WALL_B-55},   // bottom-right area
]
const POWERS=["freeze","punch","plunger","spikes"]
const LB_RESPAWN=15  // seconds

const rooms = {}

function makeCode(){
    return Array.from({length:5},()=>"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]).join("")
}
function spawnPos(team,idx,total){
    const x=team==="blue"?WALL_L+160:WALL_R-160
    const span=200,step=total>1?span/(total-1):0
    return {x,y:H/2-span/2+idx*step}
}
function makePlayer(id,d){
    const team=d.team||"blue"
    return {
        id, team,
        name:d.name||"Jugador", title:d.title||"ROOKIE",
        titleColor:d.titleColor||"#aaa",
        pfp:d.pfp||"assets/default_pfp.png",
        banner:d.banner||"assets/banners/Default.png",
        decal:d.decal||null, boostTrail:d.boostTrail||null,
        x:team==="blue"?WALL_L+160:WALL_R-160, y:H/2,
        vx:0,vy:0,
        boost:33,dashing:false,dashTimer:0,dashCd:0,dashVx:0,dashVy:0,
        power:null,powerCd:0,spikes:false,spikeTimer:0,
        input:{},lastSeq:0
    }
}
function makeRoom(){
    return {
        players:[],
        ball:{x:W/2,y:H/2,vx:0,vy:0,spin:0},
        pads:PADS.map(p=>({...p,active:true,timer:0})),
        scores:{blue:0,orange:0}, matchTime:300,
        luckyBlocks:LUCKY_BLOCKS.map(b=>({...b,active:true,timer:0})),
        phase:"lobby", kickoffTimer:3, overtime:false,
        lastTouch:{blue:null,orange:null},
        settings:{
            blueTeamName:"BLUE",orangeTeamName:"ORANGE",
            blueColor:"#00aaff",orangeColor:"#ff6600",
            seriesTitle:"CHAMPIONS FIELD",gameNum:1,bestOf:7
        }
    }
}
function reposition(room){
    const bl=room.players.filter(p=>p.team==="blue")
    const or=room.players.filter(p=>p.team==="orange")
    bl.forEach((p,i)=>{const s=spawnPos("blue",i,bl.length);p.x=s.x;p.y=s.y;p.vx=0;p.vy=0})
    or.forEach((p,i)=>{const s=spawnPos("orange",i,or.length);p.x=s.x;p.y=s.y;p.vx=0;p.vy=0})
}

// ─── SOCKETS ─────────────────────────────────────────────────────
io.on("connection", socket => {

    // joinLobby creates the room if it doesn't exist (host) or joins it (client)
    // No separate createRoom needed — eliminates the socket-disconnect timing bug
    socket.on("joinLobby", (data) => {
        const code       = data.room
        const playerData = { ...data }
        delete playerData.room

        // Create room on first join
        if(!rooms[code]) rooms[code] = makeRoom()
        const room = rooms[code]

        socket.join(code)
        socket.roomCode = code

        if(!room.players.find(p=>p.id===socket.id)){
            room.players.push(makePlayer(socket.id, playerData))
        }

        socket.emit("lobbyJoined",{
            myId:socket.id,
            players:room.players,
            settings:room.settings,
            phase:room.phase
        })
        io.to(code).emit("lobbyUpdate",{players:room.players,settings:room.settings})
    })

    socket.on("joinTeam",({room:code,team})=>{
        const room=rooms[code];if(!room)return
        const p=room.players.find(p=>p.id===socket.id);if(p)p.team=team
        io.to(code).emit("lobbyUpdate",{players:room.players,settings:room.settings})
    })

    socket.on("updateSettings",({room:code,settings})=>{
        const room=rooms[code];if(!room)return
        Object.assign(room.settings,settings)
        io.to(code).emit("lobbyUpdate",{players:room.players,settings:room.settings})
    })

    socket.on("input",({seq,input})=>{
        for(const code in rooms){
            const p=rooms[code].players.find(p=>p.id===socket.id)
            if(p){p.input=input;p.lastSeq=seq}
        }
    })

    socket.on("startGame",({room:code})=>{
        const room=rooms[code];if(!room)return
        reposition(room)
        room.ball={x:W/2,y:H/2,vx:0,vy:0,spin:0}
        room.pads.forEach(p=>{p.active=true;p.timer=0})
        room.matchTime=300;room.phase="kickoffCountdown";room.kickoffTimer=3
        room.scores={blue:0,orange:0};room.overtime=false;room._otTimer=0
        room.lastTouch={blue:null,orange:null}
        room.luckyBlocks.forEach(b=>{b.active=true;b.timer=0})
        room.players.forEach(p=>{p.power=null;p.powerCd=0;p.spikes=false;p.spikeTimer=0})
        io.to(code).emit("gameStarted",{players:room.players,settings:room.settings})
    })

    socket.on("disconnect",()=>{
        const code=socket.roomCode
        if(!code||!rooms[code])return
        const room=rooms[code]
        room.players=room.players.filter(p=>p.id!==socket.id)
        io.to(code).emit("lobbyUpdate",{players:room.players,settings:room.settings})
        // Clean up empty lobby rooms after a delay (allow reconnects)
        if(room.players.length===0 && room.phase==="lobby"){
            setTimeout(()=>{
                if(rooms[code]&&rooms[code].players.length===0) delete rooms[code]
            },15000)
        }
    })
})

// ─── PHYSICS LOOP ────────────────────────────────────────────────
setInterval(()=>{
    for(const code in rooms){
        const room=rooms[code]
        const dt=DT

        if(room.phase==="kickoffCountdown"){
            room.kickoffTimer-=dt
            if(room.kickoffTimer<=0){room.phase="playing";room.kickoffTimer=0}
            io.to(code).emit("state",buildState(room));continue
        }
        if(room.phase!=="playing")continue

        room.players.forEach(p=>{
            const inp=p.input||{}
            const boosting=!!(inp.shift&&p.boost>0)
            if(boosting)p.boost=Math.max(0,p.boost-BOOST_DRAIN*dt)
            if(p.dashCd>0)p.dashCd-=dt

            if(inp.dash&&!p.dashing&&p.dashCd<=0){
                let dx=(inp.d?1:0)-(inp.a?1:0),dy=(inp.s?1:0)-(inp.w?1:0)
                if(Math.hypot(dx,dy)<0.1){dx=p.vx;dy=p.vy}
                const dl=Math.hypot(dx,dy)||1
                p.dashVx=(dx/dl)*DASH_SPEED;p.dashVy=(dy/dl)*DASH_SPEED
                p.dashing=true;p.dashTimer=DASH_DUR;p.dashCd=DASH_CD
            }
            if(p.dashing){
                // Keep full dash velocity during dash, then exit with momentum
                p.vx=p.dashVx;p.vy=p.dashVy
                p.dashTimer-=dt
                if(p.dashTimer<=0){
                    p.dashing=false
                    // Exit velocity = 60% of dash speed so there's momentum
                    p.vx=p.dashVx*0.6;p.vy=p.dashVy*0.6
                }
            } else {
                if(inp.w)p.vy-=ACCEL*dt;if(inp.s)p.vy+=ACCEL*dt
                if(inp.a)p.vx-=ACCEL*dt;if(inp.d)p.vx+=ACCEL*dt
                if(boosting){
                    const mx=(inp.d?1:0)-(inp.a?1:0),my=(inp.s?1:0)-(inp.w?1:0),ml=Math.hypot(mx,my)||1
                    if(ml>0.1){p.vx+=(mx/ml)*BOOST_ACCEL*dt;p.vy+=(my/ml)*BOOST_ACCEL*dt}
                }
                p.vx*=Math.pow(FRICTION,dt*60);p.vy*=Math.pow(FRICTION,dt*60)
                const maxS=boosting?BOOST_MAX:MAX_SPD,spd=Math.hypot(p.vx,p.vy)
                if(spd>maxS){p.vx=p.vx/spd*maxS;p.vy=p.vy/spd*maxS}
            }
            p.x+=p.vx*dt;p.y+=p.vy*dt
            if(p.x-CAR_R<WALL_L){p.x=WALL_L+CAR_R;p.vx=Math.abs(p.vx)*0.4}
            if(p.x+CAR_R>WALL_R){p.x=WALL_R-CAR_R;p.vx=-Math.abs(p.vx)*0.4}
            if(p.y-CAR_R<WALL_T){p.y=WALL_T+CAR_R;p.vy=Math.abs(p.vy)*0.4}
            if(p.y+CAR_R>WALL_B){p.y=WALL_B-CAR_R;p.vy=-Math.abs(p.vy)*0.4}
            room.pads.forEach(pad=>{
                if(pad.active&&Math.hypot(p.x-pad.x,p.y-pad.y)<40){
                    p.boost=Math.min(100,p.boost+pad.value)
                    pad.active=false;pad.timer=pad.type==="big"?600:240
                }
            })
        })
        room.pads.forEach(pad=>{if(!pad.active&&--pad.timer<=0)pad.active=true})

        // Lucky blocks
        room.luckyBlocks.forEach(lb=>{
            if(!lb.active){lb.timer-=dt*60;if(lb.timer<=0)lb.active=true;return}
            room.players.forEach(p=>{
                if(Math.hypot(p.x-lb.x,p.y-lb.y)<30){
                    lb.active=false; lb.timer=LB_RESPAWN*60
                    if(!p.power){
                        p.power=POWERS[Math.floor(Math.random()*POWERS.length)]
                        p._prevPower=false
                        p.powerCd=0  // clear any leftover cooldown
                        io.to(code).emit("powerPickup",{pid:p.id,power:p.power})
                    }
                }
            })
        })

        // Power use — 'e' key, edge-detect so holding E doesn't re-fire
        room.players.forEach(p=>{
            const inp=p.input||{}
            const powerPressed=!!inp.power
            if(powerPressed&&!p._prevPower&&p.power&&!p.powerCd){
                usePower(room,code,p)
            }
            p._prevPower=powerPressed
            if(p.powerCd>0)p.powerCd-=dt
            // Spikes timer
            if(p.spikes){
                p.spikeTimer-=dt
                if(p.spikeTimer<=0){p.spikes=false;io.to(code).emit("spikesEnd",{pid:p.id})}
            }
        })

        const b=room.ball
        // Frozen ball
        if(b.frozen){
            b._frozenTimer-=dt; b.vx=0; b.vy=0
            if(b._frozenTimer<=0){b.frozen=false;io.to(code).emit("freezeEnd",{})}
        } else {
            b.vx*=Math.pow(0.9940,dt*60);b.vy*=Math.pow(0.9940,dt*60)
        }

        // Plunger — pull ball toward player
        if(b._plungerPid){
            b._plungerTimer-=dt
            const puller=room.players.find(p=>p.id===b._plungerPid)
            if(puller&&b._plungerTimer>0){
                const dx=puller.x-b.x,dy=puller.y-b.y,dist=Math.hypot(dx,dy)||1
                const pull=Math.min(2800*dt, dist)
                b.vx+=(dx/dist)*pull/dt*0.18
                b.vy+=(dy/dist)*pull/dt*0.18
                // Cap speed during pull
                const spd=Math.hypot(b.vx,b.vy)
                if(spd>900){b.vx=b.vx/spd*900;b.vy=b.vy/spd*900}
                io.to(code).emit("plungerPull",{bx:b.x,by:b.y,px:puller.x,py:puller.y})
            } else {
                b._plungerPid=null
            }
        }

        // Spikes — ball sticks to player
        const spikedPlayer=room.players.find(p=>p.spikes&&p._spikedBall)
        if(spikedPlayer){
            b.x=spikedPlayer.x+spikedPlayer._spikeOffX
            b.y=spikedPlayer.y+spikedPlayer._spikeOffY
            b.vx=spikedPlayer.vx; b.vy=spikedPlayer.vy
            b.frozen=false
        }
        b.spin*=Math.pow(0.990,dt*60);b.x+=b.vx*dt;b.y+=b.vy*dt

        if(b.x-BALL_R<WALL_L){
            const inG=b.y>GOAL_L.y&&b.y<GOAL_L.y+GOAL_L.h
            if(inG&&b.x+BALL_R<GOAL_L.x){handleGoal(room,code,"orange");continue}
            else if(!inG){b.x=WALL_L+BALL_R;b.vx=Math.abs(b.vx)*0.52;b.spin=-b.spin*0.4}
        }
        if(b.x+BALL_R>WALL_R){
            const inG=b.y>GOAL_R.y&&b.y<GOAL_R.y+GOAL_R.h
            if(inG&&b.x-BALL_R>GOAL_R.x+GOAL_R.w){handleGoal(room,code,"blue");continue}
            else if(!inG){b.x=WALL_R-BALL_R;b.vx=-Math.abs(b.vx)*0.52;b.spin=-b.spin*0.4}
        }
        if(b.y-BALL_R<WALL_T){b.y=WALL_T+BALL_R;b.vy=Math.abs(b.vy)*0.52}
        if(b.y+BALL_R>WALL_B){b.y=WALL_B-BALL_R;b.vy=-Math.abs(b.vy)*0.52}

        room.players.forEach(p=>{
            const dx=b.x-p.x,dy=b.y-p.y,dist=Math.hypot(dx,dy),minD=BALL_R+CAR_R
            if(dist<minD&&dist>0.01){
                const nx=dx/dist,ny=dy/dist
                // Spikes: if this player has spikes, ball sticks to them
                if(p.spikes&&!p._spikedBall){
                    p._spikedBall=true
                    p._spikeOffX=b.x-p.x; p._spikeOffY=b.y-p.y
                    b.frozen=false; b._plungerPid=null
                    io.to(code).emit("spikesAttach",{pid:p.id})
                }
                // Spikes: if another player hits the spiked player or ball, detach
                const spiked=room.players.find(q=>q.spikes&&q._spikedBall&&q.id!==p.id)
                if(spiked){
                    spiked.spikes=false; spiked._spikedBall=false; spiked.spikeTimer=0
                    io.to(code).emit("spikesDetach",{pid:spiked.id,byPid:p.id})
                }
                if(!p._spikedBall){
                    b.x+=nx*(minD-dist);b.y+=ny*(minD-dist)*0.5
                    const rvx=b.vx-p.vx,rvy=b.vy-p.vy,relV=rvx*nx+rvy*ny
                    if(relV<0){
                        const cspd=Math.min(Math.hypot(p.vx,p.vy), MAX_SPD*1.1)
                        const imp=Math.min(Math.max(200,-(1.4)*relV+cspd*0.6), 900)
                        b.vx+=nx*imp;b.vy+=ny*imp;b.spin+=nx*imp*0.05
                        room.lastTouch[p.team]=p.id
                        if(room.ball.frozen){room.ball.frozen=false;room.ball.vx=room.ball._frozenVx||0;room.ball.vy=room.ball._frozenVy||0}
                    }
                }
            }
        })

        // Player-player collision — also detaches spikes
        for(let i=0;i<room.players.length;i++){
            for(let j=i+1;j<room.players.length;j++){
                const a=room.players[i],bpl=room.players[j]
                const ddx=a.x-bpl.x,ddy=a.y-bpl.y,dd=Math.hypot(ddx,ddy),minD2=CAR_R*2
                if(dd<minD2&&dd>0.01){
                    // Detach spikes if either player is spiked
                    ;[a,bpl].forEach(q=>{
                        if(q.spikes&&q._spikedBall){
                            q.spikes=false;q._spikedBall=false;q.spikeTimer=0
                            io.to(code).emit("spikesDetach",{pid:q.id,byPid:(q===a?bpl:a).id})
                        }
                    })
                    // Bounce players apart
                    const nx2=ddx/dd,ny2=ddy/dd
                    const overlap=(minD2-dd)/2
                    a.x+=nx2*overlap;a.y+=ny2*overlap
                    bpl.x-=nx2*overlap;bpl.y-=ny2*overlap
                    const rv=(a.vx-bpl.vx)*nx2+(a.vy-bpl.vy)*ny2
                    if(rv<0){
                        const imp=rv*0.6
                        a.vx-=imp*nx2;a.vy-=imp*ny2
                        bpl.vx+=imp*nx2;bpl.vy+=imp*ny2
                    }
                }
            }
        }

        if(!room.overtime) room.matchTime-=dt
        if(room.overtime) room._otTimer=(room._otTimer||0)+dt
        if(room.matchTime<=0 && !room.overtime){
            room.matchTime=0
            if(room.scores.blue===room.scores.orange){
                // Tied — enter overtime
                room.overtime=true
                room.phase="kickoffCountdown"; room.kickoffTimer=3
                room.ball={x:W/2,y:H/2,vx:0,vy:0,spin:0}
                room.pads.forEach(p=>{p.active=true;p.timer=0})
                reposition(room)
                io.to(code).emit("overtime",{scores:room.scores,settings:room.settings})
            } else {
                room.phase="over"
                io.to(code).emit("gameOver",room.scores)
                setTimeout(()=>{
                    if(rooms[code]){
                        rooms[code].phase="lobby"; rooms[code].overtime=false
                        rooms[code].scores={blue:0,orange:0}; rooms[code].settings.gameNum=1
                        io.to(code).emit("lobbyUpdate",{players:rooms[code].players,settings:rooms[code].settings})
                    }
                },6000)
            }
        }
        io.to(code).emit("state",buildState(room))
    }
},1000/60)

function buildState(room){
    return {
        players:room.players.map(p=>({
            id:p.id,x:Math.round(p.x),y:Math.round(p.y),
            vx:+p.vx.toFixed(1),vy:+p.vy.toFixed(1),
            boost:Math.floor(p.boost),dashing:p.dashing,
            dashTimer:+(p.dashTimer||0).toFixed(3),
            dashCd:+(p.dashCd||0).toFixed(2),
            isBoosting:!!(p.input&&p.input.shift&&p.boost>0),
            seq:p.lastSeq||0,power:p.power||null,
            spikes:p.spikes||false,spikedBall:p._spikedBall||false
        })),
        ball:{x:Math.round(room.ball.x),y:Math.round(room.ball.y),spin:+room.ball.spin.toFixed(2)},
        pads:room.pads.map(p=>({active:p.active})),
        luckyBlocks:room.luckyBlocks.map(b=>({id:b.id,active:b.active})),
        ballFrozen:room.ball.frozen||false,
        scores:room.scores,matchTime:room.overtime?-Math.floor(room._otTimer||0):Math.ceil(room.matchTime),
        settings:room.settings,phase:room.phase,
        kickoffTimer:Math.ceil(room.kickoffTimer||0)
    }
}
function usePower(room,code,p){
    const power=p.power
    p.power=null; p.powerCd=0.5  // brief cooldown to prevent double-fire
    const b=room.ball

    if(power==="freeze"){
        b.frozen=true; b._frozenTimer=3.5  // freeze for 3.5s
        b._frozenVx=b.vx; b._frozenVy=b.vy
        b.vx=0;b.vy=0
        io.to(code).emit("powerUsed",{power:"freeze",pid:p.id})
    }
    else if(power==="punch"){
        // Launch ball from player toward ball direction at high speed
        const dx=b.x-p.x, dy=b.y-p.y, dist=Math.hypot(dx,dy)||1
        const nx=dx/dist, ny=dy/dist
        const spd=1400
        b.vx=nx*spd; b.vy=ny*spd
        b.frozen=false
        io.to(code).emit("powerUsed",{power:"punch",pid:p.id,px:p.x,py:p.y,tx:b.x,ty:b.y})
    }
    else if(power==="plunger"){
        // Pull ball toward player — Rocket League Rumble style
        b._plungerPid=p.id; b._plungerTimer=1.8
        b.frozen=false
        io.to(code).emit("powerUsed",{power:"plunger",pid:p.id,px:p.x,py:p.y,tx:b.x,ty:b.y})
    }
    else if(power==="spikes"){
        // Activate spikes — ball sticks on next contact
        p.spikes=true; p.spikeTimer=8; p._spikedBall=false
        io.to(code).emit("powerUsed",{power:"spikes",pid:p.id})
    }
}

function handleGoal(room,code,scorer){
    room.phase="goal"; room.scores[scorer]++
    room.settings.gameNum=(room.settings.gameNum||1)+1
    const frozenTime = room.matchTime
    const wasOvertime = room.overtime
    const scorerName=(room.players.find(p=>p.id===room.lastTouch[scorer])||{}).name||"Unknown"
    const scorerPfp=(room.players.find(p=>p.id===room.lastTouch[scorer])||{}).pfp||''
    io.to(code).emit("goal",{scorer,scores:room.scores,settings:room.settings,scorerName,scorerPfp,overtime:wasOvertime})
    setTimeout(()=>{
        if(wasOvertime){
            // Overtime goal = game over
            room.phase="over"; room.overtime=false
            io.to(code).emit("gameOver",room.scores)
            setTimeout(()=>{
                if(rooms[code]){
                    rooms[code].phase="lobby"; rooms[code].overtime=false
                    rooms[code].scores={blue:0,orange:0}; rooms[code].settings.gameNum=1
                    io.to(code).emit("lobbyUpdate",{players:rooms[code].players,settings:rooms[code].settings})
                }
            },6000)
        } else {
            reposition(room)
            room.ball={x:W/2,y:H/2,vx:0,vy:0,spin:0}
            room.pads.forEach(p=>{p.active=true;p.timer=0})
            room.matchTime=frozenTime
            room.phase="kickoffCountdown"; room.kickoffTimer=3
            io.to(code).emit("kickoff",{scores:room.scores,settings:room.settings})
        }
    },3000)
}
