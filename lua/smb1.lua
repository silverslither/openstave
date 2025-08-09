-- BEGIN AUTHENTICATION --
SERVER = { "", 0 }
USERNAME = ""
PASSWORD = ""
-- END AUTHENTICATION --

if emu.getRomInfo().fileSha1Hash:lower() ~= "ea343f4e445a9050d4b4fbac2c77d0693b1d0922" then
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
            pclient = client
        end

        client = socket.connect(SERVER[1], SERVER[2])
        if client ~= nil then
            client:send(auth)
        end
    end
end

local _r = 0xff
local _r_timer = 0
local _r_black_screen_soon = false
function remainder()
    local state = emu.read(0xe, emu.memType.nesDebug)

    if (state == 0) then
        if (_r_black_screen_soon and _r == 0xff and emu.read(0x7a0, emu.memType.nesDebug) == 7) then
            _r = emu.read(0x77f, emu.memType.nesDebug)
            _r_timer = 0x7a0 - 0x795
        end
    else
        if (state == 3) then
            _r_black_screen_soon = true
        elseif (state == 7 or state == 8) then
            _r_black_screen_soon = false
        end

        if (state == 5 and _r == 0xff) then
            for i = 1, 6 do
                if (emu.read(0x795 + i, emu.memType.nesDebug) == 6) then
                    _r = emu.read(0x77f, emu.memType.nesDebug)
                    _r_timer = i
                    break
                end
            end
        end

        if (_r == 0xff and emu.read(0x7a1, emu.memType.nesDebug) == 6) then
            _r = emu.read(0x77f, emu.memType.nesDebug)
            _r_timer = 0x7a1 - 0x795
        end

        if (state == 7) then
            _r = 0xff
        end
    end

    if (_r_timer ~= 0 and emu.read(0x795 + _r_timer, emu.memType.nesDebug) == 0) then
        _r = 0xff
        _r_timer = 0
    end

    return _r
end

function readmemory()
    frame = emu.getState().frameCount

    palette = {}
    for i = 0, 31 do table.insert(palette, emu.read(i, emu.memType.nesPaletteRam)) end

    sprites = {}
    for i = 0, 255 do table.insert(sprites, emu.read(i, emu.memType.nesSpriteRam)) end

    ram = {
        emu.read(0xe, emu.memType.nesDebug),     -- player state
        emu.read(0x74e, emu.memType.nesDebug) * 32
        + emu.read(0x74f, emu.memType.nesDebug), -- area id
        emu.read(0x770, emu.memType.nesDebug),   -- game state
        emu.read(0x75f, emu.memType.nesDebug),   -- world number
        emu.read(0x760, emu.memType.nesDebug),   -- stage number
        emu.read(0x6d, emu.memType.nesDebug),    -- area page
        emu.read(0x86, emu.memType.nesDebug),    -- area pixel
        emu.read(0x3ad, emu.memType.nesDebug),   -- screen pixel
        remainder(),
    }
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
