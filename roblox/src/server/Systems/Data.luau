--!strict
-- Player profiles: load with retry, a session marker (the newest server wins
-- and logs a warning when it takes over a live one), autosave, and a final
-- save on leave / shutdown. Falls back to a fresh in-memory profile
-- when DataStores are unavailable (e.g. Studio without API access), so the
-- game is always playable.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Types = require(Shared.Types)
local Bus = require(script.Parent.Parent.Lib.Bus)

type Profile = Types.Profile

local SCHEMA_VERSION = 1
local STORE_NAME = "LycanProfiles_v1"
local LOCK_TIMEOUT = 30 * 60 -- a lock older than this is considered abandoned

local store: DataStore? = nil
local profiles: { [Player]: Profile } = {}
local persistent: { [Player]: boolean } = {}

local Data = {}

local function defaultProfile(): Profile
	return {
		version = SCHEMA_VERSION,
		level = 1,
		xp = 0,
		skillPoints = 1,
		skills = {},
		morality = 0,
		kills = {},
		moonstones = {},
		vantages = {},
		nests = {},
		story = 1,
		alphaDefeated = false,
	}
end

-- Fill any fields missing from older saves and drop malformed values.
local function reconcile(raw: any): Profile
	local p = defaultProfile()
	if typeof(raw) ~= "table" then
		return p
	end
	local function num(v: any, default: number, lo: number, hi: number): number
		if typeof(v) ~= "number" or v ~= v then
			return default
		end
		return math.clamp(v, lo, hi)
	end
	local function boolMap(v: any): { [string]: boolean }
		local out = {}
		if typeof(v) == "table" then
			for k, b in v do
				if typeof(k) == "string" and b == true then
					out[k] = true
				end
			end
		end
		return out
	end
	p.level = math.floor(num(raw.level, 1, 1, 999))
	p.xp = num(raw.xp, 0, 0, 1e9)
	p.skillPoints = math.floor(num(raw.skillPoints, 1, 0, 999))
	p.morality = num(raw.morality, 0, -100, 100)
	p.story = math.floor(num(raw.story, 1, 1, 99))
	p.alphaDefeated = raw.alphaDefeated == true
	if typeof(raw.skills) == "table" then
		for id, def in Config.SKILLS do
			p.skills[id] = math.floor(num(raw.skills[id], 0, 0, def.max))
		end
	end
	if typeof(raw.kills) == "table" then
		for k, v in raw.kills do
			if typeof(k) == "string" and Config.NPCS[k] then
				p.kills[k] = math.floor(num(v, 0, 0, 1e9))
			end
		end
	end
	p.moonstones = boolMap(raw.moonstones)
	p.vantages = boolMap(raw.vantages)
	p.nests = boolMap(raw.nests)
	return p
end

local function retry<T>(label: string, fn: () -> T): (boolean, T?)
	local delay = 1
	for attempt = 1, 4 do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		warn(string.format("[Data] %s failed (attempt %d): %s", label, attempt, tostring(result)))
		if attempt < 4 then
			task.wait(delay)
			delay *= 2
		end
	end
	return false, nil
end

local function key(player: Player): string
	return "player_" .. player.UserId
end

local function load(player: Player)
	local profile: Profile = defaultProfile()
	local s = store
	if s and player.UserId > 0 then
		local jobId = game.JobId
		local ok, result = retry("load", function()
			local loaded: any = nil
			s:UpdateAsync(key(player), function(old: any)
				local now = os.time()
				if typeof(old) == "table" and typeof(old.lock) == "table" then
					local lock = old.lock
					if lock.job ~= jobId and typeof(lock.time) == "number" and now - lock.time < LOCK_TIMEOUT then
						-- another server still holds the session; take it over
						-- anyway after it has had time to flush (last writer wins)
						warn("[Data] overriding session lock for " .. player.Name)
					end
				end
				loaded = old
				local data = if typeof(old) == "table" then old else {}
				data.lock = { job = jobId, time = now }
				return data
			end)
			return loaded
		end)
		if ok then
			profile = reconcile(if typeof(result) == "table" then (result :: any).data else nil)
			persistent[player] = true
		else
			warn("[Data] using a temporary profile for " .. player.Name .. "; progress will not be saved")
		end
	end
	if not player.Parent then
		return -- left while loading
	end
	profiles[player] = profile
	Bus.emit("ProfileLoaded", player, profile)
end

local function save(player: Player, release: boolean)
	local s = store
	local profile = profiles[player]
	if not s or not profile or not persistent[player] then
		return
	end
	local jobId = game.JobId
	retry("save", function()
		s:UpdateAsync(key(player), function(old: any)
			local data = if typeof(old) == "table" then old else {}
			data.data = profile
			data.lock = if release then nil else { job = jobId, time = os.time() }
			return data
		end)
		return true
	end)
end

function Data.get(player: Player): Profile?
	return profiles[player]
end

function Data.init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then
		store = result
	else
		warn("[Data] DataStores unavailable: " .. tostring(result))
	end
end

function Data.start()
	Players.PlayerAdded:Connect(load)
	for _, p in Players:GetPlayers() do
		task.spawn(load, p)
	end
	Players.PlayerRemoving:Connect(function(player)
		save(player, true)
		profiles[player] = nil
		persistent[player] = nil
	end)
	game:BindToClose(function()
		if RunService:IsStudio() and not store then
			return
		end
		local pending = 0
		for _, player in Players:GetPlayers() do
			pending += 1
			task.spawn(function()
				save(player, true)
				pending -= 1
			end)
		end
		local deadline = os.clock() + 25
		while pending > 0 and os.clock() < deadline do
			task.wait(0.2)
		end
	end)
	task.spawn(function()
		while true do
			task.wait(Config.AUTOSAVE_INTERVAL)
			for _, player in Players:GetPlayers() do
				task.spawn(save, player, false)
			end
		end
	end)
end

return Data
