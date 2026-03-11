// --- ACTUALIZACIÓN DEL SERVIDOR (Física sincronizada) ---
setInterval(() => {
    for (const code in rooms) {
        const room = rooms[code];
        const friction = 0.95;  // Sincronizado
        const baseAcc = 0.2;   // Sincronizado
        const boostAcc = 0.45; // Sincronizado
        const maxSpeedNormal = 5;
        const maxSpeedBoost = 9;

        room.players.forEach(p => {
            let isBoosting = p.input.shift && p.boost > 0;
            const accel = isBoosting ? boostAcc : baseAcc; 
            const limit = isBoosting ? maxSpeedBoost : maxSpeedNormal;

            if (p.input.w) p.vy -= accel;
            if (p.input.s) p.vy += accel;
            if (p.input.a) p.vx -= accel;
            if (p.input.d) p.vx += accel;

            if (isBoosting) p.boost -= 0.4; // Consumo ligeramente menor

            p.vx *= friction; p.vy *= friction;
            
            let speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > limit) {
                p.vx = (p.vx / speed) * limit;
                p.vy = (p.vy / speed) * limit;
            }

            p.x += p.vx; p.y += p.vy;
            p.x = Math.max(15, Math.min(1385, p.x));
            p.y = Math.max(15, Math.min(885, p.y));

            room.boostPads.forEach(pad => {
                if (pad.active && Math.hypot(p.x - pad.x, p.y - pad.y) < 35) {
                    p.boost = Math.min(100, p.boost + pad.value);
                    pad.active = false;
                    pad.timer = pad.type === 'big' ? 600 : 240; 
                }
            });
        });

        room.boostPads.forEach(pad => {
            if (!pad.active) {
                pad.timer--;
                if (pad.timer <= 0) pad.active = true;
            }
        });

        // Pelota
        room.ball.x += room.ball.vx; room.ball.y += room.ball.vy;
        room.ball.vx *= 0.985; room.ball.vy *= 0.985;
        if (room.ball.x < 15 || room.ball.x > 1385) room.ball.vx *= -1;
        if (room.ball.y < 15 || room.ball.y > 885) room.ball.vy *= -1;

        room.players.forEach(p => {
            let dx = room.ball.x - p.x, dy = room.ball.y - p.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 28) {
                let nx = dx / dist, ny = dy / dist;
                room.ball.vx += nx * 0.8; room.ball.vy += ny * 0.8;
            }
        });

        io.to(code).emit("state", {
            players: room.players.map(p => ({
                id: p.id, x: p.x, y: p.y, team: p.team,
                name: p.name, title: p.title, titleColor: p.titleColor, 
                boost: p.boost, banner: p.banner
            })),
            ball: room.ball,
            boostPads: room.boostPads
        });
    }
}, 1000 / 60);