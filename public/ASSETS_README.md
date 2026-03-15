# Asset Folder Structure

Place these inside `public/assets/`:

## Decals (`public/assets/decals/`)
White artwork on transparent background.
The game tints them to the player's team colour automatically.

| File | Type | Notes |
|------|------|-------|
| decal1.png … decal10.png | PNG | Static decal |
| decal11.gif … decal15.gif | GIF | Animated decal |

## Boost Trails (`public/assets/boost/`)
Any colour/design — NOT tinted (used as-is regardless of team).

| File | Type |
|------|------|
| boost1.png … boost10.png | PNG |

## How decal tinting works
The PNG/GIF is drawn clipped to the car's circle.
A `source-atop` composite with the team color is applied,
so a white skull on a blue team → blue skull, on orange → orange skull.
If you want a decal that keeps its original colours, put it in `boost/` instead.
