function teeLog(str)
    emu.log(str)
    emu.displayMessage("OpenStave", str)
end

HASHES = {
    ["3b8c8998b4887d6dd676965943d69a320738ab9c"] = true,
    ["08927227b6ff67f42e759505d176cd924931bd14"] = true,
    ["20e50128742162ee47561db9e82b2836399c880c"] = true,
}

if HASHES[emu.getRomInfo().fileSha1Hash:lower()] == nil then
    teeLog("bad rom (see HASHES for valid sha1sums), exiting")
    return
end

local callback = nil
local auth = table.concat({
    string.format("%-32s", USERNAME),
    string.format("%-32s", PASSWORD)
})
local socket = require("socket.core")
local client = socket.connect(SERVER[1], SERVER[2])
if client ~= nil then
    client:send(auth)
    local r = client:receive(1)
    if r == nil then
        client.close()
        client = nil
    end
    if r ~= string.char(0) then
        teeLog("invalid authentication for " .. SERVER[1] .. ":" .. SERVER[2] .. ", exiting")
        return
    end
end
local pclient = nil

local buffer = ""
function send(data)
    buffer = buffer .. data
    if client ~= nil then
        if pclient == nil then
            teeLog("successfully connected to " .. SERVER[1] .. ":" .. SERVER[2] .. ".")
            pclient = client
        end

        local sent1, _, sent2 = client:send(buffer)
        if not sent1 then
            client:close()
            client = nil
            sent1 = sent2
        end
        buffer = buffer:sub(sent1 + 1)
    end
    if client == nil then
        if pclient ~= nil then
            teeLog("reconnecting to " .. SERVER[1] .. ":" .. SERVER[2] .. "...")
            pclient = client
        end

        client = socket.connect(SERVER[1], SERVER[2])
        if client ~= nil then
            client:send(auth)
            local r = client:receive(1)
            if r == nil then
                client.close()
                client = nil
            end
            if r ~= string.char(0) then
                teeLog("invalid authentication for " .. SERVER[1] .. ":" .. SERVER[2] .. ", exiting")
                if callback ~= nil then
                    emu.removeEventCallback(callback, emu.eventType.endFrame)
                end
            end
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

        if (emu.read(0x7ee, emu.memType.nesDebug) == 0 and _r == 0xff and emu.read(0x7a1, emu.memType.nesDebug) == 6) then
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

local _p_page = 0
local _p_loop = 0
local _page_threshold = 0
local _loop_offset = false
function q_page()
    local state = emu.read(0xe, emu.memType.nesDebug)
    local loop = emu.read(0x745, emu.memType.nesDebug)
    local page = emu.read(0x6d, emu.memType.nesDebug)

    if (_p_page - page >= 3 and loop == 0 and _p_loop ~= 0) then
        _page_threshold = page + 1
        _loop_offset = true
    end

    _p_page = page
    _p_loop = loop

    -- change area failsafe is 1f late
    if (state == 7 or page >= _page_threshold) then
        _loop_offset = false
    end

    if (_loop_offset) then return page + 4 end
    return page
end

local _p_area = 0
local _p_world = 0
local _p_stage = 0
function q_level()
    local state = emu.read(0xe, emu.memType.nesDebug)
    local area =
        emu.read(0x7fb, emu.memType.nesDebug) * 128
        + (emu.read(0x74e, emu.memType.nesDebug) * 32 + emu.read(0x74f, emu.memType.nesDebug)) % 128
    local world = emu.read(0x75f, emu.memType.nesDebug)
    local stage = emu.read(0x75c, emu.memType.nesDebug)

    if (state ~= 3 and state ~= 8) then
        _p_area = area
        _p_world = world
        _p_stage = stage
    end

    return { _p_area, _p_world, _p_stage }
end

function read_memory()
    frame = emu.getState().frameCount

    palette = {}
    for i = 0, 31 do table.insert(palette, emu.read(i, emu.memType.nesPaletteRam)) end

    sprites = {}
    for i = 0, 255 do table.insert(sprites, emu.read(i, emu.memType.nesSpriteRam)) end

    if (emu.read(0xbc0, emu.memType.nesPpuDebug) == 0) then
        for i = 1, 253, 4 do
            if (sprites[i + 1] < 0x80 or sprites[i + 1] >= 0xc0) then goto continue end
            sprites[i + 2] = (sprites[i + 2] + 8) % 256 -- encode 2 * 0x40 offset hidden inside unused bits
            ::continue::
        end
    end

    local aws = q_level()
    ram = {
        emu.read(0xe, emu.memType.nesDebug),   -- player state
        aws[1],                                -- (quasi) area id
        emu.read(0x770, emu.memType.nesDebug), -- game state
        aws[2],                                -- (quasi) world
        aws[3],                                -- (quasi) stage
        q_page(),                              -- area (quasi) page
        emu.read(0x86, emu.memType.nesDebug),  -- area pixel
        emu.read(0x3ad, emu.memType.nesDebug), -- screen pixel
        remainder(),
    }
end

function u32le(n)
    local s = ""
    for _ = 0, 3, 1 do
        s = s .. string.char(n % 256)
        n = n >> 8
    end
    return s
end

function main()
    read_memory()
    local data = table.concat({
        u32le(frame),
        string.char(table.unpack(palette)),
        string.char(table.unpack(sprites)),
        string.char(table.unpack(ram))
    })
    send(u32le(#data + 4) .. data)
end

callback = emu.addEventCallback(main, emu.eventType.endFrame)
