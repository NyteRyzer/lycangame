--!strict
-- Server-side combat. Clients only ask ("I swung", "I howled"); the server
-- checks form, cooldowns and reach against its own positions and decides
-- every hit. Covers the 3-hit light combo, heavy blows, the aerial ground
-- slam, howl, frenzy, dash i-frames, block / parry, finishers, grabbing and
-- throwing props and people, explosive barrels and vampire nests.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Lib = script.Parent.Parent.Lib
local Bus = require(Lib.Bus)
local RateLimit = require(Lib.RateLimit)
local PlayerState = require(script.Parent.PlayerState)
local NPCs = require(script.Parent.NPCs)

type Held = {
	kind: "prop" | "npc",
	model: Model,
	weld: WeldConstraint,
	npc: NPCs.NPC?,
	massless: { BasePart },
	collide: { BasePart },
}

type Thrown = {
	model: Model,
	part: BasePart,
	by: Player,
	untilT: number,
	damage: number,
	hit: { [Model]: boolean },
	explosive: boolean,
	npc: NPCs.NPC?,
}

local fx: RemoteEvent
local readyAt: { [Player]: { [string]: number } } = {}
local lightChain: { [Player]: { index: number, at: number } } = {}
local held: { [Player]: Held } = {}
local thrown: { Thrown } = {}

local Combat = {}

local TIER = { human = 1, hybrid = 2, wolf = 3 }

local function cooldown(player: Player, key: string, dur: number): boolean
	local t = os.clock()
	local map = readyAt[player]
	if not map then
		map = {}
		readyAt[player] = map
	end
	if t < (map[key] or 0) then
		return false
	end
	map[key] = t + dur
	return true
end

local function formOf(player: Player): string
	local f = player:GetAttribute("Form")
	return if typeof(f) == "string" then f else "human"
end

local function damageNests(player: Player, origin: Vector3, range: number, amount: number)
	for _, nest in CollectionService:GetTagged("Nest") do
		if nest:IsA("Model") then
			local hp = nest:GetAttribute("Health")
			if typeof(hp) == "number" and hp > 0 then
				local p = nest:GetPivot().Position
				if (p - origin).Magnitude < range + 8 then
					local left = math.max(0, hp - amount)
					nest:SetAttribute("Health", left)
					fx:FireAllClients("hit", { pos = p + Vector3.new(0, 6, 0), amount = math.floor(amount), kind = "nest", blood = false })
					if left <= 0 then
						Combat.destroyNest(nest, player)
					end
				end
			end
		end
	end
end

function Combat.destroyNest(nest: Model, player: Player)
	fx:FireAllClients("explode", { pos = nest:GetPivot().Position, radius = 20, color = Color3.fromRGB(255, 40, 60) })
	for _, d in nest:GetDescendants() do
		if d:IsA("BasePart") then
			d.Transparency = 1
			d.CanCollide = false
		elseif d:IsA("PointLight") then
			d.Enabled = false
		end
	end
	Bus.emit("NestDestroyed", player, nest.Name, nest:GetAttribute("District"))
	-- the Night Court rebuilds eventually
	task.delay(900, function()
		nest:SetAttribute("Health", nest:GetAttribute("MaxHealth"))
		for _, d in nest:GetDescendants() do
			if d:IsA("BasePart") then
				d.Transparency = 0
				d.CanCollide = true
			elseif d:IsA("PointLight") then
				d.Enabled = true
			end
		end
	end)
end

-- Knock loose props in front of an attack.
local function shoveProps(origin: Vector3, dir: Vector3, range: number, power: number)
	for _, m in CollectionService:GetTagged("Prop") do
		if m:IsA("Model") and m.PrimaryPart then
			local p = m.PrimaryPart.Position
			local d = p - origin
			if d.Magnitude < range + 4 and (d.Magnitude < 4 or d.Unit:Dot(dir) > 0.3) then
				local pp = m.PrimaryPart
				pp.AssemblyLinearVelocity += (dir * power + Vector3.new(0, power * 0.4, 0)) / math.max(1, pp.AssemblyMass / 40)
				if m:GetAttribute("Explosive") and power > 50 then
					Combat.explode(m, nil)
				end
			end
		end
	end
end

---------------------------------------------------------------- attacks

local function attack(player: Player, kind: unknown, aim: unknown)
	if not RateLimit.allow(player, "Attack", 8, 10) then
		return
	end
	if kind ~= "light" and kind ~= "heavy" and kind ~= "slam" then
		return
	end
	local dir = RateLimit.unitVector(aim)
	local state = PlayerState.get(player)
	local humanoid, root = PlayerState.humanoidOf(player)
	if not dir or not state or not humanoid or not root or state.transforming then
		return
	end
	if held[player] then
		return
	end
	local form = formOf(player)
	local stats = Config.FORMS[form :: any]
	if not stats then
		return
	end
	local flat = Vector3.new(dir.X, 0, dir.Z)
	if flat.Magnitude < 0.05 then
		flat = root.CFrame.LookVector
	end
	flat = Vector3.new(flat.X, 0, flat.Z).Unit
	local mul = PlayerState.damageMul(player)
	local character = player.Character

	if kind == "light" then
		if not cooldown(player, "light", Config.LIGHT_COOLDOWN) then
			return
		end
		local chain = lightChain[player]
		local t = os.clock()
		if not chain or t - chain.at > 0.9 then
			chain = { index = 0, at = t }
			lightChain[player] = chain
		end
		chain.index = chain.index % 3 + 1
		chain.at = t
		local finisherHit = chain.index == 3
		fx:FireAllClients("swing", { character = character, kind = if form == "human" then "punch" else "claw", side = chain.index % 2 })
		local dmg = stats.light * mul * (if finisherHit then 1.6 else 1)
		local hits = NPCs.inCone(root.Position, flat, stats.reach, 0.25)
		for i, npc in hits do
			if i > (if form == "human" then 1 else 3) then
				break
			end
			local dealt = NPCs.damage(npc, dmg, player, {
				knockback = flat * (if finisherHit then 60 else 18) + Vector3.new(0, if finisherHit then 30 else 6, 0),
				stagger = if finisherHit then 0.8 else 0.25,
				kind = if finisherHit then "heavy" else "light",
			})
			PlayerState.onHit(player, dealt)
		end
		damageNests(player, root.Position, stats.reach, dmg)
		shoveProps(root.Position, flat, stats.reach, if form == "wolf" then 60 else 25)
	elseif kind == "heavy" then
		if not cooldown(player, "heavy", Config.HEAVY_COOLDOWN) then
			return
		end
		fx:FireAllClients("swing", { character = character, kind = "heavy", side = 1 })
		-- resolve after the wind-up on server time
		task.delay(0.22, function()
			local _, r = PlayerState.humanoidOf(player)
			if not r then
				return
			end
			local dmg = stats.heavy * mul
			for i, npc in NPCs.inCone(r.Position, flat, stats.reach * 1.2, 0.1) do
				if i > 5 then
					break
				end
				local dealt = NPCs.damage(npc, dmg, player, {
					knockback = flat * (if form == "wolf" then 110 else 70) + Vector3.new(0, 45, 0),
					stagger = 1.1,
					kind = "heavy",
				})
				PlayerState.onHit(player, dealt)
			end
			damageNests(player, r.Position, stats.reach * 1.2, dmg * 1.5)
			shoveProps(r.Position, flat, stats.reach * 1.3, if form == "wolf" then 140 else 70)
			fx:FireAllClients("impact", { pos = r.Position + flat * stats.reach * 0.7, power = if form == "wolf" then 1 else 0.6 })
		end)
	elseif kind == "slam" then
		if form == "human" or not cooldown(player, "slam", Config.SLAM_COOLDOWN) then
			return
		end
		local radius = if form == "wolf" then 26 else 18
		local dmg = stats.heavy * 0.9 * mul
		fx:FireAllClients("slam", { pos = root.Position, radius = radius })
		for _, npc in NPCs.inRadius(root.Position, radius) do
			local away = npc.root.Position - root.Position
			away = Vector3.new(away.X, 0, away.Z)
			local push = if away.Magnitude > 0.1 then away.Unit else flat
			local dealt = NPCs.damage(npc, dmg, player, { knockback = push * 70 + Vector3.new(0, 60, 0), stagger = 1.2, kind = "heavy" })
			PlayerState.onHit(player, dealt)
		end
		damageNests(player, root.Position, radius, dmg)
		for _, m in CollectionService:GetTagged("Prop") do
			if m:IsA("Model") and m.PrimaryPart and (m.PrimaryPart.Position - root.Position).Magnitude < radius then
				local pp = m.PrimaryPart
				pp.AssemblyLinearVelocity += Vector3.new(0, 60, 0) / math.max(1, pp.AssemblyMass / 60)
			end
		end
	end
end

---------------------------------------------------------------- grab & throw

local function release(player: Player): Held?
	local h = held[player]
	if not h then
		return nil
	end
	held[player] = nil
	player:SetAttribute("Holding", nil)
	if h.weld.Parent then
		h.weld:Destroy()
	end
	for _, p in h.massless do
		p.Massless = false
	end
	for _, p in h.collide do
		p.CanCollide = true
	end
	if h.npc then
		NPCs.setHeld(h.npc, nil)
	end
	return h
end

local function grab(player: Player)
	local _, root = PlayerState.humanoidOf(player)
	local state = PlayerState.get(player)
	if not root or not state or held[player] or state.transforming then
		return
	end
	local form = formOf(player)
	local tier = TIER[form] or 1
	local best: Model? = nil
	local bestNpc: NPCs.NPC? = nil
	local bestD = Config.GRAB_RANGE * (if form == "wolf" then 1.4 else 1)
	-- people first (hybrid and beast only), then props
	if form ~= "human" then
		for _, npc in NPCs.inRadius(root.Position, bestD) do
			if npc.kind ~= "alpha" and npc.kind ~= "deer" and not npc.heldBy then
				local d = (npc.root.Position - root.Position).Magnitude
				if d < bestD then
					best, bestNpc, bestD = npc.model, npc, d
				end
			end
		end
	end
	if not best then
		for _, m in CollectionService:GetTagged("Prop") do
			if m:IsA("Model") and m.PrimaryPart and m.Parent then
				local t = m:GetAttribute("Tier")
				local d = (m.PrimaryPart.Position - root.Position).Magnitude
				if typeof(t) == "number" and t <= tier and d < bestD then
					best, bestD = m, d
				end
			end
		end
	end
	if not best then
		return
	end
	local model = best
	local primary = if bestNpc then bestNpc.root else model.PrimaryPart
	if not primary then
		return
	end
	if bestNpc then
		NPCs.setHeld(bestNpc, player)
	end
	-- lift overhead (big things) or hold out in front (people)
	local size = model:GetExtentsSize()
	local offset = if bestNpc
		then CFrame.new(0, 1.2, -4) * CFrame.Angles(math.rad(-80), 0, 0)
		else CFrame.new(0, 3 + size.Y * 0.5 + root.Size.Y, -1)
	primary.CFrame = root.CFrame * offset
	local massless: { BasePart } = {}
	local collide: { BasePart } = {}
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = false
			if not p.Massless then
				p.Massless = true
				table.insert(massless, p)
			end
			if p.CanCollide then
				p.CanCollide = false
				table.insert(collide, p)
			end
		end
	end
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = root
	weld.Part1 = primary
	weld.Parent = root
	held[player] = { kind = if bestNpc then "npc" else "prop", model = model, weld = weld, npc = bestNpc, massless = massless, collide = collide }
	player:SetAttribute("Holding", model.Name)
	fx:FireAllClients("grab", { character = player.Character, model = model })
end

local function randSigned(): number
	return math.random() * 2 - 1
end

local function throw(player: Player, aim: unknown)
	local dir = RateLimit.unitVector(aim)
	local _, root = PlayerState.humanoidOf(player)
	if not dir or not root then
		return
	end
	local h = release(player)
	if not h then
		return
	end
	local form = formOf(player)
	local primary = if h.npc then h.npc.root else h.model.PrimaryPart
	if not primary or not primary.Parent then
		return
	end
	pcall(function()
		primary:SetNetworkOwner(nil)
	end)
	local speed = if form == "wolf" then 170 else if form == "hybrid" then 130 else 80
	local launch = Vector3.new(dir.X, math.max(dir.Y, -0.2) + 0.25, dir.Z).Unit
	primary.CFrame = root.CFrame * CFrame.new(0, 4, -6)
	primary.AssemblyLinearVelocity = launch * speed
	primary.AssemblyAngularVelocity = Vector3.new(randSigned(), randSigned(), randSigned()) * 6
	local mass = primary.AssemblyMass
	table.insert(thrown, {
		model = h.model,
		part = primary,
		by = player,
		untilT = os.clock() + 3,
		damage = math.clamp(18 + mass * 0.08, 25, 110),
		hit = { [h.model] = true },
		explosive = h.model:GetAttribute("Explosive") == true,
		npc = h.npc,
	})
	fx:FireAllClients("throw", { character = player.Character })
	if h.npc then
		local npc = h.npc
		npc.humanoid.PlatformStand = true
		task.delay(1.6, function()
			if npc.alive then
				npc.humanoid.PlatformStand = false
				NPCs.damage(npc, 30, player, { stagger = 1.2, kind = "heavy" })
			end
		end)
	end
end

function Combat.explode(model: Model, by: Player?)
	if model:GetAttribute("Exploded") then
		return
	end
	model:SetAttribute("Exploded", true)
	local pos = model:GetPivot().Position
	fx:FireAllClients("explode", { pos = pos, radius = 24, color = Color3.fromRGB(255, 140, 40) })
	local blast = Instance.new("Explosion")
	blast.Position = pos
	blast.BlastRadius = 24
	blast.BlastPressure = 0
	blast.DestroyJointRadiusPercent = 0
	blast.Visible = false
	blast.Parent = workspace
	for _, npc in NPCs.inRadius(pos, 24) do
		local away = (npc.root.Position - pos)
		NPCs.damage(npc, 70, by, { knockback = (if away.Magnitude > 0.1 then away.Unit else Vector3.yAxis) * 90 + Vector3.new(0, 70, 0), stagger = 1.5, kind = "explosion" })
	end
	for _, player in Players:GetPlayers() do
		local _, r = PlayerState.humanoidOf(player)
		if r and (r.Position - pos).Magnitude < 20 then
			PlayerState.damage(player, 18, { unblockable = true })
		end
	end
	for _, m in CollectionService:GetTagged("Prop") do
		if m ~= model and m:IsA("Model") and m.PrimaryPart and (m.PrimaryPart.Position - pos).Magnitude < 24 then
			local d = m.PrimaryPart.Position - pos
			m.PrimaryPart.AssemblyLinearVelocity += ((if d.Magnitude > 0.1 then d.Unit else Vector3.yAxis) * 80 + Vector3.new(0, 60, 0)) / math.max(1, m.PrimaryPart.AssemblyMass / 50)
		end
	end
	model:Destroy()
end

local function updateThrown()
	local t = os.clock()
	for i = #thrown, 1, -1 do
		local th = thrown[i]
		local part = th.part
		if t > th.untilT or not part.Parent then
			table.remove(thrown, i)
			continue
		end
		local speed = part.AssemblyLinearVelocity.Magnitude
		if speed < 25 and t > th.untilT - 2.7 then
			if th.explosive then
				Combat.explode(th.model, th.by)
			end
			table.remove(thrown, i)
			continue
		end
		for _, npc in NPCs.inRadius(part.Position, 7) do
			if not th.hit[npc.model] and npc ~= th.npc then
				th.hit[npc.model] = true
				local dealt = NPCs.damage(npc, th.damage, th.by, {
					knockback = part.AssemblyLinearVelocity.Unit * 60 + Vector3.new(0, 40, 0),
					stagger = 1.5,
					kind = "heavy",
				})
				PlayerState.onHit(th.by, dealt)
				if th.explosive then
					Combat.explode(th.model, th.by)
					table.remove(thrown, i)
					break
				end
			end
		end
		if th.model.Parent then
			damageNests(th.by, part.Position, 4, th.damage * 0.6)
		end
	end
end

---------------------------------------------------------------- actions

local function action(player: Player, name: unknown, arg: unknown)
	if not RateLimit.allow(player, "Action", 10, 12) then
		return
	end
	if typeof(name) ~= "string" then
		return
	end
	local state = PlayerState.get(player)
	local humanoid, root = PlayerState.humanoidOf(player)
	if not state or not humanoid or not root then
		return
	end
	local form = formOf(player)

	if name == "block" then
		if typeof(arg) ~= "boolean" then
			return
		end
		PlayerState.setBlocking(player, arg and not held[player])
	elseif name == "dash" then
		if cooldown(player, "dash", Config.DASH_COOLDOWN) then
			PlayerState.grantIFrames(player, Config.DASH_IFRAMES)
			fx:FireAllClients("dash", { character = player.Character })
		end
	elseif name == "howl" then
		if form == "human" or not cooldown(player, "howl", Config.HOWL_COOLDOWN) then
			return
		end
		local rank = PlayerState.skill(player, "howl")
		local radius = 45 + (if rank >= 2 then 25 else 0)
		fx:FireAllClients("howl", { character = player.Character, radius = radius })
		for _, npc in NPCs.inRadius(root.Position, radius) do
			if npc.kind == "civilian" or npc.kind == "deer" then
				npc.state = "flee"
				npc.target = player
			elseif npc.kind ~= "alpha" then
				NPCs.stun(npc, 1.6 + rank * 0.8)
				if rank >= 2 then
					NPCs.makeVulnerable(npc, 6)
				end
			end
		end
		PlayerState.addRage(player, 15)
		Bus.emit("Howled", player, root.Position)
	elseif name == "frenzy" then
		PlayerState.startFrenzy(player)
	elseif name == "grab" then
		if held[player] then
			throw(player, root.CFrame.LookVector)
		else
			grab(player)
		end
	elseif name == "throw" then
		if held[player] then
			throw(player, arg)
		end
	elseif name == "finish" then
		if form == "human" or held[player] or not cooldown(player, "finish", 1) then
			return
		end
		local stats = Config.FORMS[form :: any]
		for _, npc in NPCs.inRadius(root.Position, stats.reach + 2) do
			if NPCs.finishable(npc) and npc.kind ~= "civilian" then
				fx:FireAllClients("finisher", { character = player.Character, model = npc.model, kind = npc.kind })
				state.iframesUntil = os.clock() + 1
				task.delay(0.35, function()
					if npc.alive then
						local away = (npc.root.Position - root.Position) * Vector3.new(1, 0, 1)
						NPCs.damage(npc, npc.humanoid.Health + 1, player, {
							finisher = true,
							kind = "finisher",
							knockback = (if away.Magnitude > 0.1 then away.Unit else root.CFrame.LookVector) * 120 + Vector3.new(0, 70, 0),
						})
						PlayerState.addRage(player, 25)
					end
				end)
				return
			end
		end
	elseif name == "skill" then
		PlayerState.unlockSkill(player, arg)
	elseif name == "senses" then
		-- purely visual; nothing to validate
		return
	end
end

---------------------------------------------------------------- lifecycle

function Combat.init()
	fx = Net.event("Fx")
end

function Combat.start()
	Net.event("Attack").OnServerEvent:Connect(attack)
	Net.event("Action").OnServerEvent:Connect(action)
	Players.PlayerRemoving:Connect(function(player)
		release(player)
		readyAt[player] = nil
		lightChain[player] = nil
	end)
	-- drop whatever you hold when you change shape or die
	Bus.on("Transformed", function(player: Player)
		local h = held[player]
		if h then
			local tier = TIER[formOf(player)] or 1
			local need = h.model:GetAttribute("Tier")
			if h.npc or (typeof(need) == "number" and need > tier) then
				release(player)
			end
		end
	end)
	RunService.Heartbeat:Connect(function()
		updateThrown()
		for player, h in held do
			local humanoid = PlayerState.humanoidOf(player)
			if not humanoid or not h.model.Parent or (h.npc and not h.npc.alive) then
				release(player)
			end
		end
	end)
end

return Combat
