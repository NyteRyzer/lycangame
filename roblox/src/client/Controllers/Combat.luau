--!strict
-- Combat and transformation input. Plays the attack instantly on this client
-- for feel, then asks the server, which decides every hit.

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Lib = script.Parent.Parent.Lib
local ClientState = require(Lib.ClientState)
local Anim = require(Lib.Anim)
local Movement = require(script.Parent.Movement)

local player = Players.LocalPlayer

local Combat = {}

local attackRemote: RemoteEvent
local actionRemote: RemoteEvent
local transformRemote: RemoteEvent
local lightSide = 0
local lightReadyAt = 0
local heavyReadyAt = 0

local function form(): string
	local f = player:GetAttribute("Form")
	return if typeof(f) == "string" then f else "human"
end

local function aim(): Vector3
	return workspace.CurrentCamera.CFrame.LookVector
end

-- Square up to the camera so attacks go where you look.
local function faceAim()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		local look = aim()
		local flat = Vector3.new(look.X, 0, look.Z)
		if flat.Magnitude > 0.01 then
			root.CFrame = CFrame.lookAt(root.Position, root.Position + flat)
		end
	end
end

local function lunge(power: number)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		local look = aim()
		local flat = Vector3.new(look.X, 0, look.Z)
		if flat.Magnitude > 0.01 then
			root.AssemblyLinearVelocity += flat.Unit * power
		end
	end
end

local function blocked(): boolean
	return ClientState.menuOpen or player:GetAttribute("Transforming") == true
end

local function light()
	if blocked() then
		return
	end
	if player:GetAttribute("Holding") then
		Combat.throw()
		return
	end
	local t = os.clock()
	if t < lightReadyAt then
		return
	end
	lightReadyAt = t + Config.LIGHT_COOLDOWN
	lightSide = 1 - lightSide
	local character = player.Character
	if not character then
		return
	end
	faceAim()
	local f = form()
	Anim.swing(character, if f == "human" then "punch" else "claw", lightSide)
	lunge(if f == "wolf" then 26 elseif f == "hybrid" then 20 else 10)
	ClientState.attackLockUntil = t + 0.18
	attackRemote:FireServer("light", aim())
end

local function heavy()
	if blocked() then
		return
	end
	if player:GetAttribute("Holding") then
		Combat.throw()
		return
	end
	-- in the air as a monster: dive into a ground slam
	if Movement.startDive() then
		ClientState.shake(0.15)
		return
	end
	local t = os.clock()
	if t < heavyReadyAt then
		return
	end
	heavyReadyAt = t + Config.HEAVY_COOLDOWN
	local character = player.Character
	if not character then
		return
	end
	faceAim()
	Anim.swing(character, "heavy", 1)
	task.delay(0.2, function()
		lunge(if form() == "wolf" then 40 else 24)
		ClientState.shake(0.25)
	end)
	ClientState.attackLockUntil = t + 0.45
	attackRemote:FireServer("heavy", aim())
end

function Combat.throw()
	faceAim()
	actionRemote:FireServer("throw", aim())
	ClientState.shake(0.2)
end

function Combat.transform(target: string?)
	if ClientState.menuOpen then
		return
	end
	local f = form()
	local nextForm = target
	if not nextForm then
		local order = Config.FORM_ORDER
		local i = table.find(order, f :: any) or 1
		nextForm = order[i % #order + 1]
	end
	if nextForm == f then
		return
	end
	transformRemote:FireServer(nextForm)
end

local function bind(name: string, title: string?, fn: (Enum.UserInputState) -> (), ...: Enum.KeyCode | Enum.UserInputType)
	ContextActionService:BindAction(name, function(_, state)
		fn(state)
		return Enum.ContextActionResult.Pass
	end, title ~= nil, ...)
	if title then
		ContextActionService:SetTitle(name, title)
	end
end

local function onBegin(fn: () -> ()): (Enum.UserInputState) -> ()
	return function(state)
		if state == Enum.UserInputState.Begin then
			fn()
		end
	end
end

function Combat.start()
	attackRemote = Net.event("Attack")
	actionRemote = Net.event("Action")
	transformRemote = Net.event("Transform")

	bind("LycanLight", "Claw", onBegin(light), Enum.UserInputType.MouseButton1, Enum.KeyCode.ButtonX)
	bind("LycanHeavy", "Heavy", onBegin(heavy), Enum.UserInputType.MouseButton2, Enum.KeyCode.ButtonY)
	bind("LycanTransform", "Change", onBegin(function()
		Combat.transform(nil)
	end), Enum.KeyCode.F, Enum.KeyCode.DPadUp)
	bind("LycanForm1", nil, onBegin(function()
		Combat.transform("human")
	end), Enum.KeyCode.One)
	bind("LycanForm2", nil, onBegin(function()
		Combat.transform("hybrid")
	end), Enum.KeyCode.Two)
	bind("LycanForm3", nil, onBegin(function()
		Combat.transform("wolf")
	end), Enum.KeyCode.Three)
	bind("LycanHowl", "Howl", onBegin(function()
		if not blocked() and form() ~= "human" then
			local character = player.Character
			if character then
				Anim.howl(character)
			end
			actionRemote:FireServer("howl")
		end
	end), Enum.KeyCode.Q, Enum.KeyCode.DPadLeft)
	bind("LycanBlock", nil, function(state)
		if state == Enum.UserInputState.Begin and not blocked() then
			actionRemote:FireServer("block", true)
		elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
			actionRemote:FireServer("block", false)
		end
	end, Enum.KeyCode.X, Enum.KeyCode.ButtonL1)
	bind("LycanGrab", "Grab", onBegin(function()
		if not blocked() then
			if player:GetAttribute("Holding") then
				Combat.throw()
			else
				actionRemote:FireServer("grab")
			end
		end
	end), Enum.KeyCode.G, Enum.KeyCode.DPadRight)
	bind("LycanFinish", nil, onBegin(function()
		if not blocked() then
			actionRemote:FireServer("finish")
		end
	end), Enum.KeyCode.R, Enum.KeyCode.ButtonR1)
	bind("LycanFrenzy", nil, onBegin(function()
		if not blocked() then
			actionRemote:FireServer("frenzy")
		end
	end), Enum.KeyCode.Z, Enum.KeyCode.DPadDown)

	-- touch layout for mobile
	ContextActionService:SetPosition("LycanLight", UDim2.new(1, -110, 1, -170))
	ContextActionService:SetPosition("LycanHeavy", UDim2.new(1, -180, 1, -200))
	ContextActionService:SetPosition("LycanTransform", UDim2.new(1, -60, 1, -230))
	ContextActionService:SetPosition("LycanHowl", UDim2.new(1, -250, 1, -150))
	ContextActionService:SetPosition("LycanGrab", UDim2.new(1, -120, 1, -260))

	-- releasing block if the character dies mid-block
	player.CharacterAdded:Connect(function()
		actionRemote:FireServer("block", false)
	end)
end

return Combat
