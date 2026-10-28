--!strict
-- Over-the-shoulder third-person camera layered on Roblox's default camera:
-- mouse-locked aiming, a shoulder offset and zoom that grow with the form,
-- speed-based FOV, wall-run roll, and trauma-based screen shake.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local ClientState = require(script.Parent.Parent.Lib.ClientState)

local player = Players.LocalPlayer

local CameraRig = {}

local BASE_FOV = 70
local roll = 0
local fov = BASE_FOV
local shoulder = 2
local noiseT = 0

local function form(): string
	local f = player:GetAttribute("Form")
	return if typeof(f) == "string" then f else "human"
end

local function update(dt: number)
	local cam = workspace.CurrentCamera
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return
	end
	local scale = (Config.FORMS[form() :: any] or Config.FORMS.human).scale

	-- lock the mouse for aiming unless a menu is open
	local touch = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	if not ClientState.menuOpen and not touch then
		UserInputService.MouseBehavior = Enum.MouseBehavior.LockCenter
		UserInputService.MouseIconEnabled = false
	else
		UserInputService.MouseIconEnabled = true
	end

	-- the closest zoom grows with body size
	player.CameraMinZoomDistance = 6 * scale

	-- shoulder offset (skipped when zoomed into first person)
	local dist = (cam.CFrame.Position - cam.Focus.Position).Magnitude
	local targetShoulder = if dist < 2 then 0 else 1.6 * scale
	shoulder += (targetShoulder - shoulder) * math.min(1, dt * 8)

	-- FOV from speed plus kicks
	local v = root.AssemblyLinearVelocity
	local speed = Vector3.new(v.X, 0, v.Z).Magnitude
	local targetFov = BASE_FOV + math.clamp((speed - 20) * 0.22, 0, 22) + ClientState.fovKick
	fov += (targetFov - fov) * math.min(1, dt * 6)
	ClientState.fovKick = math.max(0, ClientState.fovKick - dt * 30)
	cam.FieldOfView = fov

	-- wall-run roll
	local targetRoll = -ClientState.wallRunSide * math.rad(9)
	roll += (targetRoll - roll) * math.min(1, dt * 7)

	-- trauma shake
	noiseT += dt * 30
	local shake = ClientState.trauma * ClientState.trauma
	ClientState.trauma = math.max(0, ClientState.trauma - dt * 1.6)
	local sx = math.noise(noiseT, 1.3) * shake * math.rad(3)
	local sy = math.noise(noiseT, 7.1) * shake * math.rad(3)
	local sz = math.noise(noiseT, 13.7) * shake * math.rad(2)

	cam.CFrame = cam.CFrame * CFrame.new(shoulder, 0, 0) * CFrame.Angles(sx, sy, roll + sz)
end

function CameraRig.start()
	RunService:BindToRenderStep("LycanCamera", Enum.RenderPriority.Camera.Value + 1, update)
end

return CameraRig
