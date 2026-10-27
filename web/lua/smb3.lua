function teeLog(str)
    emu.log(str)
    emu.displayMessage("OpenStave", str)
end

HASHES = {
    ["a03e7e526e79df222e048ae22214bca2bc49c449"] = true, -- (U) PRG0 iNES
    ["5f9019040fe23cb412a484e1ef430e59e589f9b4"] = true, -- (U) PRG0 NES 2.0
    ["6bd518e85eb46a4252af07910f61036e84b020d1"] = true, -- (U) PRG1 iNES
    ["a25d2dcbf6ec3634a84318bfe2cfe28d5331d815"] = true, -- (U) PRG1 NES 2.0
}

if HASHES[emu.getRomInfo().fileSha1Hash:lower()] == nil then
    teeLog("bad rom (see HASHES for valid sha1sums), exiting")
    return
end

ADDRESS = SERVER[1] .. ":" .. SERVER[2]

local callback = nil
local auth = table.concat({
    string.format("%-32s", USERNAME),
    string.format("%-32s", PASSWORD)
})
local socket = require("socket.core")
local client = socket.connect(SERVER[1], SERVER[2])
local total_length = 0
if client ~= nil then
    client:send(auth)
    local r = client:receive(5)
    if r == nil then
        client:close()
        client = nil
    elseif string.byte(r, 1) ~= 0 then
        teeLog("invalid authentication for " .. ADDRESS .. ", exiting")
        return
    else
        local b1, b2, b3, b4 = string.byte(r, 2, 5)
        total_length = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24)
    end
end
local pclient = nil

local buffer = ""
local backup = ""
function send(data)
    buffer = buffer .. data
    if client ~= nil then
        if pclient == nil then
            teeLog("successfully connected to " .. ADDRESS .. ".")
            pclient = client
        end

        local sent1, _, sent2 = client:send(buffer)
        if not sent1 then
            client:close()
            client = nil
            sent1 = sent2
        end
        backup = (backup .. buffer:sub(1, sent1)):sub(-65536)
        buffer = buffer:sub(sent1 + 1)
        total_length = total_length + sent1
    end
    if client == nil then
        if pclient ~= nil then
            teeLog("reconnecting to " .. ADDRESS .. "...")
            pclient = client
        end

        client = socket.connect(SERVER[1], SERVER[2])
        if client ~= nil then
            client:send(auth)
            local r = client:receive(5)
            if r == nil then
                client:close()
                client = nil
            elseif string.byte(r, 1) ~= 0 then
                teeLog("invalid authentication for " .. ADDRESS .. ", exiting")
                if callback ~= nil then
                    emu.removeEventCallback(callback, emu.eventType.endFrame)
                end
            else
                local b1, b2, b3, b4 = string.byte(r, 2, 5)
                local skip = (b1 | (b2 << 8) | (b3 << 16) | (b4 << 24)) - total_length
                if skip < 0 then
                    buffer = backup:sub(skip) .. buffer
                    backup = backup:sub(1, skip - 1)
                else
                    backup = (backup .. buffer:sub(1, skip)):sub(-65536)
                    buffer = buffer:sub(skip + 1)
                end
                total_length = total_length + skip
            end
        end
    end
end

local chr_banks = { 0, 0, 0, 0, 0, 0 }
local n_chr_banks = { table.unpack(chr_banks) }

local r8000 = 0
local new_frame = true
function set8000(_, value)
    r8000 = value
end
function set8001(_, value)
    if r8000 >= 0x40 and r8000 < 0x46 then
        n_chr_banks[r8000 - 0x3f] = value
    end
end
function setIRQ()
    if new_frame == false then return end
    chr_banks = n_chr_banks
    n_chr_banks = { table.unpack(chr_banks) }
    new_frame = false
end

emu.addMemoryCallback(set8000, emu.callbackType.write, 0x8000, 0x8000, emu.cpuType.nes, emu.memType.nesMemory)
emu.addMemoryCallback(set8001, emu.callbackType.write, 0x8001, 0x8001, emu.cpuType.nes, emu.memType.nesMemory)
emu.addEventCallback(setIRQ, emu.eventType.irq)

NORMAL_CONDITIONS = {
    2,
    {
        [0x60] = true,
        [0x62] = true,
        [0x64] = true,
        [0x66] = true,
        [0x6a] = true
    }
}
TILES = {
    { 0xd8, NORMAL_CONDITIONS }, -- hit blocks
    { 0xdc, NORMAL_CONDITIONS }, -- dynamic coins
}
local _p_offset = 0
function read_tiles()
    _tiles = {}
    for _, v in ipairs(TILES) do
        if v[2][2][chr_banks[v[2][1]]] then
            _tiles[v[1]] = {}
        end
    end

    for i = 0, 0x3bf do
        local tile

        local x = i & 0x1f
        local y = i >> 5
        if (x & 1) == 1 or (y & 1) == 1 then goto continue end
        a = (x >> 2) + ((y >> 2) << 3)
        b = (x & 2) + ((y & 2) << 1)
        x = x << 3
        y = y << 3

        local o = (x - _p_offset) & 0xff
        if o < 8 or o >= 0xf8 then goto continue end

        tile = emu.read(0x2000 + i, emu.memType.nesPpuDebug)
        for v in pairs(_tiles) do
            if tile == v then
                local p = (emu.read(0x23c0 + a, emu.memType.nesPpuDebug) >> b) & 3
                table.insert(_tiles[v], o)
                table.insert(_tiles[v], (y >> 1) + p)
            end
        end

        y = y + 240
        if y >= 432 then goto continue end

        tile = emu.read(0x2800 + i, emu.memType.nesPpuDebug)
        for v in pairs(_tiles) do
            if tile == v then
                local p = (emu.read(0x2bc0 + a, emu.memType.nesPpuDebug) >> b) & 3
                table.insert(_tiles[v], o)
                table.insert(_tiles[v], (y >> 1) + p)
            end
        end

        ::continue::
    end

    _p_offset = emu.read(0xfd, emu.memType.nesDebug)
end

function serialize_tiles()
    tiles = {}
    for i, v in pairs(_tiles) do
        if #v == 0 then goto continue end

        table.insert(tiles, i)
        table.insert(tiles, #v >> 1)
        for j = 1, #v, 2 do
            local x = v[j]
            local y = v[j + 1]
            table.insert(tiles, y)
            table.insert(tiles, x)
        end

        ::continue::
    end
end

local _load_flag = false
local _wz_flag = false
local _p_area = 0
local _p_world = 0
function flag_in_screen_transition()
    local area = (emu.read(0x61, emu.memType.nesDebug) << 8) + emu.read(0x62, emu.memType.nesDebug)
    local world = emu.read(0x727, emu.memType.nesDebug)
    local fade_timer = emu.read(0x41c, emu.memType.nesDebug)
    local fade_step = emu.read(0x41d, emu.memType.nesDebug)

    if fade_step == 4 and fade_timer == 4 then
        _load_flag = false
        if world == 8 then
            _wz_flag = not _wz_flag
        else
            _wz_flag = false
        end
    end

    if area ~= _p_area or world ~= _p_world then
        _load_flag = true
    end

    _p_area = area
    _p_world = world

    return (fade_step ~= 0 or _load_flag or _wz_flag) and 1 or 0
end

local _p_start = 0
function flag_start()
    local start = emu.read(0x1f4, emu.memType.nesDebug)
    local flag = (start == 0xff and _p_start == 0) and 1 or 0
    _p_start = start
    return flag
end

function flag_bowser_door()
    return emu.read(0x78d, emu.memType.nesDebug) ~= 0 and 1 or 0
end

function flag_dying()
    return emu.read(0xf1, emu.memType.nesDebug) ~= 0 and 1 or 0
end

function read_memory()
    frame = emu.getState().frameCount

    palette = {}
    for i = 0, 31 do table.insert(palette, emu.read(i, emu.memType.nesPaletteRam)) end

    sprites = {}
    for i = 0, 255 do table.insert(sprites, emu.read(i, emu.memType.nesSpriteRam)) end

    local flags =
        (flag_in_screen_transition()) +
        (flag_start() << 1) +
        (flag_bowser_door() << 2) +
        (flag_dying() << 3)
    ram = {
        emu.read(0x70a, emu.memType.nesDebug), -- tileset
        emu.read(0x727, emu.memType.nesDebug), -- world
        emu.read(0x61, emu.memType.nesDebug), -- area pointer low byte
        emu.read(0x62, emu.memType.nesDebug), -- area pointer high byte
        emu.read(0x542, emu.memType.nesDebug), -- area top edge page
        emu.read(0x543, emu.memType.nesDebug), -- area top edge pixel
        emu.read(0x12, emu.memType.nesDebug), -- left edge page
        emu.read(0xfd, emu.memType.nesDebug), -- left edge pixel
        flags,
        emu.read(0x450, emu.memType.nesDebug), -- transition timer
        emu.read(0x7976, emu.memType.nesDebug), -- map ypos
        emu.read(0x7978, emu.memType.nesDebug), -- map xpos high byte
        emu.read(0x797a, emu.memType.nesDebug), -- map xpos low byte
        emu.read(0x100, emu.memType.nesDebug), -- level type
    }

    read_tiles()
    serialize_tiles()
end

function u32le(n)
    local s = ""
    for _ = 0, 3, 1 do
        s = s .. string.char(n & 0xff)
        n = n >> 8
    end
    return s
end

function main()
    read_memory()
    local data = table.concat({
        u32le(frame),
        string.char(table.unpack(palette)),
        string.char(table.unpack(chr_banks)),
        string.char(table.unpack(sprites)),
        string.char(table.unpack(ram)),
        string.char(table.unpack(tiles))
    })
    send(u32le(#data + 4) .. data)
    new_frame = true
end

callback = emu.addEventCallback(main, emu.eventType.endFrame)
