--!strict
-- Morality (Monster <-> Protector), heat (how hard the law is looking for
-- you, 0..5 stars) and hunter aggression. Driven by kills and by civilians
-- witnessing a monster in the streets.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Progression = require(Shared.Progression)
local WorldLayout = require(Shared.WorldLayout)
local Bus = require(script.Parent.Parent.Lib.Bus)
local Data = require(script.Parent.Data)

type Rep = { heat: number, hunterAggro: number }

local reps: { [Player]: Rep } = {}

local Reputation = {}

local function rep(player: Player): Rep
	local r = reps[player]
	if not r then
		r = { heat = 0, hunterAggro = 0 }
		reps[player] = r
	end
	return r
end

local function sync(player: Player)
	local profile = Data.get(player)
	local r = rep(player)
	if profile then
		player:SetAttribute("Morality", math.floor(profile.morality))
		player:SetAttribute("Title", Progression.title(profile.morality))
	end
	player:SetAttribute("Heat", math.floor(r.heat * 10) / 10)
end

function Reputation.heat(player: Player): number
	return rep(player).heat
end

function Reputation.addHeat(player: Player, n: number)
	local r = rep(player)
	r.heat = math.clamp(r.heat + n, 0, 5)
	sync(player)
end

function Reputation.addMorality(player: Player, n: number)
	local profile = Data.get(player)
	if not profile then
		return
	end
	profile.morality = math.clamp(profile.morality + n, -100, 100)
	sync(player)
end

-- Police open fire once you have two stars of heat.
function Reputation.policeHostile(player: Player): boolean
	return rep(player).heat >= 2
end

-- Hunters attack any monster form, and a human they have learned to hate.
function Reputation.huntersHostile(player: Player): boolean
	local form = player:GetAttribute("Form")
	return form ~= "human" or rep(player).hunterAggro > 0
end

-- A civilian saw the player as a monster in the streets.
function Reputation.witnessed(player: Player, dt: number)
	local form = player:GetAttribute("Form")
	if form == "human" then
		return
	end
	local rate = if form == "hybrid" then 0.04 else 0.08
	local r = rep(player)
	if r.heat < 2.5 then
		Reputation.addHeat(player, rate * dt)
	end
end

function Reputation.init() end

function Reputation.start()
	Bus.on("ProfileLoaded", function(player: Player)
		sync(player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		reps[player] = nil
	end)

	Bus.on("NPCKilled", function(player: Player?, npcType: string, pos: Vector3, _finisher: boolean)
		if not player then
			return
		end
		Reputation.addMorality(player, Config.KILL_MORALITY[npcType] or 0)
		local profile = Data.get(player)
		if profile then
			profile.kills[npcType] = (profile.kills[npcType] or 0) + 1
		end
		local inCity = WorldLayout.inCity(pos.X, pos.Z)
		if npcType == "civilian" then
			Reputation.addHeat(player, if inCity then 1.2 else 0.5)
		elseif npcType == "police" then
			Reputation.addHeat(player, 1.5)
		elseif npcType == "hunter" then
			rep(player).hunterAggro = 90
		elseif npcType == "vampire" and inCity then
			-- saving the city from vampires calms things down a little
			Reputation.addHeat(player, -0.3)
		end
	end)

	Bus.on("NestDestroyed", function(player: Player)
		Reputation.addMorality(player, 10)
	end)

	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		if acc < 1 then
			return
		end
		local step = acc
		acc = 0
		for player, r in reps do
			if not player.Parent then
				continue
			end
			local form = player:GetAttribute("Form")
			local decay = if form == "human" then Config.HEAT_DECAY_HUMAN else Config.HEAT_DECAY
			if r.heat > 0 then
				r.heat = math.max(0, r.heat - decay * step)
				sync(player)
			end
			if r.hunterAggro > 0 then
				r.hunterAggro = math.max(0, r.hunterAggro - step)
			end
		end
	end)
end

return Reputation
