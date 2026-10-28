--!strict
-- The whole interface, built in code: vitals (form, health, rage, XP, combo,
-- flow), clock / moon / district / heat, the Monster-Protector morality bar,
-- the objective with a world beacon, toasts and banners, the finisher prompt,
-- frenzy and damage vignettes, the skills menu (Tab), the map (M), and the
-- controls card (H).

local ContextActionService = game:GetService("ContextActionService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Moon = require(Shared.Moon)
local Net = require(Shared.Net)
local WorldLayout = require(Shared.WorldLayout)
local ClientState = require(script.Parent.Parent.Lib.ClientState)

local player = Players.LocalPlayer

local HUD = {}

local FONT = Enum.Font.GothamBold
local FONT_TITLE = Enum.Font.Fantasy
local GOLD = Color3.fromRGB(230, 190, 110)
local PANEL = Color3.fromRGB(10, 10, 16)

local gui: ScreenGui
local refs: { [string]: any } = {}

---------------------------------------------------------------- helpers

local function new(class: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(class)
	for k, v in props do
		(inst :: any)[k] = v
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

local function corner(parent: Instance, r: number?)
	new("UICorner", { CornerRadius = UDim.new(0, r or 6) }, parent)
end

local function label(props: { [string]: any }, parent: Instance): TextLabel
	local base = {
		BackgroundTransparency = 1,
		Font = FONT,
		TextColor3 = Color3.new(1, 1, 1),
		TextStrokeTransparency = 0.6,
		TextXAlignment = Enum.TextXAlignment.Left,
	}
	for k, v in props do
		base[k] = v
	end
	return new("TextLabel", base, parent)
end

local function bar(parent: Instance, pos: UDim2, size: UDim2, color: Color3, name: string): Frame
	local back = new("Frame", {
		Name = name,
		Position = pos,
		Size = size,
		BackgroundColor3 = Color3.fromRGB(20, 20, 26),
		BackgroundTransparency = 0.2,
		BorderSizePixel = 0,
	}, parent)
	corner(back, 4)
	local fill = new("Frame", {
		Name = "Fill",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = color,
		BorderSizePixel = 0,
	}, back)
	corner(fill, 4)
	return back
end

local function setBar(b: Frame, frac: number)
	local fill = b:FindFirstChild("Fill") :: Frame?
	if fill then
		fill.Size = UDim2.fromScale(math.clamp(frac, 0, 1), 1)
	end
end

local function attr(name: string, default: any): any
	local v = player:GetAttribute(name)
	return if v == nil then default else v
end

---------------------------------------------------------------- build

local function buildVitals()
	local panel = new("Frame", {
		Name = "Vitals",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 20, 1, -20),
		Size = UDim2.fromOffset(330, 150),
		BackgroundTransparency = 1,
	}, gui)
	refs.form = label({ Text = "HUMAN", Font = FONT_TITLE, TextSize = 34, TextColor3 = GOLD, Size = UDim2.fromOffset(240, 36) }, panel)
	refs.pips = new("Frame", { Position = UDim2.fromOffset(250, 10), Size = UDim2.fromOffset(80, 16), BackgroundTransparency = 1 }, panel)
	new("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6) }, refs.pips)
	for i, key in Config.FORM_ORDER do
		local pip = new("Frame", { Name = key, LayoutOrder = i, Size = UDim2.fromOffset(16, 16), BackgroundColor3 = Color3.fromRGB(80, 80, 90), BorderSizePixel = 0 }, refs.pips)
		corner(pip, 8)
	end
	refs.hp = bar(panel, UDim2.fromOffset(0, 42), UDim2.fromOffset(320, 20), Color3.fromRGB(190, 30, 40), "HP")
	refs.hpText = label({ Text = "", TextSize = 13, Size = UDim2.fromScale(1, 1), Position = UDim2.fromOffset(8, 0) }, refs.hp)
	refs.rage = bar(panel, UDim2.fromOffset(0, 68), UDim2.fromOffset(320, 12), Color3.fromRGB(240, 120, 30), "Rage")
	label({ Text = "RAGE  (Z: Frenzy when full)", TextSize = 10, Size = UDim2.fromScale(1, 1), Position = UDim2.fromOffset(6, 0) }, refs.rage)
	refs.flow = bar(panel, UDim2.fromOffset(0, 84), UDim2.fromOffset(320, 6), Color3.fromRGB(120, 200, 255), "Flow")
	refs.xp = bar(panel, UDim2.fromOffset(0, 96), UDim2.fromOffset(320, 6), Color3.fromRGB(200, 170, 255), "XP")
	refs.level = label({ Text = "LV 1", TextSize = 16, TextColor3 = GOLD, Position = UDim2.fromOffset(0, 108), Size = UDim2.fromOffset(320, 20) }, panel)
	refs.combo = label({
		Text = "",
		Font = FONT_TITLE,
		TextSize = 44,
		TextColor3 = Color3.fromRGB(255, 200, 80),
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -30, 0.55, 0),
		Size = UDim2.fromOffset(260, 60),
		TextXAlignment = Enum.TextXAlignment.Right,
	}, gui)
end

local function buildWorldInfo()
	local panel = new("Frame", {
		Name = "WorldInfo",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -20, 0, 20),
		Size = UDim2.fromOffset(260, 100),
		BackgroundTransparency = 1,
	}, gui)
	local right = Enum.TextXAlignment.Right
	refs.clock = label({ Text = "20:30", Font = FONT_TITLE, TextSize = 32, TextXAlignment = right, Size = UDim2.new(1, 0, 0, 34) }, panel)
	refs.moon = label({ Text = "", TextSize = 14, TextColor3 = Color3.fromRGB(190, 200, 255), TextXAlignment = right, Position = UDim2.fromOffset(0, 34), Size = UDim2.new(1, 0, 0, 18) }, panel)
	refs.district = label({ Text = "", TextSize = 14, TextColor3 = GOLD, TextXAlignment = right, Position = UDim2.fromOffset(0, 54), Size = UDim2.new(1, 0, 0, 18) }, panel)
	refs.heat = label({ Text = "", TextSize = 20, TextColor3 = Color3.fromRGB(255, 70, 60), TextXAlignment = right, Position = UDim2.fromOffset(0, 74), Size = UDim2.new(1, 0, 0, 22) }, panel)
end

local function buildMorality()
	local panel = new("Frame", {
		Name = "Morality",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 14),
		Size = UDim2.fromOffset(360, 56),
		BackgroundTransparency = 1,
	}, gui)
	refs.title = label({ Text = "Wanderer", Font = FONT_TITLE, TextSize = 24, TextColor3 = GOLD, TextXAlignment = Enum.TextXAlignment.Center, Size = UDim2.new(1, 0, 0, 26) }, panel)
	local track = new("Frame", { Position = UDim2.fromOffset(0, 30), Size = UDim2.new(1, 0, 0, 8), BorderSizePixel = 0 }, panel)
	corner(track, 4)
	new("UIGradient", { Color = ColorSequence.new(Color3.fromRGB(170, 20, 30), Color3.fromRGB(80, 160, 255)) }, track)
	refs.moralityMarker = new("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(6, 16), BackgroundColor3 = Color3.new(1, 1, 1), BorderSizePixel = 0 }, track)
	label({ Text = "MONSTER", TextSize = 10, TextColor3 = Color3.fromRGB(220, 90, 90), Position = UDim2.fromOffset(0, 40), Size = UDim2.fromOffset(100, 14) }, panel)
	label({ Text = "PROTECTOR", TextSize = 10, TextColor3 = Color3.fromRGB(120, 180, 255), TextXAlignment = Enum.TextXAlignment.Right, AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, 0, 0, 40), Size = UDim2.fromOffset(100, 14) }, panel)
end

local function buildObjective()
	local box = new("Frame", {
		Name = "Objective",
		Position = UDim2.new(0, 20, 0, 120),
		Size = UDim2.fromOffset(330, 70),
		BackgroundColor3 = PANEL,
		BackgroundTransparency = 0.45,
		BorderSizePixel = 0,
	}, gui)
	corner(box)
	new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), PaddingTop = UDim.new(0, 6) }, box)
	label({ Text = "OBJECTIVE", TextSize = 11, TextColor3 = GOLD, Size = UDim2.new(1, 0, 0, 14) }, box)
	refs.objective = label({ Text = "", TextSize = 14, TextWrapped = true, Position = UDim2.fromOffset(0, 16), Size = UDim2.new(1, 0, 0, 36), TextYAlignment = Enum.TextYAlignment.Top }, box)
	refs.objectiveDist = label({ Text = "", TextSize = 11, TextColor3 = Color3.fromRGB(180, 180, 190), Position = UDim2.fromOffset(0, 50), Size = UDim2.new(1, 0, 0, 14) }, box)
	refs.moonstones = label({ Text = "", TextSize = 12, TextColor3 = Color3.fromRGB(150, 210, 255), Position = UDim2.new(0, 20, 0, 196), Size = UDim2.fromOffset(300, 16) }, gui)
end

local function buildCenter()
	refs.crosshair = new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(6, 6),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BackgroundTransparency = 0.3,
		BorderSizePixel = 0,
	}, gui)
	corner(refs.crosshair, 3)
	refs.prompt = label({
		Text = "",
		TextSize = 18,
		TextColor3 = Color3.fromRGB(255, 90, 70),
		TextXAlignment = Enum.TextXAlignment.Center,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.5, 40),
		Size = UDim2.fromOffset(300, 24),
	}, gui)
	refs.banner = label({
		Text = "",
		Font = FONT_TITLE,
		TextSize = 40,
		TextColor3 = GOLD,
		TextTransparency = 1,
		TextStrokeTransparency = 1,
		TextXAlignment = Enum.TextXAlignment.Center,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.3),
		Size = UDim2.new(0.9, 0, 0, 50),
	}, gui)
	refs.toasts = new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 80),
		Size = UDim2.fromOffset(500, 200),
		BackgroundTransparency = 1,
	}, gui)
	new("UIListLayout", { HorizontalAlignment = Enum.HorizontalAlignment.Center, Padding = UDim.new(0, 4) }, refs.toasts)
	refs.vignette = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(160, 0, 0), BackgroundTransparency = 1, BorderSizePixel = 0, ZIndex = 0 }, gui)
	refs.frenzy = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(120, 0, 10), BackgroundTransparency = 1, BorderSizePixel = 0, ZIndex = 0 }, gui)
	refs.sleep = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 1, BorderSizePixel = 0, ZIndex = 20 }, gui)
	label({ Text = "H: controls   Tab: skills   M: map", TextSize = 12, TextColor3 = Color3.fromRGB(160, 160, 170), AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -20, 1, -10), Size = UDim2.fromOffset(300, 16), TextXAlignment = Enum.TextXAlignment.Right }, gui)
end

local function overlay(name: string, title: string): Frame
	local frame = new("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(640, 460),
		BackgroundColor3 = PANEL,
		BackgroundTransparency = 0.08,
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 10,
	}, gui)
	corner(frame, 10)
	new("UIStroke", { Color = GOLD, Thickness = 1.5, Transparency = 0.4 }, frame)
	label({ Text = title, Font = FONT_TITLE, TextSize = 30, TextColor3 = GOLD, TextXAlignment = Enum.TextXAlignment.Center, Size = UDim2.new(1, 0, 0, 44), ZIndex = 11 }, frame)
	return frame
end

local function buildSkills()
	local frame = overlay("Skills", "THE WOLF WITHIN")
	refs.skills = frame
	refs.skillPoints = label({ Text = "", TextSize = 14, TextColor3 = Color3.fromRGB(200, 170, 255), TextXAlignment = Enum.TextXAlignment.Center, Position = UDim2.fromOffset(0, 40), Size = UDim2.new(1, 0, 0, 18), ZIndex = 11 }, frame)
	local grid = new("Frame", { Position = UDim2.fromOffset(20, 66), Size = UDim2.new(1, -40, 1, -86), BackgroundTransparency = 1, ZIndex = 11 }, frame)
	new("UIGridLayout", { CellSize = UDim2.new(0.333, -8, 0, 112), CellPadding = UDim2.fromOffset(10, 10), SortOrder = Enum.SortOrder.LayoutOrder }, grid)
	refs.skillButtons = {}
	for i, id in Config.SKILL_ORDER do
		local def = Config.SKILLS[id]
		local b = new("TextButton", { LayoutOrder = i, Text = "", AutoButtonColor = true, BackgroundColor3 = Color3.fromRGB(28, 26, 36), BorderSizePixel = 0, ZIndex = 11 }, grid)
		corner(b)
		label({ Name = "Name", Text = def.name, TextSize = 15, TextColor3 = GOLD, Position = UDim2.fromOffset(8, 6), Size = UDim2.new(1, -16, 0, 18), ZIndex = 12 }, b)
		label({ Name = "Rank", Text = "", TextSize = 12, Position = UDim2.fromOffset(8, 24), Size = UDim2.new(1, -16, 0, 14), ZIndex = 12, TextColor3 = Color3.fromRGB(200, 170, 255) }, b)
		label({ Text = def.desc, TextSize = 11, TextWrapped = true, TextYAlignment = Enum.TextYAlignment.Top, Position = UDim2.fromOffset(8, 42), Size = UDim2.new(1, -16, 1, -46), ZIndex = 12, TextColor3 = Color3.fromRGB(200, 200, 205) }, b)
		b.MouseButton1Click:Connect(function()
			Net.event("Action"):FireServer("skill", id)
		end)
		refs.skillButtons[id] = b
	end
end

local CONTROLS = {
	{ "F / 1 2 3", "Transform (human · hybrid · beast)" },
	{ "Shift", "Sprint (beasts build up to a gallop)" },
	{ "Space", "Jump · air-jump · wall-jump (monster forms)" },
	{ "Run at a wall", "Climb (hybrid / beast); top out to mantle" },
	{ "Sprint past a wall", "Wall-run" },
	{ "C / Ctrl", "Dash (dodge window)" },
	{ "Left click", "Claw / punch combo (3rd hit staggers)" },
	{ "Right click", "Heavy blow · in the air: ground slam" },
	{ "X (hold)", "Block · tap right before a hit to parry" },
	{ "G", "Grab people or props · G / click to throw" },
	{ "R", "Finisher on a staggered / weakened enemy" },
	{ "Q", "Howl (stuns, scatters, buffs rage)" },
	{ "Z", "Frenzy when rage is full" },
	{ "V", "Keen Senses (see through walls)" },
	{ "E", "Interact (vantages, shrine, safehouse bed)" },
}

local function buildHelp()
	local frame = overlay("Help", "CONTROLS")
	refs.help = frame
	local list = new("Frame", { Position = UDim2.fromOffset(30, 54), Size = UDim2.new(1, -60, 1, -70), BackgroundTransparency = 1, ZIndex = 11 }, frame)
	new("UIListLayout", { Padding = UDim.new(0, 2) }, list)
	for _, row in CONTROLS do
		local r = new("Frame", { Size = UDim2.new(1, 0, 0, 24), BackgroundTransparency = 1, ZIndex = 11 }, list)
		label({ Text = row[1], TextSize = 14, TextColor3 = GOLD, Size = UDim2.new(0.35, 0, 1, 0), ZIndex = 12 }, r)
		label({ Text = row[2], TextSize = 14, Position = UDim2.fromScale(0.35, 0), Size = UDim2.new(0.65, 0, 1, 0), ZIndex = 12 }, r)
	end
end

local MAP_SIZE = 420

local function toMap(pos: Vector3): UDim2
	local H = WorldLayout.HALF
	return UDim2.fromOffset((pos.X + H) / (2 * H) * MAP_SIZE, (pos.Z + H) / (2 * H) * MAP_SIZE)
end

local function buildMap()
	local frame = overlay("Map", "GREYHAVEN")
	frame.Size = UDim2.fromOffset(MAP_SIZE + 40, MAP_SIZE + 70)
	refs.map = frame
	local canvas = new("Frame", { Position = UDim2.fromOffset(20, 50), Size = UDim2.fromOffset(MAP_SIZE, MAP_SIZE), BackgroundColor3 = Color3.fromRGB(34, 52, 36), BorderSizePixel = 0, ClipsDescendants = true, ZIndex = 11 }, frame)
	refs.mapCanvas = canvas
	local H = WorldLayout.HALF
	local function rect(cx: number, cz: number, w: number, h: number, color: Color3, round: boolean?)
		local f = new("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = toMap(Vector3.new(cx, 0, cz)),
			Size = UDim2.fromOffset(w / (2 * H) * MAP_SIZE, h / (2 * H) * MAP_SIZE),
			BackgroundColor3 = color,
			BorderSizePixel = 0,
			ZIndex = 12,
		}, canvas)
		if round then
			corner(f, 200)
		end
	end
	rect(0, (WorldLayout.MOUNTAIN_Z - H) / 2, 2 * H, WorldLayout.MOUNTAIN_Z + H, Color3.fromRGB(90, 88, 92))
	local C = WorldLayout.CITY_HALF
	rect(0, 0, 2 * C, 2 * C, Color3.fromRGB(60, 60, 66))
	rect(WorldLayout.LAKE.x, WorldLayout.LAKE.z, WorldLayout.LAKE.r * 2, WorldLayout.LAKE.r * 2, Color3.fromRGB(40, 80, 130), true)
	for name, pos in WorldLayout.LANDMARKS do
		label({ Text = "◆ " .. name:upper(), TextSize = 10, TextColor3 = GOLD, AnchorPoint = Vector2.new(0.5, 0.5), Position = toMap(pos), Size = UDim2.fromOffset(120, 14), TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 13 }, canvas)
	end
	for _, n in WorldLayout.NESTS do
		label({ Text = "✖", TextSize = 14, TextColor3 = Color3.fromRGB(255, 40, 60), AnchorPoint = Vector2.new(0.5, 0.5), Position = toMap(n.pos), Size = UDim2.fromOffset(20, 20), TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 13 }, canvas)
	end
	refs.mapPlayer = label({ Text = "▲", TextSize = 16, TextColor3 = Color3.fromRGB(255, 255, 255), AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.fromOffset(20, 20), TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 14 }, canvas)
	refs.mapObjective = label({ Text = "★", TextSize = 18, TextColor3 = Color3.fromRGB(255, 220, 90), AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.fromOffset(20, 20), TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 14 }, canvas)
end

---------------------------------------------------------------- beacon

local beacon: BasePart? = nil

local function updateBeacon(target: Vector3?)
	if not target then
		if beacon then
			beacon.Parent = nil
		end
		return
	end
	if not beacon then
		local p = Instance.new("Part")
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.Material = Enum.Material.Neon
		p.Color = Color3.fromRGB(255, 220, 120)
		p.Transparency = 0.55
		p.Size = Vector3.new(2, 400, 2)
		p.CastShadow = false
		beacon = p
	end
	local b = beacon :: BasePart
	b.CFrame = CFrame.new(target + Vector3.new(0, 200, 0))
	b.Parent = workspace
end

---------------------------------------------------------------- notifications

local function toast(text: string, color: Color3?)
	local l = label({
		Text = text,
		TextSize = 16,
		TextColor3 = color or Color3.new(1, 1, 1),
		TextXAlignment = Enum.TextXAlignment.Center,
		BackgroundColor3 = PANEL,
		BackgroundTransparency = 0.45,
		Size = UDim2.fromOffset(500, 26),
	}, refs.toasts)
	corner(l)
	task.delay(3.5, function()
		TweenService:Create(l, TweenInfo.new(0.5), { TextTransparency = 1, BackgroundTransparency = 1 }):Play()
		task.wait(0.5)
		l:Destroy()
	end)
end

local bannerToken = 0
local function banner(text: string)
	bannerToken += 1
	local token = bannerToken
	local b: TextLabel = refs.banner
	b.Text = text
	b.TextTransparency = 0
	b.TextStrokeTransparency = 0.4
	task.delay(3, function()
		if token == bannerToken then
			TweenService:Create(b, TweenInfo.new(0.8), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
		end
	end)
end

local function flash(frame: Frame, transparency: number, dur: number)
	frame.BackgroundTransparency = transparency
	TweenService:Create(frame, TweenInfo.new(dur), { BackgroundTransparency = 1 }):Play()
end

---------------------------------------------------------------- menus

local function setMenu(which: string?)
	for _, name in { "skills", "help", "map" } do
		local f: Frame = refs[name]
		f.Visible = name == which and not f.Visible
	end
	ClientState.menuOpen = refs.skills.Visible or refs.help.Visible or refs.map.Visible
	if ClientState.menuOpen then
		UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	end
end

---------------------------------------------------------------- update

local function finishableNear(root: BasePart): boolean
	local npcs = workspace:FindFirstChild("NPCs")
	if not npcs or player:GetAttribute("Form") == "human" then
		return false
	end
	local form = Config.FORMS[(player:GetAttribute("Form") :: any) or "human"]
	for _, m in npcs:GetChildren() do
		local kind = m:GetAttribute("NPCType")
		if kind and kind ~= "civilian" and kind ~= "alpha" and m:IsA("Model") then
			local h = m:FindFirstChildOfClass("Humanoid")
			local r = m:FindFirstChild("HumanoidRootPart")
			if h and r and r:IsA("BasePart") and h.Health > 0 and h.Health <= h.MaxHealth * Config.FINISH_THRESHOLD then
				if (r.Position - root.Position).Magnitude < form.reach + 2 then
					return true
				end
			end
		end
	end
	return false
end

local lastHealth = 0
local promptAcc = 0

local function update(dt: number)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")

	local form: string = attr("Form", "human")
	local stats = Config.FORMS[form :: any] or Config.FORMS.human
	refs.form.Text = if attr("Transforming", false) then "· CHANGING ·" else stats.name
	for _, pip in refs.pips:GetChildren() do
		if pip:IsA("Frame") then
			pip.BackgroundColor3 = if pip.Name == form then GOLD else Color3.fromRGB(70, 70, 80)
		end
	end

	if humanoid then
		setBar(refs.hp, humanoid.Health / math.max(1, humanoid.MaxHealth))
		refs.hpText.Text = string.format("%d / %d", math.ceil(humanoid.Health), humanoid.MaxHealth)
		if humanoid.Health < lastHealth - 0.5 then
			flash(refs.vignette, 0.65, 0.4)
		end
		lastHealth = humanoid.Health
	end
	setBar(refs.rage, attr("Rage", 0) / Config.RAGE_MAX)
	setBar(refs.flow, ClientState.flow)
	local xpNext = attr("XPNext", 100)
	setBar(refs.xp, attr("XP", 0) / math.max(1, xpNext))
	local sp = attr("SkillPoints", 0)
	refs.level.Text = string.format("LV %d%s", attr("Level", 1), if sp > 0 then string.format("   ·   %d skill point%s (Tab)", sp, if sp == 1 then "" else "s") else "")
	local combo = attr("Combo", 0)
	refs.combo.Text = if combo >= 3 then combo .. " HITS" else ""

	-- world info
	local clock = Lighting.ClockTime
	local day = (workspace:GetAttribute("Day") :: number?) or 1
	refs.clock.Text = Moon.formatClock(clock)
	local full = Moon.isFullMoon(day, clock)
	refs.moon.Text = string.format("Night %d  ·  %s", Moon.nightIndex(day, clock), Moon.phaseName(day, clock))
	refs.moon.TextColor3 = if full then Color3.fromRGB(255, 220, 120) else Color3.fromRGB(190, 200, 255)
	if root and root:IsA("BasePart") then
		refs.district.Text = WorldLayout.district(root.Position)
	end
	local heat = attr("Heat", 0)
	refs.heat.Text = if heat >= 0.5 then string.rep("★", math.clamp(math.floor(heat + 0.5), 1, 5)) else ""

	-- morality
	local morality = attr("Morality", 0)
	refs.moralityMarker.Position = UDim2.fromScale((morality + 100) / 200, 0.5)
	refs.title.Text = attr("Title", "Wanderer")

	-- objective
	refs.objective.Text = attr("Objective", "")
	local target = player:GetAttribute("EventTarget") or player:GetAttribute("ObjectiveTarget")
	if typeof(target) == "Vector3" and root and root:IsA("BasePart") then
		refs.objectiveDist.Text = string.format("%d m  ·  follow the golden beacon", math.floor((target - root.Position).Magnitude * 0.28))
		updateBeacon(target)
		refs.mapObjective.Visible = true
		refs.mapObjective.Position = toMap(target)
	else
		refs.objectiveDist.Text = ""
		updateBeacon(nil)
		refs.mapObjective.Visible = false
	end
	refs.moonstones.Text = string.format("Moonstones %d / 40", attr("MoonstoneCount", 0))

	-- finisher prompt
	promptAcc += dt
	if promptAcc > 0.15 then
		promptAcc = 0
		refs.prompt.Text = if root and root:IsA("BasePart") and finishableNear(root) then "[R] FINISH" else ""
	end

	-- frenzy tint
	local frenzyUntil = attr("FrenzyUntil", 0)
	local frenzied = workspace:GetServerTimeNow() < frenzyUntil
	refs.frenzy.BackgroundTransparency = if frenzied then 0.82 + math.sin(os.clock() * 6) * 0.04 else 1

	-- skills menu
	if refs.skills.Visible then
		refs.skillPoints.Text = string.format("%d skill point%s to spend", sp, if sp == 1 then "" else "s")
		for id, b in refs.skillButtons do
			local rank = attr("Skill_" .. id, 0)
			local def = Config.SKILLS[id]
			b.Rank.Text = string.format("Rank %d / %d", rank, def.max)
			b.BackgroundColor3 = if rank >= def.max then Color3.fromRGB(46, 38, 20) elseif sp > 0 then Color3.fromRGB(36, 30, 52) else Color3.fromRGB(28, 26, 36)
		end
	end
	if refs.map.Visible and root and root:IsA("BasePart") then
		refs.mapPlayer.Position = toMap(root.Position)
		local look = root.CFrame.LookVector
		refs.mapPlayer.Rotation = math.deg(math.atan2(look.X, -look.Z))
	end
end

---------------------------------------------------------------- lifecycle

function HUD.start()
	local playerGui = player:WaitForChild("PlayerGui")
	gui = new("ScreenGui", { Name = "LycanHUD", ResetOnSpawn = false, IgnoreGuiInset = true, ZIndexBehavior = Enum.ZIndexBehavior.Sibling }, playerGui)
	buildVitals()
	buildWorldInfo()
	buildMorality()
	buildObjective()
	buildCenter()
	buildSkills()
	buildHelp()
	buildMap()

	Net.event("Notify").OnClientEvent:Connect(function(kind: string, text: string)
		if typeof(text) ~= "string" then
			return
		end
		if kind == "toast" then
			toast(text)
		elseif kind == "banner" or kind == "objective" then
			banner(text)
		elseif kind == "event" then
			banner("WORLD EVENT")
			toast(text, Color3.fromRGB(255, 120, 100))
		elseif kind == "sleep" then
			toast(text)
			refs.sleep.BackgroundTransparency = 1
			TweenService:Create(refs.sleep, TweenInfo.new(1.2), { BackgroundTransparency = 0 }):Play()
			task.delay(1.6, function()
				TweenService:Create(refs.sleep, TweenInfo.new(1.2), { BackgroundTransparency = 1 }):Play()
			end)
		elseif kind == "hurt" then
			ClientState.shake(0.12)
		end
	end)

	ContextActionService:BindAction("LycanSkills", function(_, state)
		if state == Enum.UserInputState.Begin then
			setMenu("skills")
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.Tab, Enum.KeyCode.K, Enum.KeyCode.ButtonSelect)
	ContextActionService:BindAction("LycanHelp", function(_, state)
		if state == Enum.UserInputState.Begin then
			setMenu("help")
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.H)
	ContextActionService:BindAction("LycanMap", function(_, state)
		if state == Enum.UserInputState.Begin then
			setMenu("map")
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.M)

	-- first-time hint
	task.delay(2, function()
		banner("LYCAN")
		toast("You are cursed. Press F to let the wolf out. H shows the controls.")
	end)

	-- transformation flash for the local player
	player:GetAttributeChangedSignal("Transforming"):Connect(function()
		if player:GetAttribute("Transforming") then
			flash(refs.vignette, 0.5, 0.8)
		end
	end)

	RunService.RenderStepped:Connect(update)
end

return HUD
