--!strict
-- Keen Senses (V): the world drains to grey and every heartbeat nearby glows
-- through walls, coloured by intent: red hunts you, orange may turn on you,
-- white is prey, green is game. Moonstones shimmer cyan.

local CollectionService = game:GetService("CollectionService")
local ContextActionService = game:GetService("ContextActionService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local ClientState = require(script.Parent.Parent.Lib.ClientState)

local player = Players.LocalPlayer

local Senses = {}

local RANGE = 260
local MAX_HIGHLIGHTS = 31 -- engine limit is 31 visible Highlights

local COLORS: { [string]: Color3 } = {
	vampire = Color3.fromRGB(255, 40, 60),
	ghoul = Color3.fromRGB(140, 255, 90),
	rival = Color3.fromRGB(255, 60, 40),
	alpha = Color3.fromRGB(255, 0, 0),
	hunter = Color3.fromRGB(255, 160, 40),
	police = Color3.fromRGB(80, 140, 255),
	civilian = Color3.fromRGB(240, 240, 240),
	deer = Color3.fromRGB(120, 220, 120),
}

local grade: ColorCorrectionEffect
local highlights: { Highlight } = {}

local function clear()
	for _, h in highlights do
		h:Destroy()
	end
	table.clear(highlights)
end

local function refresh()
	clear()
	if not ClientState.sensesOn then
		return
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return
	end
	local candidates: { { inst: Instance, d: number, color: Color3 } } = {}
	local npcs = workspace:FindFirstChild("NPCs")
	if npcs then
		for _, m in npcs:GetChildren() do
			local kind = m:GetAttribute("NPCType")
			local r = m:FindFirstChild("HumanoidRootPart")
			local h = m:FindFirstChildOfClass("Humanoid")
			if typeof(kind) == "string" and r and r:IsA("BasePart") and h and h.Health > 0 then
				local d = (r.Position - root.Position).Magnitude
				if d < RANGE then
					table.insert(candidates, { inst = m, d = d, color = COLORS[kind] or Color3.new(1, 1, 1) })
				end
			end
		end
	end
	local collected = tostring(player:GetAttribute("Moonstones") or "")
	for _, stone in CollectionService:GetTagged("Moonstone") do
		if stone:IsA("BasePart") and not string.find("," .. collected .. ",", "," .. stone.Name .. ",", 1, true) then
			local d = (stone.Position - root.Position).Magnitude
			if d < RANGE * 1.5 then
				table.insert(candidates, { inst = stone, d = d, color = Color3.fromRGB(120, 220, 255) })
			end
		end
	end
	table.sort(candidates, function(a, b)
		return a.d < b.d
	end)
	for i = 1, math.min(#candidates, MAX_HIGHLIGHTS) do
		local c = candidates[i]
		local h = Instance.new("Highlight")
		h.Adornee = c.inst
		h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
		h.FillColor = c.color
		h.FillTransparency = 0.55
		h.OutlineColor = c.color
		h.OutlineTransparency = 0
		h.Parent = c.inst
		table.insert(highlights, h)
	end
end

local function toggle()
	ClientState.sensesOn = not ClientState.sensesOn
	local on = ClientState.sensesOn
	TweenService:Create(grade, TweenInfo.new(0.35), {
		Saturation = if on then -0.85 else 0,
		Contrast = if on then 0.25 else 0,
		TintColor = if on then Color3.fromRGB(200, 210, 255) else Color3.new(1, 1, 1),
	}):Play()
	refresh()
end

-- Hide moonstones this player already collected.
local function hideCollected()
	local collected = "," .. tostring(player:GetAttribute("Moonstones") or "") .. ","
	for _, stone in CollectionService:GetTagged("Moonstone") do
		if stone:IsA("BasePart") then
			local got = string.find(collected, "," .. stone.Name .. ",", 1, true) ~= nil
			stone.LocalTransparencyModifier = if got then 1 else 0
			for _, d in stone:GetChildren() do
				if d:IsA("PointLight") or d:IsA("Sparkles") then
					d.Enabled = not got
				end
			end
		end
	end
end

function Senses.start()
	grade = Instance.new("ColorCorrectionEffect")
	grade.Name = "LycanSenses"
	grade.Parent = Lighting
	ContextActionService:BindAction("LycanSenses", function(_, state)
		if state == Enum.UserInputState.Begin and not ClientState.menuOpen then
			toggle()
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.KeyCode.V, Enum.KeyCode.ButtonR3)
	ContextActionService:SetTitle("LycanSenses", "Sense")
	ContextActionService:SetPosition("LycanSenses", UDim2.new(1, -60, 1, -300))
	player:GetAttributeChangedSignal("Moonstones"):Connect(hideCollected)
	hideCollected()
	task.spawn(function()
		while true do
			task.wait(0.5)
			if ClientState.sensesOn then
				refresh()
			end
		end
	end)
end

return Senses
