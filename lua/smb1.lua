SERVER = { "", 0 }
USERNAME = ""
PASSWORD = ""
CHECKSUM = "ea343f4e445a9050d4b4fbac2c77d0693b1d0922"

if emu.getRomInfo().fileSha1Hash:lower() ~= CHECKSUM then
    emu.displayMessage("OpenVLB", "check that you have loaded a rom with sha1sum " .. CHECKSUM .. ".")
    return
end

local auth = table.concat({
    string.format("%-32s", USERNAME),
    string.format("%-32s", PASSWORD)
})
local socket = require("socket.core")
local client = socket.connect(SERVER[1], SERVER[2])
if client ~= nil then
    client:send(auth)
end
local pclient = nil

local buffer = ""
function send(data)
    buffer = buffer .. data
    if client ~= nil then
        if pclient == nil then
            emu.displayMessage("OpenVLB", "successfully connected to " .. SERVER[1] .. ":" .. SERVER[2] .. ".")
            pclient = client
        end
        local sent1, _, sent2 = client:send(buffer)
        if not sent1 then
            emu.log("socket error: " .. _)
            client:close()
            client = nil
            sent1 = sent2
        end
        buffer = buffer:sub(sent1 + 1)
    end
    if client == nil then
        if pclient ~= nil then
            emu.displayMessage("OpenVLB", "reconnecting to " .. SERVER[1] .. ":" .. SERVER[2] .. "...")
        end
        pclient = client
        client = socket.connect(SERVER[1], SERVER[2])
        if client ~= nil then
            client:send(auth)
        end
    end
end

function readmemory()
    frame = emu.getState().frameCount

    palette = {}
    for i = 0, 31 do table.insert(palette, emu.read(i, emu.memType.nesPaletteRam)) end

    sprites = {}
    for i = 0, 255 do table.insert(sprites, emu.read(i, emu.memType.nesSpriteRam)) end

    ram = {
        emu.read(0xe, emu.memType.nesDebug),   -- player state
        emu.read(0x74e, emu.memType.nesDebug) * 32 + emu.read(0x74f, emu.memType.nesDebug), -- area id
        emu.read(0x770, emu.memType.nesDebug), -- game state
        emu.read(0x75f, emu.memType.nesDebug), -- world number
        emu.read(0x760, emu.memType.nesDebug), -- stage number
        emu.read(0x6d, emu.memType.nesDebug),  -- area page
        emu.read(0x86, emu.memType.nesDebug),  -- area pixel
        emu.read(0x3ad, emu.memType.nesDebug)  -- screen pixel
    }
end

function table.merge(t1, t2)
    for i = 1, #t2 do
        t1[#t1 + 1] = t2[i]
    end
    return t1
end

function u32(n)
    local s = ""
    for _ = 0, 3, 1 do
        s = s .. string.char(n % 256)
        n = math.floor(n / 256)
    end
    return s
end

function main()
    readmemory()
    local data = table.concat({
        u32(frame),
        string.char(table.unpack(palette)),
        string.char(table.unpack(sprites)),
        string.char(table.unpack(ram))
    })
    send(u32(#data + 4) .. data)
end

emu.addEventCallback(main, emu.eventType.endFrame)
