--!strict
-- Every non-player creature in Greyhaven: civilians, police, silver hunters,
-- vampires, ghouls, rival werewolves, the Alpha and deer. Spawns them around
-- players, runs their AI on the server, resolves their attacks against the
-- player (block / parry / dodge aware), and handles damage, knockback,
-- stagger, being grabbed and thrown, ragdoll deaths and kill events.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local Debris = game:GetService("Debris")
local CollectionService = game:GetService("CollectionService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Types = require(Shared.Types)
local Net = require(Shared.Net)
local Moon = require(Shared.Moon)
local WorldLayout = require(Shared.WorldLayout)
local Lib = script.Parent.Parent.Lib
local Bus = require(Lib.Bus)
local WerewolfLook = require(Lib.WerewolfLook)
local PlayerState = require(script.Parent.PlayerState)
local Reputation = require(script.Parent.Reputation)
local World = require(script.Parent.World)

export type NPC = {
	id: number,
	kind: string,
	def: Types.NPCDef,
	model: Model,
	humanoid: Humanoid,
	root: BasePart,
	home: Vector3,
	alive: boolean,
	target: Player?,
	victim: NPC?,
	state: string,
	nextThink: number,
	attackReadyAt: number,
	stunUntil: number,
	vulnerableUntil: number,
	heldBy: Player?,
	lastAttacker: Player?,
	lastPos: Vector3,
	stuckTime: number,
	special: number,
	guard: string?,
	tracks: { [string]: AnimationTrack },
	playing: string?,
}

local fx: RemoteEvent
local npcs: { [Model]: NPC } = {}
local list: { NPC } = {}
local nextId = 0
local templates: { [string]: { Model } } = {}
local folder: Folder
local rng = Random.new()

local NPCs = {}

local MAX_NPCS = 80
local DESPAWN_DIST = 520

local ANIMS = {
	idle = "rbxassetid://507766388",
	walk = "rbxassetid://507777826",
	run = "rbxassetid://507767714",
	fall = "rbxassetid://507767968",
}

---------------------------------------------------------------- looks

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

local SKINS = { rgb(234, 192, 160), rgb(198, 150, 112), rgb(150, 102, 70), rgb(96, 64, 44), rgb(242, 210, 184) }
local CLOTHES = { rgb(60, 70, 96), rgb(110, 40, 40), rgb(40, 80, 60), rgb(150, 130, 90), rgb(70, 70, 74), rgb(140, 90, 140), rgb(200, 190, 170) }

local function describe(skin: Color3, shirt: Color3, pants: Color3, scale: number?): HumanoidDescription
	local d = Instance.new("HumanoidDescription")
	d.HeadColor = skin
	d.TorsoColor = shirt
	d.LeftArmColor = shirt
	d.RightArmColor = shirt
	d.LeftLegColor = pants
	d.RightLegColor = pants
	local s = scale or 1
	d.HeightScale = s
	d.WidthScale = s
	d.DepthScale = s
	d.HeadScale = 1
	return d
end

local function weld(to: BasePart, size: Vector3, offset: CFrame, color: Color3, material: Enum.Material?, shape: Enum.PartType?): BasePart
	local p = Instance.new("Part")
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	if shape then
		p.Shape = shape
	end
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.CFrame = to.CFrame * offset
	local w = Instance.new("WeldConstraint")
	w.Part0 = to
	w.Part1 = p
	w.Parent = p
	p.Parent = to.Parent
	return p
end

local function bodyPart(model: Model, name: string): BasePart?
	local p = model:FindFirstChild(name)
	return if p and p:IsA("BasePart") then p else nil
end

local function dress(model: Model, kind: string)
	local head = bodyPart(model, "Head")
	local torso = bodyPart(model, "UpperTorso")
	local hand = bodyPart(model, "RightHand")
	if not head or not torso then
		return
	end
	local face = head:FindFirstChild("face")
	local s = head.Size.Y
	if kind == "civilian" and rng:NextNumber() < 0.6 then
		weld(head, Vector3.new(1.05, 0.4, 1.05) * s, CFrame.new(0, 0.42 * s, 0.05 * s), CLOTHES[rng:NextInteger(1, #CLOTHES)]:Lerp(rgb(20, 16, 12), 0.6), Enum.Material.Fabric, Enum.PartType.Ball)
	elseif kind == "police" then
		weld(head, Vector3.new(0.35, 1.1, 1.1) * s, CFrame.new(0, 0.5 * s, 0) * CFrame.Angles(0, 0, math.pi / 2), rgb(20, 26, 60), Enum.Material.Fabric, Enum.PartType.Cylinder)
		weld(head, Vector3.new(1.0, 0.08, 0.5) * s, CFrame.new(0, 0.38 * s, -0.55 * s), rgb(10, 10, 14))
		weld(torso, Vector3.new(0.25, 0.3, 0.05), CFrame.new(-0.45, 0.4, -torso.Size.Z / 2 - 0.03), rgb(230, 190, 60), Enum.Material.Neon)
		if hand then
			weld(hand, Vector3.new(0.25, 0.5, 1.2), CFrame.new(0, -0.3, -0.5), rgb(20, 20, 22), Enum.Material.Metal)
		end
	elseif kind == "hunter" then
		weld(head, Vector3.new(2.2, 0.12, 2.2) * s, CFrame.new(0, 0.45 * s, 0), rgb(46, 34, 26), Enum.Material.Leather)
		weld(head, Vector3.new(1.0, 0.5, 1.0) * s, CFrame.new(0, 0.7 * s, 0), rgb(46, 34, 26), Enum.Material.Leather)
		weld(torso, Vector3.new(torso.Size.X * 1.1, torso.Size.Y * 2.2, torso.Size.Z * 1.15), CFrame.new(0, -torso.Size.Y * 0.55, 0.02), rgb(62, 50, 40), Enum.Material.Leather)
		if hand then
			weld(hand, Vector3.new(0.3, 0.35, 2.6), CFrame.new(0, -0.2, -1), rgb(80, 56, 34), Enum.Material.Wood)
			weld(hand, Vector3.new(2.2, 0.15, 0.15), CFrame.new(0, -0.2, -2), rgb(200, 205, 215), Enum.Material.Metal)
		end
	elseif kind == "vampire" then
		weld(torso, Vector3.new(torso.Size.X * 1.3, torso.Size.Y * 2.6, 0.12), CFrame.new(0, -torso.Size.Y * 0.7, torso.Size.Z / 2 + 0.08), rgb(60, 8, 16), Enum.Material.Fabric)
		weld(torso, Vector3.new(torso.Size.X * 1.2, 0.7, 0.15), CFrame.new(0, torso.Size.Y * 0.55, torso.Size.Z / 2 + 0.05) * CFrame.Angles(math.rad(-25), 0, 0), rgb(20, 4, 8), Enum.Material.Fabric)
		for _, side in { -1, 1 } do
			weld(head, Vector3.new(0.16, 0.07, 0.05) * s, CFrame.new(side * 0.2 * s, 0.1 * s, -0.58 * s), rgb(255, 20, 40), Enum.Material.Neon)
		end
		weld(head, Vector3.new(1.02, 0.35, 1.02) * s, CFrame.new(0, 0.42 * s, 0.06 * s), rgb(14, 10, 12), Enum.Material.SmoothPlastic, Enum.PartType.Ball)
	elseif kind == "ghoul" then
		for _, side in { -1, 1 } do
			weld(head, Vector3.new(0.14, 0.14, 0.05) * s, CFrame.new(side * 0.2 * s, 0.1 * s, -0.58 * s), rgb(200, 255, 80), Enum.Material.Neon)
		end
		local waist = torso:FindFirstChild("Waist")
		if waist and waist:IsA("Motor6D") then
			waist.C0 = waist.C0 * CFrame.Angles(math.rad(-28), 0, 0)
		end
		if face and face:IsA("Decal") then
			face.Transparency = 1
		end
	end
end

local function makeHumanoidModel(kind: string, desc: HumanoidDescription, parent: Instance): Model
	local model = Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	model.Name = Config.NPCS[kind].name
	model.Parent = parent -- ApplyDescription needs the model inside the DataModel
	dress(model, kind)
	if kind == "rival" or kind == "alpha" then
		WerewolfLook.apply(model, "wolf", desc)
	end
	return model
end

local function makeDeer(): Model
	local model = Instance.new("Model")
	model.Name = "Deer"
	local brown = rgb(130, 90, 56)
	local function p(name: string, size: Vector3, cf: CFrame, color: Color3?): BasePart
		local part = Instance.new("Part")
		part.Name = name
		part.Size = size
		part.CFrame = cf
		part.Color = color or brown
		part.Material = Enum.Material.Fabric
		part.CanCollide = name == "HumanoidRootPart"
		part.Massless = name ~= "HumanoidRootPart"
		part.Parent = model
		return part
	end
	local root = p("HumanoidRootPart", Vector3.new(2.4, 2.6, 5), CFrame.new(0, 4.4, 0))
	root.Transparency = 1
	p("Body", Vector3.new(2.2, 2.2, 4.6), CFrame.new(0, 4.6, 0))
	p("Neck", Vector3.new(0.9, 2.4, 0.9), CFrame.new(0, 6.2, -2.2) * CFrame.Angles(math.rad(-30), 0, 0))
	p("Head", Vector3.new(1, 1, 1.8), CFrame.new(0, 7.3, -2.9))
	p("Tail", Vector3.new(0.5, 0.6, 0.4), CFrame.new(0, 5.2, 2.4), rgb(240, 236, 226))
	for _, o in { Vector3.new(-0.7, 0, -1.8), Vector3.new(0.7, 0, -1.8), Vector3.new(-0.7, 0, 1.8), Vector3.new(0.7, 0, 1.8) } do
		p("Leg", Vector3.new(0.4, 3.6, 0.4), CFrame.new(o.X, 1.8, o.Z), rgb(110, 76, 48))
	end
	for _, side in { -1, 1 } do
		p("Antler", Vector3.new(0.18, 1.8, 0.18), CFrame.new(side * 0.4, 8.4, -2.7) * CFrame.Angles(0, 0, side * -0.5), rgb(220, 205, 180))
	end
	for _, part in model:GetChildren() do
		if part:IsA("BasePart") and part ~= root then
			local w = Instance.new("WeldConstraint")
			w.Part0 = root
			w.Part1 = part
			w.Parent = part
		end
	end
	local humanoid = Instance.new("Humanoid")
	humanoid.RigType = Enum.HumanoidRigType.R15
	humanoid.HipHeight = 3.1
	humanoid.RequiresNeck = false
	humanoid.Parent = model
	model.PrimaryPart = root
	return model
end

local function buildTemplates()
	local tf = Instance.new("Folder")
	tf.Name = "NPCTemplates"
	tf.Parent = game:GetService("ServerStorage")
	local function add(kind: string, model: Model)
		model.Parent = tf
		templates[kind] = templates[kind] or {}
		table.insert(templates[kind], model)
	end
	for i = 1, 8 do
		local skin = SKINS[(i - 1) % #SKINS + 1]
		add("civilian", makeHumanoidModel("civilian", describe(skin, CLOTHES[rng:NextInteger(1, #CLOTHES)], CLOTHES[rng:NextInteger(1, #CLOTHES)]), tf))
	end
	for i = 1, 3 do
		add("police", makeHumanoidModel("police", describe(SKINS[i], rgb(30, 40, 80), rgb(20, 24, 40)), tf))
		add("hunter", makeHumanoidModel("hunter", describe(SKINS[i + 1], rgb(70, 56, 44), rgb(40, 36, 30), 1.05), tf))
	end
	for _ = 1, 2 do
		add("vampire", makeHumanoidModel("vampire", describe(rgb(226, 222, 230), rgb(24, 20, 26), rgb(18, 16, 20), 1.08), tf))
		add("ghoul", makeHumanoidModel("ghoul", describe(rgb(120, 140, 110), rgb(70, 66, 58), rgb(50, 46, 40), 0.95), tf))
		add("rival", makeHumanoidModel("rival", describe(rgb(60, 50, 44), rgb(60, 50, 44), rgb(60, 50, 44)), tf))
	end
	add("alpha", makeHumanoidModel("alpha", describe(rgb(30, 28, 30), rgb(30, 28, 30), rgb(30, 28, 30), 1.35), tf))
	add("deer", makeDeer())
end

---------------------------------------------------------------- spawning

local function loadTracks(npc: NPC)
	local animator = npc.humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		animator = Instance.new("Animator")
		animator.Parent = npc.humanoid
	end
	if npc.kind == "deer" then
		return
	end
	for name, id in ANIMS do
		local anim = Instance.new("Animation")
		anim.AnimationId = id
		local ok, track = pcall(function()
			return (animator :: Animator):LoadAnimation(anim)
		end)
		if ok and track then
			track.Looped = true
			npc.tracks[name] = track
		end
	end
end

local function playTrack(npc: NPC, name: string, speed: number?)
	if npc.playing ~= name then
		local old = npc.playing and npc.tracks[npc.playing]
		if old then
			old:Stop(0.2)
		end
		local track = npc.tracks[name]
		if track then
			track:Play(0.2)
		end
		npc.playing = name
	end
	local track = npc.tracks[name]
	if track and speed then
		track:AdjustSpeed(speed)
	end
end

function NPCs.spawn(kind: string, pos: Vector3, guard: string?): NPC?
	local pool = templates[kind]
	local def = Config.NPCS[kind]
	if not pool or not def or #list >= MAX_NPCS then
		return nil
	end
	local model = pool[rng:NextInteger(1, #pool)]:Clone()
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	local root = model:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root or not root:IsA("BasePart") then
		model:Destroy()
		return nil
	end
	local y = World.groundY(pos.X, pos.Z)
	model:PivotTo(CFrame.new(pos.X, y + 5, pos.Z) * CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0))
	humanoid.MaxHealth = def.health
	humanoid.Health = def.health
	humanoid.WalkSpeed = def.walk
	humanoid.BreakJointsOnDeath = false
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	model:SetAttribute("NPCType", kind)
	model:SetAttribute("Hostile", def.damage > 0 and kind ~= "police" and kind ~= "hunter")
	model.Parent = folder
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
	CollectionService:AddTag(model, "NPC")
	nextId += 1
	local npc: NPC = {
		id = nextId,
		kind = kind,
		def = def,
		model = model,
		humanoid = humanoid,
		root = root,
		home = pos,
		alive = true,
		target = nil,
		victim = nil,
		state = "idle",
		nextThink = os.clock() + rng:NextNumber(0, 0.3),
		attackReadyAt = 0,
		stunUntil = 0,
		vulnerableUntil = 0,
		heldBy = nil,
		lastAttacker = nil,
		lastPos = root.Position,
		stuckTime = 0,
		special = os.clock() + rng:NextNumber(3, 7),
		guard = guard,
		tracks = {},
		playing = nil,
	}
	npcs[model] = npc
	table.insert(list, npc)
	loadTracks(npc)
	humanoid.Died:Connect(function()
		NPCs.kill(npc, npc.lastAttacker, false)
	end)
	return npc
end

local function remove(npc: NPC)
	npcs[npc.model] = nil
	local i = table.find(list, npc)
	if i then
		table.remove(list, i)
	end
end

local function ragdoll(model: Model)
	for _, motor in model:GetDescendants() do
		if motor:IsA("Motor6D") and motor.Part0 and motor.Part1 then
			local a0 = Instance.new("Attachment")
			a0.CFrame = motor.C0
			a0.Parent = motor.Part0
			local a1 = Instance.new("Attachment")
			a1.CFrame = motor.C1
			a1.Parent = motor.Part1
			local socket = Instance.new("BallSocketConstraint")
			socket.Attachment0 = a0
			socket.Attachment1 = a1
			socket.LimitsEnabled = true
			socket.TwistLimitsEnabled = true
			socket.Parent = motor.Part0
			motor.Enabled = false
		end
	end
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") and p.Name ~= "HumanoidRootPart" and not p.Massless then
			p.CanCollide = true
		end
	end
end

---------------------------------------------------------------- queries

function NPCs.fromModel(model: Instance?): NPC?
	if not model or not model:IsA("Model") then
		return nil
	end
	return npcs[model]
end

function NPCs.all(): { NPC }
	return list
end

-- Is this NPC currently an enemy of this player?
function NPCs.hostileTo(npc: NPC, player: Player): boolean
	local k = npc.kind
	if k == "vampire" or k == "ghoul" or k == "rival" or k == "alpha" then
		return true
	elseif k == "hunter" then
		return Reputation.huntersHostile(player)
	elseif k == "police" then
		return Reputation.policeHostile(player)
	end
	return false
end

-- NPCs inside a cone in front of `origin` (flat), nearest first.
function NPCs.inCone(origin: Vector3, dir: Vector3, range: number, minDot: number): { NPC }
	local out = {}
	local flat = Vector3.new(dir.X, 0, dir.Z)
	if flat.Magnitude < 1e-3 then
		return out
	end
	flat = flat.Unit
	for _, npc in list do
		if npc.alive and not npc.heldBy then
			local d = npc.root.Position - origin
			local reach = range + npc.root.Size.X * 0.5
			if d.Magnitude <= reach and math.abs(d.Y) < reach then
				local fd = Vector3.new(d.X, 0, d.Z)
				local dot = if fd.Magnitude < 2 then 1 else fd.Unit:Dot(flat)
				if dot >= minDot then
					table.insert(out, npc)
				end
			end
		end
	end
	table.sort(out, function(a, b)
		return (a.root.Position - origin).Magnitude < (b.root.Position - origin).Magnitude
	end)
	return out
end

function NPCs.inRadius(origin: Vector3, radius: number): { NPC }
	local out = {}
	for _, npc in list do
		if npc.alive and (npc.root.Position - origin).Magnitude <= radius then
			table.insert(out, npc)
		end
	end
	return out
end

---------------------------------------------------------------- damage

export type HitInfo = {
	knockback: Vector3?,
	stagger: number?,
	kind: string?,
	finisher: boolean?,
}

function NPCs.damage(npc: NPC, amount: number, attacker: Player?, info: HitInfo?): number
	if not npc.alive then
		return 0
	end
	if os.clock() < npc.vulnerableUntil then
		amount *= 1.3
	end
	amount = math.max(0, amount)
	npc.lastAttacker = attacker or npc.lastAttacker
	-- anything you hit turns on you (civilians and deer just flee)
	if attacker and npc.def.damage > 0 then
		npc.target = attacker
		npc.state = "chase"
	elseif attacker then
		npc.state = "flee"
		npc.target = attacker
	end
	if npc.kind == "police" and attacker then
		Reputation.addHeat(attacker, 0.6)
	end
	local info2 = info or {}
	if info2.knockback and npc.kind ~= "alpha" then
		npc.root:ApplyImpulse(info2.knockback * npc.root.AssemblyMass)
	end
	if info2.stagger then
		npc.stunUntil = math.max(npc.stunUntil, os.clock() + info2.stagger)
	end
	fx:FireAllClients("hit", {
		pos = npc.root.Position + Vector3.new(0, 1.5, 0),
		amount = math.floor(amount + 0.5),
		kind = info2.kind or "light",
		blood = npc.kind ~= "ghoul",
	})
	if npc.humanoid.Health - amount <= 0 then
		NPCs.kill(npc, attacker, info2.finisher == true)
	else
		npc.humanoid.Health -= amount
	end
	return amount
end

function NPCs.kill(npc: NPC, killer: Player?, finisher: boolean)
	if not npc.alive then
		return
	end
	npc.alive = false
	npc.humanoid.Health = 0
	for _, track in npc.tracks do
		track:Stop(0)
	end
	remove(npc)
	if npc.heldBy then
		npc.heldBy = nil
	end
	if npc.kind ~= "deer" then
		ragdoll(npc.model)
	end
	fx:FireAllClients("kill", { pos = npc.root.Position, kind = npc.kind, finisher = finisher })
	Bus.emit("NPCKilled", killer, npc.kind, npc.root.Position, finisher)
	Debris:AddItem(npc.model, 8)
end

-- Can this NPC be finished off right now?
function NPCs.finishable(npc: NPC): boolean
	return npc.alive
		and npc.kind ~= "alpha"
		and (npc.humanoid.Health <= npc.humanoid.MaxHealth * Config.FINISH_THRESHOLD or os.clock() < npc.stunUntil)
end

function NPCs.stun(npc: NPC, dur: number)
	npc.stunUntil = math.max(npc.stunUntil, os.clock() + dur)
	npc.humanoid:Move(Vector3.zero)
end

function NPCs.makeVulnerable(npc: NPC, dur: number)
	npc.vulnerableUntil = os.clock() + dur
end

-- Picked up by a player (welded to them by the Combat system).
function NPCs.setHeld(npc: NPC, by: Player?)
	npc.heldBy = by
	npc.humanoid.PlatformStand = by ~= nil
	if by then
		for _, track in npc.tracks do
			track:Stop(0.1)
		end
		npc.playing = nil
	end
end

---------------------------------------------------------------- AI helpers

local losParams = RaycastParams.new()
losParams.FilterType = Enum.RaycastFilterType.Exclude

local function canSee(from: Vector3, to: Vector3, ignore: { Instance }): boolean
	losParams.FilterDescendantsInstances = ignore
	local hit = workspace:Raycast(from, to - from, losParams)
	return hit == nil
end

local function nearestPlayer(npc: NPC, range: number, hostileOnly: boolean): (Player?, BasePart?, number)
	local best: Player? = nil
	local bestRoot: BasePart? = nil
	local bestD = range
	for _, player in Players:GetPlayers() do
		local _, root = PlayerState.humanoidOf(player)
		if root then
			local d = (root.Position - npc.root.Position).Magnitude
			if d < bestD and (not hostileOnly or NPCs.hostileTo(npc, player)) then
				best, bestRoot, bestD = player, root, d
			end
		end
	end
	return best, bestRoot, bestD
end

local function moveTo(npc: NPC, pos: Vector3, run: boolean)
	npc.humanoid.WalkSpeed = if run then npc.def.run else npc.def.walk
	npc.humanoid:MoveTo(pos)
end

local function wander(npc: NPC, radius: number)
	local a = rng:NextNumber(0, math.pi * 2)
	local r = rng:NextNumber(radius * 0.3, radius)
	moveTo(npc, npc.home + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r), false)
end

local function flee(npc: NPC, from: Vector3)
	local away = npc.root.Position - from
	away = Vector3.new(away.X, 0, away.Z)
	if away.Magnitude < 0.1 then
		away = Vector3.new(1, 0, 0)
	end
	moveTo(npc, npc.root.Position + away.Unit * 40, true)
end

local function face(npc: NPC, pos: Vector3)
	local p = npc.root.Position
	local flat = Vector3.new(pos.X, p.Y, pos.Z)
	if (flat - p).Magnitude > 0.1 then
		npc.root.CFrame = CFrame.lookAt(p, flat)
	end
end

-- Melee: wind up (clients show a warning), then hit if still in reach.
local function melee(npc: NPC, player: Player, root: BasePart)
	local t = os.clock()
	if t < npc.attackReadyAt then
		return
	end
	npc.attackReadyAt = t + (if npc.kind == "alpha" then 2.2 else 1.3)
	local windup = if npc.kind == "alpha" then 0.7 else 0.4
	fx:FireAllClients("windup", { model = npc.model, time = windup })
	npc.humanoid:Move(Vector3.zero)
	task.delay(windup, function()
		if not npc.alive or os.clock() < npc.stunUntil or npc.heldBy then
			return
		end
		face(npc, root.Position)
		fx:FireAllClients("swing", { model = npc.model, kind = "claw", side = rng:NextInteger(0, 1) })
		local d = (root.Position - npc.root.Position).Magnitude
		if d > npc.def.range + 3 then
			return
		end
		local result = PlayerState.damage(player, npc.def.damage, { attacker = npc.model, unblockable = npc.kind == "alpha" and rng:NextNumber() < 0.3 })
		if result == "parry" then
			NPCs.stun(npc, 1.4 * (1 + PlayerState.skill(player, "parry") * 0.5))
			fx:FireAllClients("stagger", { model = npc.model })
		elseif result == "hit" then
			local push = (root.Position - npc.root.Position) * Vector3.new(1, 0, 1)
			if push.Magnitude > 0.1 then
				root.AssemblyLinearVelocity += push.Unit * 30 + Vector3.new(0, 18, 0)
			end
		end
	end)
end

-- Ranged: aim, telegraph, then raycast with spread.
local function shoot(npc: NPC, player: Player, root: BasePart)
	local t = os.clock()
	if t < npc.attackReadyAt then
		return
	end
	npc.attackReadyAt = t + (if npc.kind == "hunter" then 2.4 else 1.4)
	face(npc, root.Position)
	npc.humanoid:Move(Vector3.zero)
	fx:FireAllClients("aim", { model = npc.model, time = 0.5 })
	task.delay(0.5, function()
		if not npc.alive or os.clock() < npc.stunUntil or npc.heldBy then
			return
		end
		local _, targetRoot = PlayerState.humanoidOf(player)
		if not targetRoot then
			return
		end
		local head = bodyPart(npc.model, "Head") or npc.root
		local from = head.Position
		local spread = if npc.kind == "hunter" then 2 else 4
		local aim = targetRoot.Position + targetRoot.AssemblyLinearVelocity * 0.12
			+ Vector3.new(rng:NextNumber(-spread, spread), rng:NextNumber(-spread * 0.5, spread * 0.5), rng:NextNumber(-spread, spread))
		local dir = (aim - from).Unit * (npc.def.range + 20)
		losParams.FilterDescendantsInstances = { npc.model }
		local hit = workspace:Raycast(from, dir, losParams)
		local to = if hit then hit.Position else from + dir
		fx:FireAllClients("shot", { from = from, to = to, silver = npc.kind == "hunter" })
		if hit and player.Character and hit.Instance:IsDescendantOf(player.Character) then
			local result = PlayerState.damage(player, npc.def.damage, { silver = npc.kind == "hunter", attacker = npc.model })
			if result == "parry" and PlayerState.skill(player, "parry") >= 2 then
				NPCs.damage(npc, npc.def.damage * 2, player, { kind = "reflect" })
			end
		end
	end)
end

---------------------------------------------------------------- AI

local function think(npc: NPC, now: number)
	if npc.heldBy then
		return
	end
	if now < npc.stunUntil then
		npc.humanoid:Move(Vector3.zero)
		return
	end
	local k = npc.kind
	local root = npc.root

	if k == "civilian" or k == "deer" then
		-- flee from monsters (and anyone who hurt them); witnesses raise heat
		local scare = if k == "deer" then 70 else 40
		local nearest: Player? = nil
		local nearestRoot: BasePart? = nil
		local bestD = scare
		for _, player in Players:GetPlayers() do
			local _, proot = PlayerState.humanoidOf(player)
			if proot then
				local form = player:GetAttribute("Form")
				local d = (proot.Position - root.Position).Magnitude
				local scary = k == "deer" or form ~= "human" or npc.target == player
				if scary and d < bestD then
					nearest, nearestRoot, bestD = player, proot, d
				end
			end
		end
		if nearest and nearestRoot then
			flee(npc, nearestRoot.Position)
			if k == "civilian" and WorldLayout.inCity(root.Position.X, root.Position.Z) then
				Reputation.witnessed(nearest, 0.35)
			end
			if npc.state ~= "flee" then
				npc.state = "flee"
				if k == "civilian" then
					fx:FireAllClients("scream", { model = npc.model })
				end
			end
		elseif npc.state == "flee" or npc.humanoid.MoveDirection.Magnitude < 0.1 then
			npc.state = "wander"
			if rng:NextNumber() < 0.6 then
				wander(npc, if k == "deer" then 60 else 50)
			end
		end
		return
	end

	-- vampires feed on civilians when no player is around
	local player, proot, dist = nearestPlayer(npc, if k == "alpha" then 140 else 120, true)
	if not player and k == "vampire" then
		local victim: NPC? = nil
		local bd = 80
		for _, other in list do
			if other.kind == "civilian" and other.alive then
				local d = (other.root.Position - root.Position).Magnitude
				if d < bd then
					victim, bd = other, d
				end
			end
		end
		if victim then
			if bd < 6 then
				if now >= npc.attackReadyAt then
					npc.attackReadyAt = now + 1.5
					fx:FireAllClients("swing", { model = npc.model, kind = "claw", side = 1 })
					NPCs.damage(victim, 9, nil, { kind = "bite" })
				end
			else
				moveTo(npc, victim.root.Position, true)
			end
			return
		end
	end

	if not player or not proot then
		npc.target = nil
		if npc.guard then
			if (root.Position - npc.home).Magnitude > 30 then
				moveTo(npc, npc.home, false)
			elseif npc.humanoid.MoveDirection.Magnitude < 0.1 and rng:NextNumber() < 0.3 then
				wander(npc, 20)
			end
		elseif npc.humanoid.MoveDirection.Magnitude < 0.1 and rng:NextNumber() < 0.4 then
			wander(npc, 60)
		end
		playTrack(npc, "idle")
		return
	end
	npc.target = player

	if npc.def.ranged then
		local eye = (bodyPart(npc.model, "Head") or root).Position
		local sees = dist < npc.def.range and canSee(eye, proot.Position, { npc.model, player.Character :: Model })
		if sees then
			if dist < 18 then
				flee(npc, proot.Position) -- keep distance
			else
				shoot(npc, player, proot)
			end
		else
			moveTo(npc, proot.Position, true)
		end
		return
	end

	-- melee archetypes: close in, with a special move each
	if now >= npc.special and dist > 18 and dist < 70 then
		npc.special = now + rng:NextNumber(4, 8)
		if k == "vampire" then
			-- blood-mist blink to the player's side
			local side = (proot.CFrame.RightVector * (if rng:NextNumber() < 0.5 then -6 else 6))
			fx:FireAllClients("blink", { from = root.Position, to = proot.Position + side })
			npc.model:PivotTo(CFrame.lookAt(proot.Position + side, proot.Position))
			return
		elseif k == "rival" or k == "alpha" then
			-- pounce
			face(npc, proot.Position)
			local dir = (proot.Position - root.Position) * Vector3.new(1, 0, 1)
			root.AssemblyLinearVelocity = dir.Unit * math.min(dist * 2.2, 110) + Vector3.new(0, 55, 0)
			fx:FireAllClients("roar", { model = npc.model })
			return
		end
	end
	if k == "alpha" and now >= npc.special - 2 and dist < 22 and npc.humanoid.Health < npc.humanoid.MaxHealth * 0.6 and now >= npc.attackReadyAt then
		-- ground slam shockwave (dodge or jump it)
		npc.attackReadyAt = now + 3
		npc.special = now + 7
		fx:FireAllClients("windup", { model = npc.model, time = 0.9 })
		task.delay(0.9, function()
			if not npc.alive then
				return
			end
			fx:FireAllClients("slam", { pos = root.Position, radius = 30 })
			for _, p in Players:GetPlayers() do
				local hum, r = PlayerState.humanoidOf(p)
				if hum and r and (r.Position - root.Position).Magnitude < 30 and hum.FloorMaterial ~= Enum.Material.Air then
					PlayerState.damage(p, 26, { attacker = npc.model, unblockable = true })
					r.AssemblyLinearVelocity += ((r.Position - root.Position).Unit + Vector3.new(0, 1, 0)) * 50
				end
			end
		end)
		return
	end
	if dist <= npc.def.range then
		melee(npc, player, proot)
	else
		moveTo(npc, proot.Position, true)
	end
end

local function animate(npc: NPC)
	if npc.heldBy or next(npc.tracks) == nil then
		return
	end
	local v = npc.root.AssemblyLinearVelocity
	local speed = Vector3.new(v.X, 0, v.Z).Magnitude
	if npc.humanoid.FloorMaterial == Enum.Material.Air and v.Y < -10 then
		playTrack(npc, "fall")
	elseif speed > 17 then
		playTrack(npc, "run", speed / 20)
	elseif speed > 1.5 then
		playTrack(npc, "walk", speed / 12)
	else
		playTrack(npc, "idle")
	end
end

---------------------------------------------------------------- population

local function countNear(kind: string, pos: Vector3, radius: number): number
	local n = 0
	for _, npc in list do
		if npc.kind == kind and (npc.root.Position - pos).Magnitude < radius then
			n += 1
		end
	end
	return n
end

local function randomNear(points: { Vector3 }, pos: Vector3, minD: number, maxD: number): Vector3?
	if #points == 0 then
		return nil
	end
	for _ = 1, 12 do
		local p = points[rng:NextInteger(1, #points)]
		local d = (p - pos).Magnitude
		if d > minD and d < maxD then
			return p
		end
	end
	return nil
end

local function sidewalk(p: Vector3): Vector3
	local off = WorldLayout.ROAD / 2 + 3
	return p + Vector3.new(if rng:NextNumber() < 0.5 then -off else off, 0, if rng:NextNumber() < 0.5 then -off else off)
end

local function populate()
	local built = World.get()
	local clock = Lighting.ClockTime
	local night = Moon.isNight(clock)
	local day = (workspace:GetAttribute("Day") :: number?) or 1
	local full = Moon.isFullMoon(day, clock) and night

	for _, player in Players:GetPlayers() do
		local _, root = PlayerState.humanoidOf(player)
		if not root then
			continue
		end
		local pos = root.Position
		local inCity = WorldLayout.inCity(pos.X, pos.Z)
		local L = WorldLayout.LANDMARKS

		if inCity or (pos - L.plaza).Magnitude < 700 then
			local want = if night then 12 else 22
			if countNear("civilian", pos, 260) < want then
				local p = randomNear(built.roadPoints, pos, 60, 240)
				if p then
					NPCs.spawn("civilian", sidewalk(p))
				end
			end
			if night and countNear("vampire", pos, 300) < (if full then 7 else 4) then
				local p = randomNear(built.roadPoints, pos, 90, 260)
				if p then
					NPCs.spawn("vampire", sidewalk(p))
				end
			end
			-- police respond to heat, arriving in a squad car
			local heat = Reputation.heat(player)
			if heat >= 1 and countNear("police", pos, 200) < math.floor(heat) * 2 then
				local p = randomNear(built.roadPoints, pos, 50, 150)
				if p then
					NPCs.spawn("police", p)
					Bus.emit("PoliceArrive", p)
				end
			end
		end
		if not inCity then
			if countNear("deer", pos, 300) < 6 then
				local p = randomNear(built.forestPoints, pos, 80, 280)
				if p then
					NPCs.spawn("deer", p)
				end
			end
			if countNear("hunter", pos, 320) < (if night then 4 else 2) then
				local p = randomNear(built.forestPoints, pos, 120, 300)
				if p then
					NPCs.spawn("hunter", p)
				end
			end
			if night and countNear("rival", pos, 320) < 2 then
				local p = randomNear(built.forestPoints, pos, 140, 300)
				if p then
					NPCs.spawn("rival", p)
				end
			end
		end
		if night and (pos - L.cemetery).Magnitude < 260 and countNear("ghoul", L.cemetery, 140) < 7 then
			NPCs.spawn("ghoul", L.cemetery + Vector3.new(rng:NextNumber(-55, 55), 0, rng:NextNumber(-45, 45)))
		end
		if (pos - L.lodge).Magnitude < 260 and countNear("hunter", L.lodge, 120) < 4 then
			NPCs.spawn("hunter", L.lodge + Vector3.new(rng:NextNumber(-40, 40), 0, rng:NextNumber(20, 50)), "lodge")
		end
		if (pos - L.den).Magnitude < 300 and countNear("alpha", L.den, 400) < 1 and not workspace:GetAttribute("AlphaCooldown") then
			NPCs.spawn("alpha", L.den + Vector3.new(0, 0, 20), "den")
		end
	end

	-- nest guards
	for id, nest in built.nests do
		if nest.Parent and ((nest:GetAttribute("Health") :: number?) or 0) > 0 then
			local p = nest:GetPivot().Position
			local near = false
			for _, player in Players:GetPlayers() do
				local _, root = PlayerState.humanoidOf(player)
				if root and (root.Position - p).Magnitude < 300 then
					near = true
				end
			end
			if near and countNear("vampire", p, 60) < 3 then
				NPCs.spawn("vampire", p + Vector3.new(rng:NextNumber(-25, 25), 0, rng:NextNumber(-25, 25)), id)
			end
		end
	end

	-- despawn what nobody is near
	for i = #list, 1, -1 do
		local npc = list[i]
		local near = false
		for _, player in Players:GetPlayers() do
			local _, root = PlayerState.humanoidOf(player)
			if root and (root.Position - npc.root.Position).Magnitude < DESPAWN_DIST then
				near = true
				break
			end
		end
		-- vampires burn away at sunrise unless they guard a nest
		local burns = npc.kind == "vampire" and not night and not npc.guard
		if (not near and not npc.heldBy) or burns or npc.root.Position.Y < -200 then
			if burns and near then
				fx:FireAllClients("burn", { pos = npc.root.Position })
			end
			npc.alive = false
			remove(npc)
			npc.model:Destroy()
		end
	end
end

---------------------------------------------------------------- lifecycle

function NPCs.init()
	fx = Net.event("Fx")
	folder = Instance.new("Folder")
	folder.Name = "NPCs"
	folder.Parent = workspace
	buildTemplates()
end

function NPCs.start()
	task.spawn(function()
		while true do
			local ok, err = pcall(populate)
			if not ok then
				warn("[NPCs] populate: " .. tostring(err))
			end
			task.wait(1.5)
		end
	end)

	local animAcc = 0
	RunService.Heartbeat:Connect(function(dt)
		local now = os.clock()
		for _, npc in list do
			if npc.alive and now >= npc.nextThink then
				npc.nextThink = now + 0.25
				local ok, err = pcall(think, npc, now)
				if not ok then
					warn("[NPCs] think: " .. tostring(err))
				end
				-- unstick: jump if trying to move but not moving
				local moved = (npc.root.Position - npc.lastPos).Magnitude
				npc.lastPos = npc.root.Position
				if npc.humanoid.MoveDirection.Magnitude > 0.1 and moved < 0.5 then
					npc.stuckTime += 0.25
					if npc.stuckTime > 0.75 then
						npc.humanoid.Jump = true
						npc.stuckTime = 0
					end
				else
					npc.stuckTime = 0
				end
			end
		end
		animAcc += dt
		if animAcc > 0.1 then
			animAcc = 0
			for _, npc in list do
				if npc.alive then
					animate(npc)
				end
			end
		end
	end)

	Bus.on("NPCKilled", function(_player: Player?, kind: string)
		if kind == "alpha" then
			workspace:SetAttribute("AlphaCooldown", true)
			task.delay(600, function()
				workspace:SetAttribute("AlphaCooldown", nil)
			end)
		end
	end)
end

return NPCs
