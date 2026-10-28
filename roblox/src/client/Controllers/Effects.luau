--!strict
-- Every cosmetic effect the server broadcasts: damage numbers, blood and
-- sparks, tracers, shockwave rings, the transformation burst, howls, nest
-- explosions, attack telegraphs, and their sounds. Nothing here affects
-- gameplay.

local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Lib = script.Parent.Parent.Lib
local Anim = require(Lib.Anim)
local ClientState = require(Lib.ClientState)

local player = Players.LocalPlayer

local Effects = {}

local fxFolder: Folder

-- Built-in engine sounds (always available) with optional custom overrides.
local SFX = {
	swing = "rbxasset://sounds/swordslash.wav",
	heavy = "rbxasset://sounds/swordlunge.wav",
	hit = "rbxasset://sounds/collide.wav",
	gore = "rbxasset://sounds/splat.wav",
	shot = "rbxasset://sounds/Rocket shot.wav",
	land = "rbxasset://sounds/action_jump_land.mp3",
	collect = "rbxasset://sounds/electronicpingshort.wav",
	scream = "rbxasset://sounds/uuhhh.mp3",
	unsheath = "rbxasset://sounds/unsheath.wav",
	glass = "rbxasset://sounds/glassbreak.wav",
}

local function play(id: string, at: Vector3?, volume: number?, pitch: number?)
	if id == "" then
		return
	end
	local sound = Instance.new("Sound")
	sound.SoundId = id
	sound.Volume = volume or 0.6
	sound.PlaybackSpeed = pitch or 1
	if at then
		local anchor = Instance.new("Attachment")
		anchor.WorldPosition = at
		anchor.Parent = workspace.Terrain
		sound.RollOffMaxDistance = 300
		sound.Parent = anchor
		sound:Play()
		Debris:AddItem(anchor, 4)
	else
		sound.Parent = SoundService
		sound:Play()
		Debris:AddItem(sound, 4)
	end
end

local function custom(key: string, fallback: string): string
	local id = (Config.SOUNDS :: any)[key]
	return if typeof(id) == "string" and id ~= "" then id else fallback
end

local function burst(pos: Vector3, color: Color3, count: number, speed: number, size: number, lifetime: number?)
	local a = Instance.new("Attachment")
	a.WorldPosition = pos
	a.Parent = workspace.Terrain
	local e = Instance.new("ParticleEmitter")
	e.Color = ColorSequence.new(color)
	e.LightEmission = 0.2
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, size), NumberSequenceKeypoint.new(1, 0) })
	e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(1, 1) })
	e.Speed = NumberRange.new(speed * 0.5, speed)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Lifetime = NumberRange.new((lifetime or 0.6) * 0.6, lifetime or 0.6)
	e.Acceleration = Vector3.new(0, -60, 0)
	e.Drag = 3
	e.Rate = 0
	e.Parent = a
	e:Emit(count)
	Debris:AddItem(a, (lifetime or 0.6) + 0.5)
end

local function ring(pos: Vector3, radius: number, color: Color3, dur: number?)
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Cylinder
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Material = Enum.Material.Neon
	p.Color = color
	p.Transparency = 0.2
	p.Size = Vector3.new(0.4, 2, 2)
	p.CFrame = CFrame.new(pos + Vector3.new(0, 0.5, 0)) * CFrame.Angles(0, 0, math.pi / 2)
	p.Parent = fxFolder
	local t = dur or 0.45
	TweenService:Create(p, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.2, radius * 2, radius * 2),
		Transparency = 1,
	}):Play()
	Debris:AddItem(p, t + 0.1)
end

local function floatText(pos: Vector3, text: string, color: Color3, big: boolean?)
	local a = Instance.new("Attachment")
	a.WorldPosition = pos
	a.Parent = workspace.Terrain
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(if big then 220 else 120, if big then 60 else 40)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.StudsOffsetWorldSpace = Vector3.new(math.random(-10, 10) / 10, 0, 0)
	gui.Adornee = a
	gui.Parent = a
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.Text = text
	label.TextColor3 = color
	label.TextStrokeTransparency = 0.3
	label.Parent = gui
	TweenService:Create(gui, TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		StudsOffsetWorldSpace = gui.StudsOffsetWorldSpace + Vector3.new(0, 4, 0),
	}):Play()
	TweenService:Create(label, TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
		TextTransparency = 1,
		TextStrokeTransparency = 1,
	}):Play()
	Debris:AddItem(a, 1)
end

local function tracer(from: Vector3, to: Vector3, color: Color3)
	local len = (to - from).Magnitude
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Material = Enum.Material.Neon
	p.Color = color
	p.Size = Vector3.new(0.15, 0.15, len)
	p.CFrame = CFrame.lookAt((from + to) / 2, to)
	p.Parent = fxFolder
	TweenService:Create(p, TweenInfo.new(0.25), { Transparency = 1, Size = Vector3.new(0.02, 0.02, len) }):Play()
	Debris:AddItem(p, 0.3)
end

local function rootOf(model: any): BasePart?
	if typeof(model) ~= "Instance" or not model:IsA("Model") then
		return nil
	end
	local r = model:FindFirstChild("HumanoidRootPart")
	return if r and r:IsA("BasePart") then r else nil
end

local function distToMe(pos: Vector3): number
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return (root.Position - pos).Magnitude
	end
	return math.huge
end

local function telegraph(model: Model, text: string, color: Color3, time: number)
	local head = model:FindFirstChild("Head")
	if not head or not head:IsA("BasePart") then
		return
	end
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(46, 46)
	gui.StudsOffset = Vector3.new(0, 3, 0)
	gui.AlwaysOnTop = true
	gui.Adornee = head
	gui.Parent = fxFolder
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.Text = text
	label.TextColor3 = color
	label.TextStrokeTransparency = 0
	label.Parent = gui
	Debris:AddItem(gui, time)
end

local handlers: { [string]: (any) -> () } = {}

handlers.hit = function(d)
	local pos: Vector3 = d.pos
	local kind: string = d.kind
	local heavy = kind == "heavy" or kind == "finisher" or kind == "explosion"
	local color = if kind == "nest" then Color3.fromRGB(255, 60, 90) elseif heavy then Color3.fromRGB(255, 200, 80) else Color3.new(1, 1, 1)
	floatText(pos, tostring(d.amount), color, heavy)
	if d.blood then
		burst(pos, Color3.fromRGB(120, 0, 8), if heavy then 26 else 12, 30, 0.5)
	else
		burst(pos, if kind == "nest" then Color3.fromRGB(255, 40, 70) else Color3.fromRGB(120, 200, 80), 14, 30, 0.5)
	end
	burst(pos, Color3.fromRGB(255, 240, 200), 6, 50, 0.25, 0.25)
	play(if heavy then SFX.gore else SFX.hit, pos, if heavy then 0.8 else 0.5, 0.9 + math.random() * 0.3)
	if distToMe(pos) < 25 then
		ClientState.shake(if heavy then 0.22 else 0.08)
	end
end

handlers.swing = function(d)
	local model = d.character or d.model
	if typeof(model) ~= "Instance" or not model:IsA("Model") then
		return
	end
	local r = rootOf(model)
	if model ~= player.Character then
		Anim.swing(model, d.kind, d.side or 1)
	end
	if r then
		play(if d.kind == "heavy" then SFX.heavy else SFX.swing, r.Position, 0.4, 0.8 + math.random() * 0.4)
	end
end

handlers.transform = function(d)
	local r = rootOf(d.character)
	if not r then
		return
	end
	local beast = d.to ~= "human"
	local color = if beast then Color3.fromRGB(110, 80, 60) else Color3.fromRGB(200, 200, 220)
	burst(r.Position, color, 60, 40, 1.2, 1)
	burst(r.Position, Color3.fromRGB(255, 180, 60), 20, 20, 0.6, 0.8)
	ring(r.Position - Vector3.new(0, 2.5, 0), 20, Color3.fromRGB(255, 190, 90), 0.6)
	if beast then
		play(custom("roar", SFX.heavy), r.Position, 1, if d.to == "wolf" then 0.45 else 0.6)
	end
	if d.character == player.Character then
		ClientState.shake(if d.forced then 0.7 else 0.45)
		ClientState.kick(14)
	end
end

handlers.howl = function(d)
	local r = rootOf(d.character)
	if not r then
		return
	end
	if d.character ~= player.Character and d.character then
		Anim.howl(d.character)
	end
	ring(r.Position - Vector3.new(0, 2, 0), d.radius or 45, Color3.fromRGB(180, 200, 255), 0.9)
	ring(r.Position - Vector3.new(0, 2, 0), (d.radius or 45) * 0.6, Color3.fromRGB(140, 160, 255), 0.6)
	play(custom("howl", SFX.scream), r.Position, 1, 0.35)
	if distToMe(r.Position) < 60 then
		ClientState.shake(0.3)
	end
end

handlers.slam = function(d)
	ring(d.pos - Vector3.new(0, 2.5, 0), d.radius or 25, Color3.fromRGB(255, 200, 120), 0.5)
	burst(d.pos - Vector3.new(0, 2, 0), Color3.fromRGB(120, 110, 100), 40, 50, 1.4, 1)
	play(SFX.land, d.pos, 1, 0.5)
	local dist = distToMe(d.pos)
	if dist < 80 then
		ClientState.shake(math.clamp(1 - dist / 80, 0.2, 0.8))
	end
end

handlers.impact = function(d)
	burst(d.pos, Color3.fromRGB(140, 130, 120), 16, 30, 0.9, 0.7)
	if distToMe(d.pos) < 30 then
		ClientState.shake(0.15 * (d.power or 1))
	end
end

handlers.shot = function(d)
	tracer(d.from, d.to, if d.silver then Color3.fromRGB(220, 230, 255) else Color3.fromRGB(255, 220, 120))
	play(SFX.shot, d.from, 0.5, if d.silver then 1.4 else 1.1)
	burst(d.to, Color3.fromRGB(255, 230, 180), 6, 20, 0.3, 0.3)
end

handlers.parry = function(d)
	burst(d.pos + Vector3.new(0, 2, 0), Color3.fromRGB(255, 240, 150), 30, 60, 0.4, 0.4)
	floatText(d.pos + Vector3.new(0, 5, 0), "PARRY", Color3.fromRGB(255, 230, 120), true)
	play(SFX.unsheath, d.pos, 0.9, 1.3)
	if distToMe(d.pos) < 5 then
		ClientState.kick(10)
	end
end

handlers.block = function(d)
	burst(d.pos + Vector3.new(0, 2, 0), Color3.fromRGB(200, 200, 255), 10, 30, 0.3, 0.3)
	play(SFX.hit, d.pos, 0.5, 0.7)
end

handlers.dodge = function(d)
	floatText(d.pos + Vector3.new(0, 4, 0), "DODGE", Color3.fromRGB(150, 220, 255), false)
end

handlers.kill = function(d)
	if d.finisher and distToMe(d.pos) < 30 then
		ClientState.kick(18)
		ClientState.shake(0.5)
		floatText(d.pos + Vector3.new(0, 4, 0), "FINISHED", Color3.fromRGB(255, 80, 60), true)
	end
end

handlers.finisher = function(d)
	if d.character == player.Character then
		ClientState.kick(-12) -- a quick zoom-in punch
	end
	local r = rootOf(d.character)
	if r then
		play(SFX.heavy, r.Position, 1, 0.5)
	end
	if typeof(d.character) == "Instance" and d.character:IsA("Model") then
		Anim.swing(d.character, "heavy", 1)
	end
end

handlers.windup = function(d)
	if typeof(d.model) == "Instance" and d.model:IsA("Model") then
		telegraph(d.model, "!", Color3.fromRGB(255, 60, 40), d.time or 0.5)
	end
end

handlers.aim = function(d)
	if typeof(d.model) == "Instance" and d.model:IsA("Model") then
		telegraph(d.model, "◎", Color3.fromRGB(255, 220, 120), d.time or 0.5)
	end
end

handlers.stagger = function(d)
	if typeof(d.model) == "Instance" and d.model:IsA("Model") then
		telegraph(d.model, "✶", Color3.fromRGB(255, 255, 140), 1.2)
	end
end

handlers.blink = function(d)
	burst(d.from, Color3.fromRGB(90, 0, 20), 30, 20, 1.4, 0.8)
	burst(d.to, Color3.fromRGB(90, 0, 20), 30, 20, 1.4, 0.8)
end

handlers.roar = function(d)
	local r = rootOf(d.model)
	if r then
		play(custom("roar", SFX.heavy), r.Position, 0.9, 0.5)
	end
end

handlers.scream = function(d)
	local r = rootOf(d.model)
	if r and math.random() < 0.4 then
		play(SFX.scream, r.Position, 0.5, 1.2 + math.random() * 0.4)
	end
end

handlers.explode = function(d)
	local e = Instance.new("Explosion")
	e.Position = d.pos
	e.BlastRadius = 0
	e.BlastPressure = 0
	e.DestroyJointRadiusPercent = 0
	e.Parent = workspace
	ring(d.pos, d.radius or 20, d.color or Color3.fromRGB(255, 140, 40), 0.5)
	burst(d.pos, d.color or Color3.fromRGB(255, 140, 40), 50, 60, 2, 1)
	local dist = distToMe(d.pos)
	if dist < 100 then
		ClientState.shake(math.clamp(1 - dist / 100, 0.2, 0.9))
	end
end

handlers.collect = function(d)
	burst(d.pos, Color3.fromRGB(150, 210, 255), 30, 30, 0.6, 0.8)
	ring(d.pos, 10, Color3.fromRGB(150, 210, 255), 0.5)
	play(SFX.collect, nil, 0.7, 1)
end

handlers.survey = function(d)
	ring(d.pos, 120, Color3.fromRGB(255, 230, 160), 1.5)
	play(SFX.collect, nil, 0.7, 0.6)
end

handlers.burn = function(d)
	burst(d.pos, Color3.fromRGB(255, 120, 30), 40, 20, 1.2, 1.2)
end

handlers.frenzy = function(d)
	local character = d.character
	local r = rootOf(character)
	if not r then
		return
	end
	local untilT = if character == player.Character then player:GetAttribute("FrenzyUntil") else nil
	local dur = if typeof(untilT) == "number" then untilT - workspace:GetServerTimeNow() else 8
	local e = Instance.new("ParticleEmitter")
	e.Color = ColorSequence.new(Color3.fromRGB(255, 30, 30))
	e.LightEmission = 0.8
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1.2), NumberSequenceKeypoint.new(1, 0) })
	e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 1) })
	e.Rate = 40
	e.Lifetime = NumberRange.new(0.4, 0.8)
	e.Speed = NumberRange.new(4, 8)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Parent = r
	Debris:AddItem(e, math.max(1, dur))
	play(custom("roar", SFX.heavy), r.Position, 1, 0.4)
	if character == player.Character then
		ClientState.shake(0.6)
		ClientState.kick(16)
	end
end

handlers.dash = function(d)
	local r = rootOf(d.character)
	if r then
		burst(r.Position, Color3.fromRGB(200, 200, 220), 12, 10, 1, 0.4)
	end
end

handlers.grab = function(d)
	local r = rootOf(d.character)
	if r then
		play(SFX.unsheath, r.Position, 0.5, 0.6)
	end
end

handlers.throw = function(d)
	local r = rootOf(d.character)
	if r then
		play(SFX.heavy, r.Position, 0.7, 0.7)
	end
end

function Effects.burst(pos: Vector3, color: Color3, count: number)
	burst(pos, color, count, 30, 0.6)
end

function Effects.start()
	fxFolder = Instance.new("Folder")
	fxFolder.Name = "LycanFx"
	fxFolder.Parent = workspace
	Net.event("Fx").OnClientEvent:Connect(function(kind: string, data: any)
		local handler = handlers[kind]
		if handler and typeof(data) == "table" then
			local ok, err = pcall(handler, data)
			if not ok then
				warn("[Effects] " .. kind .. ": " .. tostring(err))
			end
		end
	end)
end

return Effects
