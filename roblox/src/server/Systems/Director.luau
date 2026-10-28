--!strict
-- The story and the living world around it: the objective chain, moonstone
-- collectibles, vantage points, the Moon Shrine, the safehouse bed, nests,
-- and random night events (vampire ambushes, hunter patrols).

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Net = require(Shared.Net)
local Moon = require(Shared.Moon)
local WorldLayout = require(Shared.WorldLayout)
local Bus = require(script.Parent.Parent.Lib.Bus)
local Data = require(script.Parent.Data)
local PlayerState = require(script.Parent.PlayerState)
local Reputation = require(script.Parent.Reputation)
local NPCs = require(script.Parent.NPCs)
local World = require(script.Parent.World)
local DayNight = require(script.Parent.DayNight)

type Step = {
	text: string,
	target: (() -> Vector3?)?,
	xp: number,
}

local L = WorldLayout.LANDMARKS

local function nearestVantage(): Vector3?
	local v = World.get().vantages[1]
	return if v then v.Position else nil
end

local STEPS: { Step } = {
	{ text = "Let the wolf out. Press F to transform (1 / 2 / 3 pick a form).", xp = 40 },
	{ text = "Run with the pack: sprint as a beast (hold Shift).", xp = 40 },
	{ text = "Climb a building: run at a wall in hybrid or beast form.", xp = 60 },
	{ text = "Reach a vantage point and survey the city (E at the top).", target = nearestVantage, xp = 80 },
	{ text = "Howl at the moon (Q).", xp = 40 },
	{ text = "Vampires stalk the streets at night. Slay 3.", xp = 120 },
	{ text = "Destroy a vampire nest to free a district.", target = function()
		return WorldLayout.NESTS[1].pos
	end, xp = 200 },
	{ text = "Seek the Moon Shrine at the Old Ruins.", target = function()
		return L.ruins
	end, xp = 150 },
	{ text = "Challenge the Alpha at Vargr's Den.", target = function()
		return L.den
	end, xp = 400 },
	{ text = "Greyhaven is your hunting ground. Protect it, or rule it.", xp = 0 },
}

local notify: RemoteEvent
local progress: { [Player]: number } = {}

local Director = {}

local function publish(player: Player)
	local profile = Data.get(player)
	if not profile then
		return
	end
	local step = STEPS[math.clamp(profile.story, 1, #STEPS)]
	player:SetAttribute("Objective", step.text)
	local target = step.target and step.target()
	player:SetAttribute("ObjectiveTarget", target)
	local stones = {}
	for id in profile.moonstones do
		table.insert(stones, id)
	end
	player:SetAttribute("Moonstones", table.concat(stones, ","))
	player:SetAttribute("MoonstoneCount", #stones)
	local vantages = {}
	for id in profile.vantages do
		table.insert(vantages, id)
	end
	player:SetAttribute("Vantages", table.concat(vantages, ","))
end

local function advance(player: Player, stepIndex: number)
	local profile = Data.get(player)
	if not profile or profile.story ~= stepIndex or stepIndex >= #STEPS then
		return
	end
	local step = STEPS[stepIndex]
	profile.story += 1
	progress[player] = 0
	PlayerState.addXP(player, step.xp)
	notify:FireClient(player, "objective", "OBJECTIVE COMPLETE  +" .. step.xp .. " XP")
	publish(player)
end

local function storyIs(player: Player, i: number): boolean
	local profile = Data.get(player)
	return profile ~= nil and profile.story == i
end

---------------------------------------------------------------- collectibles

local function collectMoonstone(player: Player, stone: BasePart)
	local profile = Data.get(player)
	if not profile or profile.moonstones[stone.Name] then
		return
	end
	profile.moonstones[stone.Name] = true
	local count = 0
	for _ in profile.moonstones do
		count += 1
	end
	PlayerState.addXP(player, 25)
	if count % 5 == 0 then
		profile.skillPoints += 1
		PlayerState.syncProgress(player)
		notify:FireClient(player, "banner", "MOONSTONE " .. count .. "/40  ·  +1 skill point")
	else
		notify:FireClient(player, "toast", "Moonstone " .. count .. "/40")
	end
	Net.event("Fx"):FireClient(player, "collect", { pos = stone.Position })
	publish(player)
end

local function survey(player: Player, vantage: BasePart)
	local profile = Data.get(player)
	local _, root = PlayerState.humanoidOf(player)
	if not profile or not root then
		return
	end
	if (root.Position - vantage.Position).Magnitude > 20 then
		return
	end
	local label = vantage:GetAttribute("Label")
	if not profile.vantages[vantage.Name] then
		profile.vantages[vantage.Name] = true
		PlayerState.addXP(player, 60)
		notify:FireClient(player, "banner", "VANTAGE: " .. tostring(label) .. "  ·  map revealed")
	end
	Net.event("Fx"):FireClient(player, "survey", { pos = vantage.Position })
	advance(player, 4)
	publish(player)
end

---------------------------------------------------------------- events

type WorldEvent = { npcs: { NPCs.NPC }, player: Player, reward: number, morality: number, label: string }
local activeEvent: WorldEvent? = nil

local function startEvent()
	if activeEvent then
		return
	end
	local players = Players:GetPlayers()
	if #players == 0 then
		return
	end
	local player = players[math.random(1, #players)]
	local _, root = PlayerState.humanoidOf(player)
	if not root then
		return
	end
	local pos = root.Position
	local built = World.get()
	local spawned: { NPCs.NPC } = {}
	local label, kind, n
	if WorldLayout.inCity(pos.X, pos.Z) then
		label, kind, n = "A vampire pack is attacking civilians nearby!", "vampire", 4
	else
		label, kind, n = "A Silver Dawn patrol is sweeping the woods.", "hunter", 3
	end
	local points = if kind == "vampire" then built.roadPoints else built.forestPoints
	if #points == 0 then
		return
	end
	local center: Vector3? = nil
	for _ = 1, 20 do
		local p = points[math.random(1, #points)]
		local d = (p - pos).Magnitude
		if d > 60 and d < 160 then
			center = p
			break
		end
	end
	if not center then
		return
	end
	for _ = 1, n do
		local npc = NPCs.spawn(kind, center + Vector3.new(math.random(-12, 12), 0, math.random(-12, 12)))
		if npc then
			table.insert(spawned, npc)
		end
	end
	if kind == "vampire" then
		for _ = 1, 3 do
			NPCs.spawn("civilian", center + Vector3.new(math.random(-15, 15), 0, math.random(-15, 15)))
		end
	end
	activeEvent = {
		npcs = spawned,
		player = player,
		reward = if kind == "vampire" then 150 else 120,
		morality = if kind == "vampire" then 5 else -2,
		label = label,
	}
	notify:FireClient(player, "event", label)
	player:SetAttribute("EventTarget", center)
end

local function checkEvent()
	local ev = activeEvent
	if not ev then
		return
	end
	local alive = 0
	for _, npc in ev.npcs do
		if npc.alive then
			alive += 1
		end
	end
	if alive == 0 then
		activeEvent = nil
		if ev.player.Parent then
			PlayerState.addXP(ev.player, ev.reward)
			Reputation.addMorality(ev.player, ev.morality)
			notify:FireClient(ev.player, "objective", "EVENT CLEARED  +" .. ev.reward .. " XP")
			ev.player:SetAttribute("EventTarget", nil)
		end
	end
end

---------------------------------------------------------------- lifecycle

function Director.init()
	notify = Net.event("Notify")
end

function Director.start()
	local built = World.get()

	for _, stone in built.moonstones do
		stone.Touched:Connect(function(hit)
			local character = hit:FindFirstAncestorOfClass("Model")
			local player = character and Players:GetPlayerFromCharacter(character)
			if player then
				collectMoonstone(player, stone)
			end
		end)
	end
	for _, v in built.vantages do
		local prompt = v:FindFirstChildOfClass("ProximityPrompt")
		if prompt then
			prompt.Triggered:Connect(function(player)
				survey(player, v)
			end)
		end
	end
	local lastRest = 0
	for _, bed in CollectionService:GetTagged("SafehouseBed") do
		local prompt = bed:FindFirstChildOfClass("ProximityPrompt")
		if prompt then
			prompt.Triggered:Connect(function(player)
				if os.clock() - lastRest < 45 then
					notify:FireClient(player, "toast", "You can't sleep yet.")
					return
				end
				lastRest = os.clock()
				for _, p in Players:GetPlayers() do
					notify:FireClient(p, "sleep", player.DisplayName .. " rests at the safehouse...")
				end
				task.wait(1.2)
				DayNight.skip()
				local humanoid = PlayerState.humanoidOf(player)
				if humanoid then
					humanoid.Health = humanoid.MaxHealth
				end
			end)
		end
	end
	for _, shrine in CollectionService:GetTagged("MoonShrine") do
		if shrine:IsA("BasePart") then
			local prompt = Instance.new("ProximityPrompt")
			prompt.ActionText = "Commune with the moon"
			prompt.ObjectText = "Moon Shrine"
			prompt.MaxActivationDistance = 14
			prompt.Parent = shrine
			prompt.Triggered:Connect(function(player)
				local humanoid = PlayerState.humanoidOf(player)
				if humanoid then
					humanoid.Health = humanoid.MaxHealth
				end
				PlayerState.addRage(player, 100)
				notify:FireClient(player, "banner", "The moon answers. Rage and health restored.")
				advance(player, 8)
			end)
		end
	end

	Bus.on("ProfileLoaded", function(player: Player)
		progress[player] = 0
		publish(player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		progress[player] = nil
	end)

	Bus.on("Transformed", function(player: Player, _from: string, to: string)
		if to ~= "human" then
			advance(player, 1)
		end
	end)
	Bus.on("Howled", function(player: Player)
		advance(player, 5)
	end)
	Bus.on("NPCKilled", function(player: Player?, kind: string)
		if not player then
			return
		end
		if kind == "vampire" and storyIs(player, 6) then
			progress[player] = (progress[player] or 0) + 1
			notify:FireClient(player, "toast", "Vampires slain: " .. progress[player] .. "/3")
			if progress[player] >= 3 then
				advance(player, 6)
			end
		elseif kind == "alpha" then
			local profile = Data.get(player)
			if profile then
				profile.alphaDefeated = true
			end
			notify:FireClient(player, "banner", "THE ALPHA FALLS. The pack of Greyhaven is yours.")
			advance(player, 9)
		end
	end)
	Bus.on("NestDestroyed", function(player: Player, id: string, district: string?)
		local profile = Data.get(player)
		if profile then
			profile.nests[id] = true
		end
		PlayerState.addXP(player, 120)
		for _, p in Players:GetPlayers() do
			notify:FireClient(p, "banner", (district or "A district") .. " is free of the Night Court")
		end
		advance(player, 7)
	end)

	-- movement objectives are sampled from server positions
	task.spawn(function()
		local lastPos: { [Player]: Vector3 } = {}
		while true do
			task.wait(0.5)
			for _, player in Players:GetPlayers() do
				local _, root = PlayerState.humanoidOf(player)
				local profile = Data.get(player)
				if root and profile then
					local prev = lastPos[player]
					lastPos[player] = root.Position
					local form = player:GetAttribute("Form")
					if profile.story == 2 and prev and form ~= "human" then
						local flat = (root.Position - prev) * Vector3.new(1, 0, 1)
						if flat.Magnitude / 0.5 > 40 then
							advance(player, 2)
						end
					elseif profile.story == 3 and form ~= "human" and root.Position.Y > 45 then
						advance(player, 3)
					elseif profile.story == 8 and (root.Position - L.ruins).Magnitude < 25 then
						-- reaching the shrine also counts (communing is optional)
						advance(player, 8)
					end
				end
			end
			for p in lastPos do
				if not p.Parent then
					lastPos[p] = nil
				end
			end
			checkEvent()
		end
	end)

	-- a world event roughly every three minutes at night
	task.spawn(function()
		while true do
			task.wait(180)
			if Moon.isNight(Lighting.ClockTime) then
				pcall(startEvent)
			end
		end
	end)
end

return Director
